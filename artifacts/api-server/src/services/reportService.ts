import { db, shiftsTable, locationPointsTable, driversTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, asc, desc, inArray } from "drizzle-orm";
import { getRestaurantSettings } from "./settingsService";
import { calculateDistanceMeters } from "./alertService";
import { DEFAULT_RELIABLE_ACCURACY_METERS } from "./fleetService";

export interface DriverReportMetrics {
  driverId: string;
  driverName: string;
  employeeId: string;
  shiftCount: number;
  totalDurationMinutes: number;
  totalDistanceMeters: number;
  movingDurationMinutes: number;
  stoppedDurationMinutes: number;
  restaurantDurationMinutes: number;
  alertCount: number;
}

export interface OperationalReportResponse {
  summary: {
    from: string;
    to: string;
    totalDrivers: number;
    totalShifts: number;
    totalDurationMinutes: number;
    totalDistanceMeters: number;
    movingDurationMinutes: number;
    stoppedDurationMinutes: number;
    restaurantDurationMinutes: number;
    alertCount: number;
  };
  drivers: DriverReportMetrics[];
}

export async function generateOperationalReport(params: {
  from: string;
  to: string;
  driverId?: string;
}): Promise<OperationalReportResponse> {
  const fromDate = new Date(params.from);
  const toDate = new Date(params.to);

  // 1. Fetch relevant shifts
  const shiftConditions = [
    gte(shiftsTable.startedAt, fromDate),
    lte(shiftsTable.startedAt, toDate),
  ];
  if (params.driverId) {
    shiftConditions.push(eq(shiftsTable.driverId, params.driverId));
  }

  const shifts = await db
    .select({
      id: shiftsTable.id,
      driverId: shiftsTable.driverId,
      startedAt: shiftsTable.startedAt,
      endedAt: shiftsTable.endedAt,
      status: shiftsTable.status,
    })
    .from(shiftsTable)
    .where(and(...shiftConditions))
    .orderBy(asc(shiftsTable.startedAt));

  // 2. Fetch driver & user records for context
  const driverRows = await db
    .select({
      driverId: driversTable.id,
      employeeId: driversTable.employeeId,
      name: usersTable.name,
      userId: usersTable.id,
    })
    .from(driversTable)
    .innerJoin(usersTable, eq(driversTable.userId, usersTable.id));

  const driverMap = new Map<string, { employeeId: string; name: string }>();
  const driverList = Array.isArray(driverRows) ? driverRows : [];
  for (const d of driverList) {
    driverMap.set(d.driverId, { employeeId: d.employeeId, name: d.name });
  }

  const restaurantSettings = await getRestaurantSettings();

  // 3. Aggregate metrics per driver
  const perDriver = new Map<string, DriverReportMetrics>();

  // Initialize for all known drivers if no specific driverId filter was given, or just for the filtered driver
  for (const [id, info] of driverMap.entries()) {
    if (!params.driverId || params.driverId === id) {
      perDriver.set(id, {
        driverId: id,
        driverName: info.name,
        employeeId: info.employeeId,
        shiftCount: 0,
        totalDurationMinutes: 0,
        totalDistanceMeters: 0,
        movingDurationMinutes: 0,
        stoppedDurationMinutes: 0,
        restaurantDurationMinutes: 0,
        alertCount: 0,
      });
    }
  }

  // 4. Process each shift's duration, points, and metrics
  const shiftList = Array.isArray(shifts) ? shifts : [];
  for (const shift of shiftList) {
    const metrics = perDriver.get(shift.driverId);
    if (!metrics) continue;

    metrics.shiftCount++;

    const shiftEnd = shift.endedAt ? shift.endedAt.getTime() : Math.min(Date.now(), toDate.getTime());
    const shiftStart = shift.startedAt.getTime();
    const durationMins = Math.max(0, Math.round((shiftEnd - shiftStart) / 60000));
    metrics.totalDurationMinutes += durationMins;

    // Fetch reliable location points for this shift
    const points = await db
      .select({
        latitude: locationPointsTable.latitude,
        longitude: locationPointsTable.longitude,
        accuracy: locationPointsTable.accuracy,
        speed: locationPointsTable.speed,
        recordedAt: locationPointsTable.recordedAt,
      })
      .from(locationPointsTable)
      .where(eq(locationPointsTable.shiftId, shift.id))
      .orderBy(asc(locationPointsTable.recordedAt));

    let shiftDistance = 0;
    let prevReliable: (typeof points)[0] | null = null;
    let shiftMovingMins = 0;
    let shiftRestaurantMins = 0;
    let shiftStoppedMins = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const acc = p.accuracy != null ? Number(p.accuracy) : null;
      const isReliable = acc == null || acc <= DEFAULT_RELIABLE_ACCURACY_METERS;

      if (!isReliable) continue;

      if (prevReliable) {
        const dist = calculateDistanceMeters(
          prevReliable.latitude,
          prevReliable.longitude,
          p.latitude,
          p.longitude,
        );
        const timeDiffSec = (p.recordedAt.getTime() - prevReliable.recordedAt.getTime()) / 1000;
        // Plausible displacement between telemetry pings (<= 150 km/h)
        if (timeDiffSec > 0 && dist / timeDiffSec <= 42) {
          shiftDistance += dist;
        }

        const deltaMins = Math.min(10, Math.max(0, timeDiffSec / 60));

        // Evaluate location state
        let isInsideRestaurant = false;
        if (restaurantSettings && restaurantSettings.enabled) {
          const restDist = calculateDistanceMeters(
            p.latitude,
            p.longitude,
            restaurantSettings.latitude,
            restaurantSettings.longitude,
          );
          isInsideRestaurant = restDist <= restaurantSettings.radiusMeters;
        }

        const speed = p.speed != null ? Number(p.speed) : 0;
        if (isInsideRestaurant) {
          shiftRestaurantMins += deltaMins;
        } else if (speed >= 1.5) {
          shiftMovingMins += deltaMins;
        } else {
          shiftStoppedMins += deltaMins;
        }
      }

      prevReliable = p;
    }

    metrics.totalDistanceMeters += Math.round(shiftDistance);
    metrics.movingDurationMinutes += Math.round(shiftMovingMins);
    metrics.restaurantDurationMinutes += Math.round(shiftRestaurantMins);
    metrics.stoppedDurationMinutes += Math.round(shiftStoppedMins);
  }

  // 5. Aggregate alert counts per driver within range
  const notifConditions = [
    gte(notificationsTable.createdAt, fromDate),
    lte(notificationsTable.createdAt, toDate),
  ];
  if (params.driverId) {
    notifConditions.push(eq(notificationsTable.driverId, params.driverId));
  }

  const notifications = await db
    .select({ driverId: notificationsTable.driverId })
    .from(notificationsTable)
    .where(and(...notifConditions));

  const notifsList = Array.isArray(notifications) ? notifications : [];
  for (const n of notifsList) {
    if (n.driverId) {
      const metrics = perDriver.get(n.driverId);
      if (metrics) {
        metrics.alertCount++;
      }
    }
  }

  // 6. Compute fleet summary
  const driverMetricsArray = Array.from(perDriver.values());
  const summary = {
    from: params.from,
    to: params.to,
    totalDrivers: driverMetricsArray.filter((d) => d.shiftCount > 0).length,
    totalShifts: shiftList.length,
    totalDurationMinutes: driverMetricsArray.reduce((acc, d) => acc + d.totalDurationMinutes, 0),
    totalDistanceMeters: driverMetricsArray.reduce((acc, d) => acc + d.totalDistanceMeters, 0),
    movingDurationMinutes: driverMetricsArray.reduce((acc, d) => acc + d.movingDurationMinutes, 0),
    stoppedDurationMinutes: driverMetricsArray.reduce((acc, d) => acc + d.stoppedDurationMinutes, 0),
    restaurantDurationMinutes: driverMetricsArray.reduce((acc, d) => acc + d.restaurantDurationMinutes, 0),
    alertCount: driverMetricsArray.reduce((acc, d) => acc + d.alertCount, 0),
  };

  return {
    summary,
    drivers: driverMetricsArray,
  };
}
