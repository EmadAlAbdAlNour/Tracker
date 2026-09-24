import { db, driversTable, usersTable, shiftsTable, devicesTable, locationPointsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getRestaurantSettings, getAlertSettings } from "./settingsService";
import { calculateDistanceMeters, evaluateDriverOfflineAlert } from "./alertService";
import { maybeRunRetentionCleanup } from "./retentionService";

export interface FleetDriverLiveStatus {
  driverId: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string | null;
  employeeId: string;
  driverActive: boolean;
  userId: string;
  // Shift info
  shift: {
    id: string;
    status: "ACTIVE" | "COMPLETED";
    startedAt: string;
    durationMinutes: number;
  } | null;
  // Latest Location
  location: {
    id: string;
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    accuracy: number | null;
    altitude: number | null;
    recordedAt: string;
    receivedAt: string;
  } | null;
  // Device & Telemetry
  device: {
    id: string;
    platform: string;
    appVersion: string | null;
    deviceIdentifier: string | null;
    authorized: boolean;
    batteryPercentage: number | null;
    isCharging: boolean | null;
    locationServicesEnabled: boolean | null;
    networkStatus: string | null;
    lastSeen: string | null;
  } | null;
  // Computed Status
  operationalStatus: "AT_RESTAURANT" | "MOVING" | "STOPPED" | "OFFLINE";
  isInsideGeofence: boolean;
  distanceToRestaurantMeters: number | null;
}

export interface LiveFleetResponse {
  summary: {
    totalDrivers: number;
    activeShifts: number;
    onlineDrivers: number;
    atRestaurant: number;
    moving: number;
    stopped: number;
    offline: number;
    lowBatteryCount: number;
  };
  restaurant: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    enabled: boolean;
  };
  drivers: FleetDriverLiveStatus[];
}

export function computeOperationalStatus(params: {
  hasActiveShift: boolean;
  isOnline: boolean;
  isInsideGeofence: boolean;
  location: { recorded_at?: string | Date | null; speed?: number | string | null } | null;
  now?: number;
}): "AT_RESTAURANT" | "MOVING" | "STOPPED" | "OFFLINE" {
  const { hasActiveShift, isOnline, isInsideGeofence, location, now = Date.now() } = params;

  if (!hasActiveShift || !isOnline) {
    return "OFFLINE";
  }

  if (isInsideGeofence || !location) {
    return "AT_RESTAURANT";
  }

  const locationAgeMs = location.recorded_at ? (now - new Date(location.recorded_at).getTime()) : Infinity;
  const isLocationFresh = locationAgeMs <= (5 * 60 * 1000); // 5 minutes freshness threshold
  const speed = (isLocationFresh && location.speed != null) ? Number(location.speed) : 0;

  if (speed >= 1.0) {
    return "MOVING";
  }

  return "STOPPED";
}

