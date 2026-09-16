import {
  db,
  alertStateTable,
  shiftsTable,
  driversTable,
  usersTable,
  devicesTable,
  locationPointsTable,
} from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getAlertSettings, getRestaurantSettings } from "./settingsService";
import { createNotification } from "./notificationService";

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export interface EvaluateAlertContext {
  driverId: string;
  driverName?: string;
  shiftId?: string | null;
  latitude: number;
  longitude: number;
  speed?: number | null;
  recordedAt: Date;
  batteryPercentage?: number | null;
  locationServicesEnabled?: boolean | null;
}

const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between repetitive alerts

export async function evaluateDriverAlerts(ctx: EvaluateAlertContext) {
  try {
    const [alertSettings, restaurantSettings] = await Promise.all([
      getAlertSettings(),
      getRestaurantSettings(),
    ]);

    if (!alertSettings.stopAlertEnabled &&
        !alertSettings.gpsAlertEnabled &&
        !alertSettings.batteryAlertEnabled &&
        !alertSettings.restaurantGeofenceAlertEnabled) {
      return;
    }

    const driverName = ctx.driverName ?? "السائق";
    const now = new Date();

    // Calculate restaurant distance & geofence state
    let isInsideRestaurant = false;
    if (restaurantSettings.enabled) {
      const distance = calculateDistanceMeters(
        ctx.latitude,
        ctx.longitude,
        restaurantSettings.latitude,
        restaurantSettings.longitude,
      );
      isInsideRestaurant = distance <= restaurantSettings.radiusMeters;
    }

    // 1. Geofence Enter / Exit Alerts
    if (alertSettings.restaurantGeofenceAlertEnabled && restaurantSettings.enabled) {
      const existingGeofenceState = await getAlertState(ctx.driverId, "GEOFENCE_STATUS");
      const wasInside = existingGeofenceState?.stateData === "INSIDE";

      if (isInsideRestaurant && !wasInside) {
        await updateAlertState(ctx.driverId, "GEOFENCE_STATUS", "INSIDE");
        await createNotification({
          type: "GEOFENCE_ENTER",
          severity: "INFO",
          titleAr: "وصول للمطعم",
          titleEn: "Arrived at Restaurant",
          messageAr: `وصل ${driverName} إلى محيط المطعم (${restaurantSettings.name})`,
          messageEn: `${driverName} arrived at restaurant perimeter (${restaurantSettings.name})`,
          driverId: ctx.driverId,
          shiftId: ctx.shiftId,
          metadata: { latitude: ctx.latitude, longitude: ctx.longitude },
        });
      } else if (!isInsideRestaurant && wasInside) {
        await updateAlertState(ctx.driverId, "GEOFENCE_STATUS", "OUTSIDE");
        await createNotification({
          type: "GEOFENCE_EXIT",
          severity: "INFO",
          titleAr: "مغادرة المطعم",
          titleEn: "Left Restaurant",
          messageAr: `غادر ${driverName} محيط المطعم (${restaurantSettings.name})`,
          messageEn: `${driverName} left restaurant perimeter (${restaurantSettings.name})`,
          driverId: ctx.driverId,
          shiftId: ctx.shiftId,
          metadata: { latitude: ctx.latitude, longitude: ctx.longitude },
        });
      } else if (!existingGeofenceState) {
        await updateAlertState(ctx.driverId, "GEOFENCE_STATUS", isInsideRestaurant ? "INSIDE" : "OUTSIDE");
      }
    }

    // 2. Extended Stop Alert (Outside Restaurant Only)
    if (alertSettings.stopAlertEnabled) {
      const isStopped = (ctx.speed == null || ctx.speed < 1.0) && !isInsideRestaurant;
      const stopState = await getAlertState(ctx.driverId, "STOP_EXTENDED");

      if (isStopped) {
        if (!stopState) {
          // Started stopping now
          await updateAlertState(ctx.driverId, "STOP_EXTENDED", "STOPPED", ctx.recordedAt);
        } else {
          // Check how long stopped
          const stoppedSince = stopState.triggeredAt ? new Date(stopState.triggeredAt).getTime() : now.getTime();
          const stoppedDurationMinutes = (now.getTime() - stoppedSince) / (1000 * 60);

          if (stoppedDurationMinutes >= alertSettings.maxStopDurationMinutes) {
            const isFirstAlert = stopState.stateData !== "ALERTED";
            const timeSinceLastNotification = now.getTime() - new Date(stopState.lastNotifiedAt).getTime();
            if (isFirstAlert || timeSinceLastNotification >= NOTIFICATION_COOLDOWN_MS) {
              if (isFirstAlert) {
                await updateAlertState(ctx.driverId, "STOP_EXTENDED", "ALERTED", stopState.triggeredAt);
              } else {
                await updateAlertStateNotificationTime(ctx.driverId, "STOP_EXTENDED");
              }
              await createNotification({
                type: "STOP_EXTENDED",
                severity: "WARNING",
                titleAr: "توقف طويل",
                titleEn: "Extended Stop Alert",
                messageAr: `توقف ${driverName} لأكثر من ${Math.round(stoppedDurationMinutes)} دقيقة خارج المطعم`,
                messageEn: `${driverName} has been stopped for over ${Math.round(stoppedDurationMinutes)} minutes outside the restaurant`,
                driverId: ctx.driverId,
                shiftId: ctx.shiftId,
                metadata: { stoppedDurationMinutes, latitude: ctx.latitude, longitude: ctx.longitude },
              });
            }
          }
        }
      } else {
        // Driver is moving or inside restaurant -> resolve stop alert
        if (stopState) {
          await resolveAlertState(ctx.driverId, "STOP_EXTENDED");
        }
      }
    }

    // 3. Battery Alerts
    if (alertSettings.batteryAlertEnabled && ctx.batteryPercentage != null) {
      const battery = ctx.batteryPercentage;
      const batteryState = await getAlertState(ctx.driverId, "BATTERY_LOW");

      if (battery <= alertSettings.criticalBatteryThreshold) {
        const timeSince = batteryState ? now.getTime() - new Date(batteryState.lastNotifiedAt).getTime() : Infinity;
        if (timeSince >= NOTIFICATION_COOLDOWN_MS) {
          await updateAlertState(ctx.driverId, "BATTERY_LOW", "CRITICAL");
          await createNotification({
            type: "BATTERY_CRITICAL",
            severity: "CRITICAL",
            titleAr: "بطارية حرجة",
            titleEn: "Critical Battery",
            messageAr: `مستوى بطارية هاتف ${driverName} حرج (${battery}%)`,
            messageEn: `Phone battery level for ${driverName} is critical (${battery}%)`,
            driverId: ctx.driverId,
            shiftId: ctx.shiftId,
            metadata: { batteryPercentage: battery },
          });
        }
      } else if (battery <= alertSettings.lowBatteryThreshold) {
        const timeSince = batteryState ? now.getTime() - new Date(batteryState.lastNotifiedAt).getTime() : Infinity;
        if (timeSince >= NOTIFICATION_COOLDOWN_MS) {
          await updateAlertState(ctx.driverId, "BATTERY_LOW", "LOW");
          await createNotification({
            type: "BATTERY_LOW",
            severity: "WARNING",
            titleAr: "بطارية منخفضة",
            titleEn: "Low Battery",
            messageAr: `مستوى بطارية هاتف ${driverName} منخفض (${battery}%)`,
            messageEn: `Phone battery level for ${driverName} is low (${battery}%)`,
            driverId: ctx.driverId,
            shiftId: ctx.shiftId,
            metadata: { batteryPercentage: battery },
          });
        }
      } else if (batteryState) {
        await resolveAlertState(ctx.driverId, "BATTERY_LOW");
      }
    }

    // 4. GPS Disabled Alert
    if (alertSettings.gpsAlertEnabled && ctx.locationServicesEnabled === false) {
      const gpsState = await getAlertState(ctx.driverId, "GPS_DISABLED");
      const timeSince = gpsState ? now.getTime() - new Date(gpsState.lastNotifiedAt).getTime() : Infinity;

      if (timeSince >= NOTIFICATION_COOLDOWN_MS) {
        await updateAlertState(ctx.driverId, "GPS_DISABLED", "DISABLED");
        await createNotification({
          type: "GPS_DISABLED",
          severity: "WARNING",
          titleAr: "خدمات الموقع معطلة",
          titleEn: "Location Services Disabled",
          messageAr: `قام ${driverName} بتعطيل خدمات الموقع (GPS)`,
          messageEn: `${driverName} disabled location services (GPS)`,
          driverId: ctx.driverId,
          shiftId: ctx.shiftId,
        });
      }
    } else if (ctx.locationServicesEnabled === true) {
      await resolveAlertState(ctx.driverId, "GPS_DISABLED");
    }

    // Resolving offline alert if driver just sent a location
    await resolveAlertState(ctx.driverId, "DRIVER_OFFLINE");
  } catch (err) {
    // Non-blocking error handling for alert evaluation
    console.error("Alert evaluation failed:", err);
  }
}

