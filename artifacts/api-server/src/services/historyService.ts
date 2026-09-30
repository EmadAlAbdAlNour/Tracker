import { db, locationPointsTable, shiftsTable, driversTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { getRestaurantSettings, getAlertSettings } from "./settingsService";
import {
  evaluateOperationalHistory,
  DEFAULT_RELIABLE_ACCURACY_METERS,
  type OperationalPoint,
} from "./fleetService";
import { calculateDistanceMeters } from "./alertService";

export interface ListLocationHistoryOptions {
  shiftId?: string;
  from?: string;
  to?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ActivityEvent {
  id: string;
  driverId: string;
  shiftId: string | null;
  type:
    | "SHIFT_STARTED"
    | "ARRIVED_AT_RESTAURANT"
    | "LEFT_RESTAURANT"
    | "MOVING"
    | "STOPPED"
    | "STOP_EXTENDED"
    | "GPS_DISABLED"
    | "BATTERY_CRITICAL"
    | "SHIFT_ENDED";
  timestamp: string;
  title: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  metadata?: Record<string, any>;
}

export async function listDriverLocationHistory(
  driverId: string,
  options: ListLocationHistoryOptions = {},
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(500, Math.max(1, options.limit || 50));
  const offset = (page - 1) * limit;
  const orderDir = options.order === "asc" ? asc : desc;

  const conditions = [eq(locationPointsTable.driverId, driverId)];

  if (options.shiftId) {
    conditions.push(eq(locationPointsTable.shiftId, options.shiftId));
  }
  if (options.from) {
    conditions.push(gte(locationPointsTable.recordedAt, new Date(options.from)));
  }
  if (options.to) {
    conditions.push(lte(locationPointsTable.recordedAt, new Date(options.to)));
  }

  const whereClause = and(...conditions);

  const [totalResult, points, restaurantSettings] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(locationPointsTable)
      .where(whereClause),
    db
      .select()
      .from(locationPointsTable)
      .where(whereClause)
      .orderBy(orderDir(locationPointsTable.recordedAt))
      .limit(limit)
      .offset(offset),
    getRestaurantSettings(),
  ]);

  // Compute operational status tags on the points
  const items = points.map((p) => {
    const accuracy = p.accuracy != null ? Number(p.accuracy) : null;
    const isReliable = accuracy == null || accuracy <= DEFAULT_RELIABLE_ACCURACY_METERS;
    const speed = p.speed != null ? Number(p.speed) : 0;
    let distanceToRestaurant: number | null = null;
    let isInsideGeofence = false;

    if (restaurantSettings && restaurantSettings.enabled) {
      distanceToRestaurant = Math.round(
        calculateDistanceMeters(
          p.latitude,
          p.longitude,
          restaurantSettings.latitude,
          restaurantSettings.longitude,
        ),
      );
      isInsideGeofence = distanceToRestaurant <= restaurantSettings.radiusMeters;
    }

    let operationalStatus: "AT_RESTAURANT" | "MOVING" | "STOPPED" = "STOPPED";
    if (isInsideGeofence) {
      operationalStatus = "AT_RESTAURANT";
    } else if (isReliable && speed >= 1.5) {
      operationalStatus = "MOVING";
    }

    return {
      id: p.id,
      driverId: p.driverId,
      shiftId: p.shiftId,
      clientLocationId: p.clientLocationId,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy: p.accuracy,
      altitude: p.altitude,
      speed: p.speed,
      heading: p.heading,
      recordedAt: p.recordedAt.toISOString(),
      receivedAt: p.receivedAt.toISOString(),
      source: p.source,
      operationalStatus,
      isInsideGeofence,
      distanceToRestaurantMeters: distanceToRestaurant,
      isReliable,
    };
  });

  return {
    items,
    total: totalResult[0]?.count ?? 0,
    page,
    limit,
  };
}