export async function getLiveFleetStatus(options?: { activeOnly?: boolean }): Promise<LiveFleetResponse> {
  const [restaurantSettings, alertSettings] = await Promise.all([
    getRestaurantSettings(),
    getAlertSettings(),
  ]);

  // Non-blocking hourly retention cleanup for location points older than 48 hours
  maybeRunRetentionCleanup().catch((err) => {
    console.error("Retention cleanup error in fleetService:", err);
  });

  // Fetch all drivers with their associated user
  const driverRows = await db
    .select({
      driverId: driversTable.id,
      employeeId: driversTable.employeeId,
      driverActive: driversTable.active,
      userId: usersTable.id,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
      userActive: usersTable.active,
    })
    .from(driversTable)
    .innerJoin(usersTable, eq(driversTable.userId, usersTable.id));

  if (driverRows.length === 0) {
    return {
      summary: {
        totalDrivers: 0,
        activeShifts: 0,
        onlineDrivers: 0,
        atRestaurant: 0,
        moving: 0,
        stopped: 0,
        offline: 0,
        lowBatteryCount: 0,
      },
      restaurant: {
        name: restaurantSettings.name,
        latitude: restaurantSettings.latitude,
        longitude: restaurantSettings.longitude,
        radiusMeters: restaurantSettings.radiusMeters,
        enabled: restaurantSettings.enabled,
      },
      drivers: [],
    };
  }

  const driverIds = driverRows.map((d) => d.driverId);

  // Fetch active shifts for these drivers
  const activeShifts = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.status, "ACTIVE")));

  const shiftMap = new Map<string, (typeof activeShifts)[0]>();
  for (const s of activeShifts) {
    shiftMap.set(s.driverId, s);
  }

  // Fetch authorized devices for these drivers
  const devices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.authorized, true));

  const deviceMap = new Map<string, (typeof devices)[0]>();
  for (const dev of devices) {
    deviceMap.set(dev.driverId, dev);
  }

  // Fetch latest location per driver using DISTINCT ON (driver_id)
  let latestLocations: any[] = [];
  try {
    const locResult = await db.execute(sql`
      SELECT DISTINCT ON (driver_id)
        id, driver_id, latitude, longitude, speed, heading, accuracy, altitude, recorded_at, received_at
      FROM location_points
      ORDER BY driver_id, recorded_at DESC
    `);
    latestLocations = locResult.rows ?? [];
  } catch (e) {
    console.error("Error querying latest locations:", e);
  }

  const locationMap = new Map<string, any>();
  for (const loc of latestLocations) {
    locationMap.set(loc.driver_id, loc);
  }

  const now = Date.now();
  const offlineThresholdMs = (alertSettings.offlineGraceMinutes || 5) * 60 * 1000;

  const fleetDrivers: FleetDriverLiveStatus[] = [];

  let activeShiftsCount = 0;
  let onlineCount = 0;
  let atRestaurantCount = 0;
  let movingCount = 0;
  let stoppedCount = 0;
  let offlineCount = 0;
  let lowBatteryCount = 0;

  for (const row of driverRows) {
    const shift = shiftMap.get(row.driverId);
    const device = deviceMap.get(row.driverId);
    const location = locationMap.get(row.driverId);

    const hasActiveShift = !!shift;
    if (hasActiveShift) activeShiftsCount++;

    let isOnline = false;
    let lastSeenDate: Date | null = null;
    if (device?.lastSeen) {
      lastSeenDate = new Date(device.lastSeen);
      isOnline = now - lastSeenDate.getTime() <= offlineThresholdMs;
    } else if (location?.recorded_at) {
      lastSeenDate = new Date(location.recorded_at);
      isOnline = now - lastSeenDate.getTime() <= offlineThresholdMs;
    }

    // Evaluate offline alert for active drivers
    if (hasActiveShift) {
      const offlineMinutes = (!isOnline && lastSeenDate)
        ? Math.floor((now - lastSeenDate.getTime()) / 60000)
        : (alertSettings.offlineGraceMinutes || 5);

      evaluateDriverOfflineAlert({
        driverId: row.driverId,
        driverName: row.userName,
        shiftId: shift?.id,
        isOnline,
        offlineDurationMinutes: offlineMinutes,
        lastSeen: lastSeenDate,
      }).catch((err) => console.error("Fleet offline alert evaluation error:", err));
    }

    let isInsideGeofence = false;
    let distanceToRestaurant: number | null = null;

    if (location && restaurantSettings.enabled) {
      distanceToRestaurant = Math.round(
        calculateDistanceMeters(
          Number(location.latitude),
          Number(location.longitude),
          restaurantSettings.latitude,
          restaurantSettings.longitude,
        ),
      );
      isInsideGeofence = distanceToRestaurant <= restaurantSettings.radiusMeters;
    }

    // Operational status calculation with telemetry freshness check
    const operationalStatus = computeOperationalStatus({
      hasActiveShift,
      isOnline,
      isInsideGeofence,
      location,
      now,
    });

    if (operationalStatus === "OFFLINE") {
      offlineCount++;
    } else {
      onlineCount++;
      if (operationalStatus === "AT_RESTAURANT") {
        atRestaurantCount++;
      } else if (operationalStatus === "MOVING") {
        movingCount++;
      } else {
        stoppedCount++;
      }
    }

    if (
      device?.batteryPercentage != null &&
      device.batteryPercentage <= alertSettings.lowBatteryThreshold
    ) {
      lowBatteryCount++;
    }

    const shiftStartedAt = shift?.startedAt ? new Date(shift.startedAt) : null;
    const shiftData = shift
      ? {
          id: shift.id,
          status: shift.status as "ACTIVE" | "COMPLETED",
          startedAt: shiftStartedAt ? shiftStartedAt.toISOString() : new Date().toISOString(),
          startTime: shiftStartedAt ? shiftStartedAt.toISOString() : new Date().toISOString(),
          durationMinutes: shiftStartedAt
            ? Math.floor((now - shiftStartedAt.getTime()) / (1000 * 60))
            : 0,
        }
      : null;

    const locData = location
      ? {
          id: String(location.id),
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          speed: location.speed != null ? Number(location.speed) : null,
          heading: location.heading != null ? Number(location.heading) : null,
          accuracy: location.accuracy != null ? Number(location.accuracy) : null,
          altitude: location.altitude != null ? Number(location.altitude) : null,
          recordedAt: new Date(location.recorded_at).toISOString(),
          receivedAt: new Date(location.received_at).toISOString(),
        }
      : null;

    const devData = device
      ? {
          id: device.id,
          platform: device.platform,
          appVersion: device.appVersion,
          deviceIdentifier: device.deviceIdentifier,
          authorized: device.authorized,
          batteryPercentage: device.batteryPercentage,
          isCharging: device.isCharging,
          locationServicesEnabled: device.locationServicesEnabled,
          networkStatus: device.networkStatus,
          lastSeen: device.lastSeen ? device.lastSeen.toISOString() : null,
        }
      : null;

    fleetDrivers.push({
      driverId: row.driverId,
      driverName: row.userName,
      driverEmail: row.userEmail,
      driverPhone: row.userPhone,
      employeeId: row.employeeId,
      driverActive: row.driverActive && row.userActive,
      userId: row.userId,
      shift: shiftData,
      location: locData,
      device: devData,
      operationalStatus,
      isInsideGeofence,
      distanceToRestaurantMeters: distanceToRestaurant,
    });
  }

  return {
    summary: {
      totalDrivers: driverRows.length,
      activeShifts: activeShiftsCount,
      onlineDrivers: onlineCount,
      atRestaurant: atRestaurantCount,
      moving: movingCount,
      stopped: stoppedCount,
      offline: offlineCount,
      lowBatteryCount,
    },
    restaurant: {
      name: restaurantSettings.name,
      latitude: restaurantSettings.latitude,
      longitude: restaurantSettings.longitude,
      radiusMeters: restaurantSettings.radiusMeters,
      enabled: restaurantSettings.enabled,
    },
    drivers: options?.activeOnly
      ? fleetDrivers.filter((d) => Boolean(d.shift && d.shift.status === "ACTIVE"))
      : fleetDrivers,
  };
}

