import { db, shiftsTable, locationPointsTable, driversTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, asc, desc, inArray } from "drizzle-orm";
import { getRestaurantSettings, getAlertSettings } from "./settingsService";
import { calculateDistanceMeters } from "./alertService";
import { DEFAULT_RELIABLE_ACCURACY_METERS, MOVEMENT_SPEED_THRESHOLD_MPS } from "./fleetService";

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
  durationMinutes?: number;
  distanceMeters?: number;
  movingMinutes?: number;
  stoppedMinutes?: number;
  restaurantMinutes?: number;
  alerts?: number;
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
    totalMovingMinutes?: number;
    totalStoppedMinutes?: number;
    totalRestaurantMinutes?: number;
    totalAlerts?: number;
  };
  drivers: DriverReportMetrics[];
  driverBreakdown?: DriverReportMetrics[];
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

  const [restaurantSettings, alertSettings] = await Promise.all([
    getRestaurantSettings(),
    getAlertSettings(),
  ]);

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
  const shiftIds = shiftList.map((s) => s.id);

  // Eliminate N+1 queries by batch-loading all location points for these shifts in a single query
  const pointsByShiftId = new Map<
    string,
    Array<{
      latitude: number;
      longitude: number;
      accuracy: number | null;
      speed: number | null;
      recordedAt: Date;
    }>
  >();

  if (shiftIds.length > 0) {
    const allPoints = await db
      .select({
        shiftId: locationPointsTable.shiftId,
        latitude: locationPointsTable.latitude,
        longitude: locationPointsTable.longitude,
        accuracy: locationPointsTable.accuracy,
        speed: locationPointsTable.speed,
        recordedAt: locationPointsTable.recordedAt,
      })
      .from(locationPointsTable)
      .where(inArray(locationPointsTable.shiftId, shiftIds))
      .orderBy(asc(locationPointsTable.recordedAt));

    const allPointsList = Array.isArray(allPoints) ? allPoints : [];
    for (const pt of allPointsList) {
      if (!pt.shiftId) continue;
      let list = pointsByShiftId.get(pt.shiftId);
      if (!list) {
        list = [];
        pointsByShiftId.set(pt.shiftId, list);
      }
      list.push(pt);
    }
  }

  for (const shift of shiftList) {
    const metrics = perDriver.get(shift.driverId);
    if (!metrics) continue;

    metrics.shiftCount++;

    const shiftEnd = shift.endedAt ? shift.endedAt.getTime() : Math.min(Date.now(), toDate.getTime());
    const shiftStart = shift.startedAt.getTime();
    const maxShiftMinutes = (alertSettings?.maxShiftDurationHours ?? 12) * 60;
    const rawDurationMins = Math.max(0, Math.round((shiftEnd - shiftStart) / 60000));
    const durationMins = shift.endedAt ? rawDurationMins : Math.min(rawDurationMins, maxShiftMinutes);
    metrics.totalDurationMinutes += durationMins;

    const points = pointsByShiftId.get(shift.id) || [];

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

        // Guard against telemetry gaps (> 5 min): do not interpolate fake durations across gaps
        if (timeDiffSec > 0 && timeDiffSec <= 300) {
          const deltaMins = timeDiffSec / 60;

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
          } else if (speed >= MOVEMENT_SPEED_THRESHOLD_MPS) {
            shiftMovingMins += deltaMins;
          } else {
            shiftStoppedMins += deltaMins;
          }
        }
      }

      prevReliable = p;
    }

    metrics.totalDistanceMeters += shiftDistance;
    metrics.movingDurationMinutes += shiftMovingMins;
    metrics.restaurantDurationMinutes += shiftRestaurantMins;
    metrics.stoppedDurationMinutes += shiftStoppedMins;
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

  // 6. Compute fleet summary and populate compatibility aliases
  const driverMetricsArray = Array.from(perDriver.values());
  for (const d of driverMetricsArray) {
    d.totalDistanceMeters = Math.round(d.totalDistanceMeters);
    d.movingDurationMinutes = Math.round(d.movingDurationMinutes);
    d.stoppedDurationMinutes = Math.round(d.stoppedDurationMinutes);
    d.restaurantDurationMinutes = Math.round(d.restaurantDurationMinutes);
    d.durationMinutes = d.totalDurationMinutes;
    d.distanceMeters = d.totalDistanceMeters;
    d.movingMinutes = d.movingDurationMinutes;
    d.stoppedMinutes = d.stoppedDurationMinutes;
    d.restaurantMinutes = d.restaurantDurationMinutes;
    d.alerts = d.alertCount;
  }

  const totalMoving = driverMetricsArray.reduce((acc, d) => acc + d.movingDurationMinutes, 0);
  const totalStopped = driverMetricsArray.reduce((acc, d) => acc + d.stoppedDurationMinutes, 0);
  const totalRestaurant = driverMetricsArray.reduce((acc, d) => acc + d.restaurantDurationMinutes, 0);
  const totalAlerts = driverMetricsArray.reduce((acc, d) => acc + d.alertCount, 0);

  const summary = {
    from: params.from,
    to: params.to,
    totalDrivers: driverMetricsArray.filter((d) => d.shiftCount > 0).length,
    totalShifts: shiftList.length,
    totalDurationMinutes: driverMetricsArray.reduce((acc, d) => acc + d.totalDurationMinutes, 0),
    totalDistanceMeters: driverMetricsArray.reduce((acc, d) => acc + d.totalDistanceMeters, 0),
    movingDurationMinutes: totalMoving,
    stoppedDurationMinutes: totalStopped,
    restaurantDurationMinutes: totalRestaurant,
    alertCount: totalAlerts,
    // Backward compatibility aliases
    totalMovingMinutes: totalMoving,
    totalStoppedMinutes: totalStopped,
    totalRestaurantMinutes: totalRestaurant,
    totalAlerts: totalAlerts,
  };

  return {
    summary,
    drivers: driverMetricsArray,
    driverBreakdown: driverMetricsArray,
  };
}
