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
  isOnline?: boolean;
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

export const DEFAULT_RELIABLE_ACCURACY_METERS = 35;
export const SEVERE_ACCURACY_THRESHOLD_METERS = 150;
export const SPEED_ACCURACY_THRESHOLD_METERS = 25;
export const MOVEMENT_SPEED_THRESHOLD_MPS = 1.5; // 5.4 km/h
export const STOP_SPEED_THRESHOLD_MPS = 1.0;     // 3.6 km/h
export const MOVEMENT_MIN_DISPLACEMENT_METERS = 10;
export const GEOFENCE_EXIT_BUFFER_METERS = 30;
export const CONSECUTIVE_ARRIVAL_SAMPLES = 2;
export const CONSECUTIVE_DEPARTURE_SAMPLES = 2;
export const CONSECUTIVE_MOVING_SAMPLES = 2;
export const CONSECUTIVE_STOPPED_SAMPLES = 3;

export interface OperationalPoint {
  latitude: number | string;
  longitude: number | string;
  speed?: number | string | null;
  accuracy?: number | string | null;
  recorded_at?: string | Date | null;
}

export function evaluateOperationalHistory(params: {
  points: OperationalPoint[];
  restaurantSettings?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    enabled: boolean;
  } | null;
  exitBufferMeters?: number;
  initialRestaurantState?: "AT_RESTAURANT" | "OUTSIDE_RESTAURANT";
  initialMovementState?: "MOVING" | "STOPPED";
}): {
  restaurantState: "AT_RESTAURANT" | "OUTSIDE_RESTAURANT";
  movementState: "MOVING" | "STOPPED";
  operationalStatus: "AT_RESTAURANT" | "MOVING" | "STOPPED";
  isInsideGeofence: boolean;
  distanceToRestaurantMeters: number | null;
  reliablePointCount: number;
} {
  const {
    points,
    restaurantSettings,
    exitBufferMeters = GEOFENCE_EXIT_BUFFER_METERS,
    initialRestaurantState: explicitInitialState,
    initialMovementState = "STOPPED",
  } = params;

  // Determine initial restaurant state:
  // If explicitly specified by caller, respect it.
  // Otherwise, inspect the first reliable point in the history window:
  // If the first reliable point is inside restaurant radius, initial state is AT_RESTAURANT.
  // Otherwise (or if empty / geofence disabled), default to OUTSIDE_RESTAURANT.
  let resolvedInitialRestaurantState: "AT_RESTAURANT" | "OUTSIDE_RESTAURANT" = "OUTSIDE_RESTAURANT";
  if (explicitInitialState !== undefined) {
    resolvedInitialRestaurantState = explicitInitialState;
  } else if (restaurantSettings && restaurantSettings.enabled && points && points.length > 0) {
    const firstReliable = points.find((p) => {
      const acc = p.accuracy != null ? Number(p.accuracy) : null;
      return acc == null || acc <= DEFAULT_RELIABLE_ACCURACY_METERS;
    });
    if (firstReliable) {
      const d = calculateDistanceMeters(
        Number(firstReliable.latitude),
        Number(firstReliable.longitude),
        restaurantSettings.latitude,
        restaurantSettings.longitude,
      );
      if (d <= restaurantSettings.radiusMeters) {
        resolvedInitialRestaurantState = "AT_RESTAURANT";
      }
    }
  }

  let currentRestaurantState = resolvedInitialRestaurantState;
  let currentMovementState = initialMovementState;
  let consecutiveInside = 0;
  let consecutiveOutside = 0;
  let consecutiveMoving = 0;
  let consecutiveStopping = 0;
  let lastReliablePoint: OperationalPoint | null = null;
  let lastDistance: number | null = null;
  let reliablePointCount = 0;

  for (const p of points) {
    const accuracy = p.accuracy != null ? Number(p.accuracy) : null;
    const isReliable = accuracy == null || accuracy <= DEFAULT_RELIABLE_ACCURACY_METERS;

    // Degraded points (accuracy > 35m) are not used to transition operational state
    if (!isReliable) {
      continue;
    }

    reliablePointCount++;
    const speed = p.speed != null ? Number(p.speed) : 0;
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);

    // 1. Restaurant Geofence Evaluation (Independent of speed/movement)
    if (restaurantSettings && restaurantSettings.enabled) {
      const dist = calculateDistanceMeters(
        lat,
        lon,
        restaurantSettings.latitude,
        restaurantSettings.longitude,
      );
      lastDistance = Math.round(dist);

      if (currentRestaurantState === "AT_RESTAURANT") {
        // Departure requires 2 consecutive reliable samples outside (radius + 30m)
        if (dist > restaurantSettings.radiusMeters + exitBufferMeters) {
          consecutiveOutside++;
          consecutiveInside = 0;
          if (consecutiveOutside >= CONSECUTIVE_DEPARTURE_SAMPLES) {
            currentRestaurantState = "OUTSIDE_RESTAURANT";
          }
        } else {
          // Inside departure buffer or inside restaurant: retain AT_RESTAURANT
          consecutiveOutside = 0;
        }
      } else {
        // Arrival requires 2 consecutive reliable samples inside radius
        if (dist <= restaurantSettings.radiusMeters) {
          consecutiveInside++;
          consecutiveOutside = 0;
          if (consecutiveInside >= CONSECUTIVE_ARRIVAL_SAMPLES) {
            currentRestaurantState = "AT_RESTAURANT";
          }
        } else {
          consecutiveInside = 0;
        }
      }
    }

    // 2. Movement Evaluation (Independent of restaurant state)
    let displacement = 0;
    if (lastReliablePoint) {
      displacement = calculateDistanceMeters(
        Number(lastReliablePoint.latitude),
        Number(lastReliablePoint.longitude),
        lat,
        lon,
      );
    }

    if (currentMovementState === "STOPPED") {
      // STOPPED -> MOVING requires 2 consecutive reliable samples with speed >= 1.5 m/s and displacement >= 10m
      if (speed >= MOVEMENT_SPEED_THRESHOLD_MPS) {
        consecutiveMoving++;
        consecutiveStopping = 0;
        if (
          consecutiveMoving >= CONSECUTIVE_MOVING_SAMPLES &&
          (displacement >= MOVEMENT_MIN_DISPLACEMENT_METERS || !lastReliablePoint)
        ) {
          currentMovementState = "MOVING";
        }
      } else {
        consecutiveMoving = 0;
      }
    } else {
      // MOVING -> STOPPED requires 3 consecutive reliable samples with speed < 1.0 m/s
      if (speed < STOP_SPEED_THRESHOLD_MPS) {
        consecutiveStopping++;
        consecutiveMoving = 0;
        if (consecutiveStopping >= CONSECUTIVE_STOPPED_SAMPLES) {
          currentMovementState = "STOPPED";
        }
      } else {
        consecutiveStopping = 0;
      }
    }

    lastReliablePoint = p;
  }

  const isInsideGeofence = currentRestaurantState === "AT_RESTAURANT";
  const operationalStatus: "AT_RESTAURANT" | "MOVING" | "STOPPED" =
    isInsideGeofence ? "AT_RESTAURANT" : currentMovementState;

  return {
    restaurantState: currentRestaurantState,
    movementState: currentMovementState,
    operationalStatus,
    isInsideGeofence,
    distanceToRestaurantMeters: lastDistance,
    reliablePointCount,
  };
}