export async function evaluateDriverOfflineAlert(params: {
  driverId: string;
  driverName?: string;
  shiftId?: string | null;
  isOnline: boolean;
  offlineDurationMinutes?: number;
  lastSeen?: Date | null;
}) {
  try {
    const alertSettings = await getAlertSettings();
    if (!alertSettings.offlineAlertEnabled) return;

    const now = new Date();
    const offlineState = await getAlertState(params.driverId, "DRIVER_OFFLINE");

    if (!params.isOnline) {
      if (!offlineState) {
        await updateAlertState(params.driverId, "DRIVER_OFFLINE", "ALERTED", params.lastSeen ?? now);
        const driverName = params.driverName ?? "السائق";
        const duration = Math.round(params.offlineDurationMinutes ?? alertSettings.offlineGraceMinutes);
        await createNotification({
          type: "DRIVER_OFFLINE",
          severity: "WARNING",
          titleAr: "انقطاع الاتصال بالسائق",
          titleEn: "Driver Offline",
          messageAr: `انقطع الاتصال بـ ${driverName} منذ ${duration} دقيقة`,
          messageEn: `Lost connection to ${driverName} for ${duration} minutes`,
          driverId: params.driverId,
          shiftId: params.shiftId,
          metadata: { offlineDurationMinutes: duration, lastSeen: params.lastSeen },
        });
      } else {
        const isFirstAlert = offlineState.stateData !== "ALERTED";
        const timeSinceLastNotif = now.getTime() - new Date(offlineState.lastNotifiedAt).getTime();
        if (isFirstAlert || timeSinceLastNotif >= NOTIFICATION_COOLDOWN_MS) {
          if (isFirstAlert) {
            await updateAlertState(params.driverId, "DRIVER_OFFLINE", "ALERTED", offlineState.triggeredAt);
          } else {
            await updateAlertStateNotificationTime(params.driverId, "DRIVER_OFFLINE");
          }
          const driverName = params.driverName ?? "السائق";
          const duration = Math.round(params.offlineDurationMinutes ?? alertSettings.offlineGraceMinutes);
          await createNotification({
            type: "DRIVER_OFFLINE",
            severity: "WARNING",
            titleAr: "انقطاع الاتصال بالسائق",
            titleEn: "Driver Offline",
            messageAr: `انقطع الاتصال بـ ${driverName} منذ ${duration} دقيقة`,
            messageEn: `Lost connection to ${driverName} for ${duration} minutes`,
            driverId: params.driverId,
            shiftId: params.shiftId,
            metadata: { offlineDurationMinutes: duration, lastSeen: params.lastSeen },
          });
        }
      }
    } else if (offlineState) {
      await resolveAlertState(params.driverId, "DRIVER_OFFLINE");
    }
  } catch (err) {
    console.error("Offline alert evaluation failed:", err);
  }
}