export async function getDriverActivityTimeline(
  driverId: string,
  options: { shiftId?: string; from?: string; to?: string; page?: number; limit?: number } = {},
): Promise<{ items: ActivityEvent[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 50));

  // 1. Fetch target shift or latest active/completed shift
  let targetShiftId = options.shiftId;
  if (!targetShiftId) {
    const latestShift = await db
      .select({ id: shiftsTable.id })
      .from(shiftsTable)
      .where(eq(shiftsTable.driverId, driverId))
      .orderBy(desc(shiftsTable.startedAt))
      .limit(1);

    if (latestShift[0]) {
      targetShiftId = latestShift[0].id;
    }
  }

  if (!targetShiftId) {
    return { items: [], total: 0, page, limit };
  }

  // 2. Fetch shift details, restaurant settings, and alert settings
  const [shiftRows, restaurantSettings, alertSettings] = await Promise.all([
    db.select().from(shiftsTable).where(eq(shiftsTable.id, targetShiftId)).limit(1),
    getRestaurantSettings(),
    getAlertSettings(),
  ]);

  const shift = shiftRows[0];
  if (!shift) {
    return { items: [], total: 0, page, limit };
  }

  // 3. Fetch all location points for this shift in chronological order (bounded to 2000 points)
  const points = await db
    .select()
    .from(locationPointsTable)
    .where(eq(locationPointsTable.shiftId, targetShiftId))
    .orderBy(asc(locationPointsTable.recordedAt))
    .limit(2000);

  // 4. Fetch notifications for this shift
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.shiftId, targetShiftId))
    .orderBy(asc(notificationsTable.createdAt));

  const events: ActivityEvent[] = [];

  // Initial event: Shift Started
  const firstPoint = points[0];
  events.push({
    id: `shift-start-${shift.id}`,
    driverId,
    shiftId: shift.id,
    type: "SHIFT_STARTED",
    title: "بدء الوردية",
    description: "بدء وردية العمل بنجاح",
    timestamp: shift.startedAt.toISOString(),
    latitude: firstPoint ? firstPoint.latitude : null,
    longitude: firstPoint ? firstPoint.longitude : null,
    metadata: { status: shift.status },
  });

  // Track operational transitions across consecutive reliable points
  let currentRestaurantState: "AT_RESTAURANT" | "OUTSIDE_RESTAURANT" = "AT_RESTAURANT";
  let currentMovementState: "MOVING" | "STOPPED" = "STOPPED";
  let lastReliablePoint: (typeof points)[0] | null = null;
  let consecutiveInside = 0;
  let consecutiveOutside = 0;
  let consecutiveMoving = 0;
  let consecutiveStopping = 0;
  let stoppedSince: Date | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const accuracy = p.accuracy != null ? Number(p.accuracy) : null;
    const isReliable = accuracy == null || accuracy <= DEFAULT_RELIABLE_ACCURACY_METERS;

    if (!isReliable) continue;

    const lat = p.latitude;
    const lon = p.longitude;
    const speed = p.speed != null ? Number(p.speed) : 0;
    const recordedAt = p.recordedAt;

    // A. Geofence evaluation
    if (restaurantSettings && restaurantSettings.enabled) {
      const dist = calculateDistanceMeters(
        lat,
        lon,
        restaurantSettings.latitude,
        restaurantSettings.longitude,
      );

      if (currentRestaurantState === "AT_RESTAURANT") {
        if (dist > restaurantSettings.radiusMeters + 30) {
          consecutiveOutside++;
          consecutiveInside = 0;
          if (consecutiveOutside >= 2) {
            currentRestaurantState = "OUTSIDE_RESTAURANT";
            events.push({
              id: `geofence-exit-${p.id}`,
              driverId,
              shiftId: shift.id,
              type: "LEFT_RESTAURANT",
              title: "مغادرة المطعم",
              description: `خرج السائق من نطاق المطعم (${Math.round(dist)} متر)`,
              timestamp: recordedAt.toISOString(),
              latitude: lat,
              longitude: lon,
              metadata: { distanceMeters: Math.round(dist) },
            });
          }
        } else {
          consecutiveOutside = 0;
        }
      } else {
        if (dist <= restaurantSettings.radiusMeters) {
          consecutiveInside++;
          consecutiveOutside = 0;
          if (consecutiveInside >= 2) {
            currentRestaurantState = "AT_RESTAURANT";
            events.push({
              id: `geofence-enter-${p.id}`,
              driverId,
              shiftId: shift.id,
              type: "ARRIVED_AT_RESTAURANT",
              title: "الوصول إلى المطعم",
              description: `وصل السائق إلى نطاق المطعم (${Math.round(dist)} متر)`,
              timestamp: recordedAt.toISOString(),
              latitude: lat,
              longitude: lon,
              metadata: { distanceMeters: Math.round(dist) },
            });
          }
        } else {
          consecutiveInside = 0;
        }
      }
    }

    // B. Movement evaluation
    let displacement = 0;
    if (lastReliablePoint) {
      displacement = calculateDistanceMeters(
        lastReliablePoint.latitude,
        lastReliablePoint.longitude,
        lat,
        lon,
      );
    }

    if (currentMovementState === "STOPPED") {
      if (speed >= 1.5) {
        consecutiveMoving++;
        consecutiveStopping = 0;
        if (consecutiveMoving >= 2 && (displacement >= 10 || !lastReliablePoint)) {
          currentMovementState = "MOVING";
          stoppedSince = null;
          const speedKmh = Math.round(speed * 3.6);
          events.push({
            id: `moving-${p.id}`,
            driverId,
            shiftId: shift.id,
            type: "MOVING",
            title: "بدء الحركة",
            description: `السرعة الحالية: ${speedKmh} كم/س`,
            timestamp: recordedAt.toISOString(),
            latitude: lat,
            longitude: lon,
            metadata: { speedKmh },
          });
        }
      } else {
        consecutiveMoving = 0;
      }
    } else {
      if (speed < 1.0) {
        consecutiveStopping++;
        consecutiveMoving = 0;
        if (consecutiveStopping >= 3) {
          currentMovementState = "STOPPED";
          stoppedSince = recordedAt;
          events.push({
            id: `stopped-${p.id}`,
            driverId,
            shiftId: shift.id,
            type: "STOPPED",
            title: "توقف عن الحركة",
            description: currentRestaurantState === "AT_RESTAURANT" ? "متوقف داخل نطاق المطعم" : "متوقف خارج نطاق المطعم",
            timestamp: recordedAt.toISOString(),
            latitude: lat,
            longitude: lon,
            metadata: { insideRestaurant: currentRestaurantState === "AT_RESTAURANT" },
          });
        }
      } else {
        consecutiveStopping = 0;
      }
    }

    lastReliablePoint = p;
  }

  // C. Incorporate critical notifications (like STOP_EXTENDED, GPS_DISABLED, BATTERY_CRITICAL)
  const notifsList = Array.isArray(notifications) ? notifications : [];
  for (const notif of notifsList) {
    if (notif.type === "STOP_EXTENDED") {
      let lat: number | null = null;
      let lon: number | null = null;
      try {
        if (notif.metadata) {
          const meta = JSON.parse(notif.metadata);
          lat = meta.latitude ?? null;
          lon = meta.longitude ?? null;
        }
      } catch {}
      events.push({
        id: `alert-${notif.id}`,
        driverId,
        shiftId: shift.id,
        type: "STOP_EXTENDED",
        title: notif.titleAr || "توقف مطول خارج المطعم",
        description: notif.messageAr || "تجاوز السائق الحد الأقصى المسموح به للتوقف",
        timestamp: notif.createdAt.toISOString(),
        latitude: lat,
        longitude: lon,
        metadata: { title: notif.titleAr, message: notif.messageAr },
      });
    } else if (notif.type === "GPS_DISABLED") {
      events.push({
        id: `alert-${notif.id}`,
        driverId,
        shiftId: shift.id,
        type: "GPS_DISABLED",
        title: notif.titleAr || "تعطيل نظام تحديد المواقع (GPS)",
        description: notif.messageAr || "تم تعطيل خدمة الموقع على جهاز السائق",
        timestamp: notif.createdAt.toISOString(),
        latitude: null,
        longitude: null,
        metadata: { title: notif.titleAr, message: notif.messageAr },
      });
    } else if (notif.type === "BATTERY_CRITICAL") {
      events.push({
        id: `alert-${notif.id}`,
        driverId,
        shiftId: shift.id,
        type: "BATTERY_CRITICAL",
        title: notif.titleAr || "مستوى البطارية حرج",
        description: notif.messageAr || "مستوى شحن بطارية جهاز السائق أقل من الحد المسموح",
        timestamp: notif.createdAt.toISOString(),
        latitude: null,
        longitude: null,
        metadata: { title: notif.titleAr, message: notif.messageAr },
      });
    }
  }

  // D. Final event: Shift Ended (if completed)
  if (shift.status === "COMPLETED" && shift.endedAt) {
    const lastPoint = points[points.length - 1];
    const durationMins = Math.round(
      (shift.endedAt.getTime() - shift.startedAt.getTime()) / 60000,
    );
    events.push({
      id: `shift-end-${shift.id}`,
      driverId,
      shiftId: shift.id,
      type: "SHIFT_ENDED",
      title: "انتهاء الوردية",
      description: `اكتملت وردية العمل — المدة الإجمالية: ${durationMins} دقيقة`,
      timestamp: shift.endedAt.toISOString(),
      latitude: lastPoint ? lastPoint.latitude : null,
      longitude: lastPoint ? lastPoint.longitude : null,
      metadata: {
        durationMinutes: durationMins,
      },
    });
  }

  // Sort events chronologically (descending for feed, or ascending)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = events.length;
  const paginated = events.slice((page - 1) * limit, page * limit);

  return {
    items: paginated,
    total,
    page,
    limit,
  };
}