export function computeOperationalStatus(params: {
  hasActiveShift: boolean;
  isOnline: boolean;
  isInsideGeofence?: boolean;
  location?: { recorded_at?: string | Date | null; speed?: number | string | null; accuracy?: number | string | null; latitude?: number | string; longitude?: number | string } | null;
  recentLocations?: OperationalPoint[];
  restaurantSettings?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    enabled: boolean;
  } | null;
  initialRestaurantState?: "AT_RESTAURANT" | "OUTSIDE_RESTAURANT";
  now?: number;
}): "AT_RESTAURANT" | "MOVING" | "STOPPED" | "OFFLINE" {
  const {
    hasActiveShift,
    isOnline,
    isInsideGeofence,
    location,
    recentLocations,
    restaurantSettings,
    initialRestaurantState,
    now = Date.now(),
  } = params;

  if (!hasActiveShift || !isOnline) {
    return "OFFLINE";
  }

  // If recent locations history is provided, run full history evaluation
  if (recentLocations && recentLocations.length > 0) {
    const historyResult = evaluateOperationalHistory({
      points: recentLocations,
      restaurantSettings,
      initialRestaurantState,
    });
    return historyResult.operationalStatus;
  }

  if (!location) {
    return "STOPPED";
  }

  if (isInsideGeofence) {
    return "AT_RESTAURANT";
  }

  const accuracy = location.accuracy != null ? Number(location.accuracy) : null;
  // Degraded GPS (accuracy > 35m) cannot transition to MOVING
  if (accuracy != null && accuracy > DEFAULT_RELIABLE_ACCURACY_METERS) {
    return "STOPPED";
  }

  const locationAgeMs = location.recorded_at ? (now - new Date(location.recorded_at).getTime()) : Infinity;
  const isLocationFresh = locationAgeMs <= (5 * 60 * 1000); // 5 minutes freshness threshold
  const speed = (isLocationFresh && location.speed != null) ? Number(location.speed) : 0;

  if (speed >= STOP_SPEED_THRESHOLD_MPS) {
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

  // Fetch up to 10 recent locations per driver scoped strictly to active shifts
  let latestLocations: any[] = [];
  try {
    const locResult = await db.execute(sql`
      SELECT lp.id, lp.driver_id, lp.shift_id, lp.latitude, lp.longitude, lp.speed, lp.heading, lp.accuracy, lp.altitude, lp.recorded_at, lp.received_at
      FROM (
        SELECT lp.id, lp.driver_id, lp.shift_id, lp.latitude, lp.longitude, lp.speed, lp.heading, lp.accuracy, lp.altitude, lp.recorded_at, lp.received_at,
               ROW_NUMBER() OVER (PARTITION BY lp.driver_id ORDER BY lp.recorded_at DESC) as rn
        FROM location_points lp
        INNER JOIN shifts s ON lp.driver_id = s.driver_id AND s.status = 'ACTIVE' AND (lp.shift_id = s.id OR (lp.shift_id IS NULL AND lp.recorded_at >= s.started_at))
      ) lp
      WHERE lp.rn <= 10
      ORDER BY lp.driver_id, lp.recorded_at ASC
    `);
    latestLocations = locResult.rows ?? [];
  } catch (e) {
    console.error("Error querying latest locations:", e);
  }

  const driverRecentLocationsMap = new Map<string, any[]>();
  for (const loc of latestLocations) {
    const list = driverRecentLocationsMap.get(loc.driver_id) || [];
    list.push(loc);
    driverRecentLocationsMap.set(loc.driver_id, list);
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
    const recentLocations = driverRecentLocationsMap.get(row.driverId) || [];
    const location = recentLocations.length > 0 ? recentLocations[recentLocations.length - 1] : null;

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

    let historyResult: ReturnType<typeof evaluateOperationalHistory> | null = null;
    if (recentLocations && recentLocations.length > 0) {
      historyResult = evaluateOperationalHistory({
        points: recentLocations,
        restaurantSettings,
      });
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
      if (historyResult) {
        isInsideGeofence = historyResult.isInsideGeofence;
      } else {
        isInsideGeofence = distanceToRestaurant <= restaurantSettings.radiusMeters;
      }
    }

    // Operational status calculation with telemetry freshness and multi-sample history check
    const operationalStatus = computeOperationalStatus({
      hasActiveShift,
      isOnline,
      isInsideGeofence,
      location,
      recentLocations,
      restaurantSettings,
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

    // Speed display suppression:
    // Operational speed shown only when MOVING, fix is fresh, and accuracy <= 25m.
    // Otherwise 0 km/h for STOPPED / AT_RESTAURANT or degraded GPS.
    const locationAgeMs = location?.recorded_at ? (now - new Date(location.recorded_at).getTime()) : Infinity;
    const isLocationFresh = locationAgeMs <= (5 * 60 * 1000);
    const accuracy = location?.accuracy != null ? Number(location.accuracy) : null;
    const isAccuracySpeedEligible = accuracy == null || accuracy <= SPEED_ACCURACY_THRESHOLD_METERS;

    const isSpeedEligible =
      operationalStatus === "MOVING" &&
      isLocationFresh &&
      isAccuracySpeedEligible &&
      location?.speed != null;

    const operationalSpeed = isSpeedEligible ? Number(location.speed) : 0;

    const locData = location
      ? {
          id: String(location.id),
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          speed: (operationalStatus === "MOVING" && isSpeedEligible) ? operationalSpeed : 0,
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
      isOnline,
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