export async function getAlertState(driverId: string, alertType: string) {
  const rows = await db
    .select()
    .from(alertStateTable)
    .where(
      and(
        eq(alertStateTable.driverId, driverId),
        eq(alertStateTable.alertType, alertType),
        isNull(alertStateTable.resolvedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function updateAlertState(
  driverId: string,
  alertType: string,
  stateData: string,
  triggeredAt?: Date,
) {
  const now = new Date();
  const rows = await db
    .select()
    .from(alertStateTable)
    .where(
      and(
        eq(alertStateTable.driverId, driverId),
        eq(alertStateTable.alertType, alertType),
      ),
    )
    .limit(1);

  const existing = rows[0] ?? null;

  if (existing) {
    await db
      .update(alertStateTable)
      .set({
        stateData,
        resolvedAt: null,
        lastNotifiedAt: now,
        triggeredAt: triggeredAt ?? now,
      })
      .where(eq(alertStateTable.id, existing.id));
  } else {
    await db.insert(alertStateTable).values({
      driverId,
      alertType,
      stateData,
      triggeredAt: triggeredAt ?? now,
      lastNotifiedAt: now,
    });
  }
}

export async function updateAlertStateNotificationTime(driverId: string, alertType: string) {
  const existing = await getAlertState(driverId, alertType);
  if (existing) {
    await db
      .update(alertStateTable)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(alertStateTable.id, existing.id));
  }
}

export async function resolveAlertState(driverId: string, alertType: string) {
  const existing = await getAlertState(driverId, alertType);
  if (existing && !existing.resolvedAt) {
    await db
      .update(alertStateTable)
      .set({ resolvedAt: new Date() })
      .where(eq(alertStateTable.id, existing.id));
  }
}

export async function evaluateAllActiveDriverAlerts() {
  try {
    const alertSettings = await getAlertSettings();
    if (!alertSettings.offlineAlertEnabled && !alertSettings.stopAlertEnabled) {
      return;
    }

    const activeShifts = await db
      .select({
        shiftId: shiftsTable.id,
        driverId: shiftsTable.driverId,
        startedAt: shiftsTable.startedAt,
        userName: usersTable.name,
      })
      .from(shiftsTable)
      .innerJoin(driversTable, eq(driversTable.id, shiftsTable.driverId))
      .innerJoin(usersTable, eq(usersTable.id, driversTable.userId))
      .where(eq(shiftsTable.status, "ACTIVE"));

    if (!activeShifts.length) {
      return;
    }

    const now = Date.now();
    const offlineThresholdMs = (alertSettings.offlineGraceMinutes || 5) * 60 * 1000;

    for (const shift of activeShifts) {
      const device = await db
        .select()
        .from(devicesTable)
        .where(eq(devicesTable.driverId, shift.driverId))
        .orderBy(desc(devicesTable.lastSeen), desc(devicesTable.updatedAt))
        .limit(1);

      const location = await db
        .select()
        .from(locationPointsTable)
        .where(eq(locationPointsTable.driverId, shift.driverId))
        .orderBy(desc(locationPointsTable.recordedAt))
        .limit(1);

      let lastSeenDate: Date | null = null;
      if (device[0]?.lastSeen) {
        lastSeenDate = new Date(device[0].lastSeen);
      } else if (location[0]?.recordedAt) {
        lastSeenDate = new Date(location[0].recordedAt);
      }

      const isOnline = lastSeenDate ? now - lastSeenDate.getTime() <= offlineThresholdMs : false;
      const offlineMinutes = (!isOnline && lastSeenDate)
        ? Math.floor((now - lastSeenDate.getTime()) / 60000)
        : (alertSettings.offlineGraceMinutes || 5);

      await evaluateDriverOfflineAlert({
        driverId: shift.driverId,
        driverName: shift.userName,
        shiftId: shift.shiftId,
        isOnline,
        offlineDurationMinutes: offlineMinutes,
        lastSeen: lastSeenDate,
      });
    }
  } catch (err) {
    console.error("Proactive alert evaluation cycle failed:", err);
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startAlertEvaluationScheduler(intervalMs = 30000): void {
  if (process.env.NODE_ENV === "test") return;
  if (schedulerTimer) return;

  setTimeout(() => {
    evaluateAllActiveDriverAlerts().catch((err) => {
      console.error("Initial alert evaluation failed:", err);
    });
  }, 5000);

  schedulerTimer = setInterval(() => {
    evaluateAllActiveDriverAlerts().catch((err) => {
      console.error("Scheduled alert evaluation failed:", err);
    });
  }, intervalMs);
}

export function stopAlertEvaluationScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}



