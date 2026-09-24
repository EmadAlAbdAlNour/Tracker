import { db, restaurantSettingsTable, alertSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface RestaurantSettingsData {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled: boolean;
  updatedAt?: Date;
  updatedBy?: string | null;
}

export interface AlertSettingsData {
  id?: string;
  maxStopDurationMinutes: number;
  offlineGraceMinutes: number;
  lowBatteryThreshold: number;
  criticalBatteryThreshold: number;
  maxShiftDurationHours: number;
  stopAlertEnabled: boolean;
  gpsAlertEnabled: boolean;
  offlineAlertEnabled: boolean;
  batteryAlertEnabled: boolean;
  restaurantGeofenceAlertEnabled: boolean;
  soundEnabled: boolean;
  inAppAlertsEnabled: boolean;
  pushAlertsEnabled: boolean;
  updatedAt?: Date;
}

const DEFAULT_RESTAURANT: Omit<RestaurantSettingsData, "id"> = {
  name: "Main Branch",
  latitude: 24.7136,
  longitude: 46.6753,
  radiusMeters: 150,
  enabled: true,
};

const DEFAULT_ALERTS: Omit<AlertSettingsData, "id"> = {
  maxStopDurationMinutes: 10,
  offlineGraceMinutes: 5,
  lowBatteryThreshold: 20,
  criticalBatteryThreshold: 10,
  maxShiftDurationHours: 12,
  stopAlertEnabled: true,
  gpsAlertEnabled: true,
  offlineAlertEnabled: true,
  batteryAlertEnabled: true,
  restaurantGeofenceAlertEnabled: true,
  soundEnabled: true,
  inAppAlertsEnabled: true,
  pushAlertsEnabled: false,
};

export async function getRestaurantSettings(): Promise<RestaurantSettingsData> {
  try {
    const q: any = db.select().from(restaurantSettingsTable);
    const rows = typeof q?.limit === "function" ? await q.limit(1) : (typeof q?.where === "function" ? await q.where().limit(1) : []);
    if (rows && rows[0]) {
      return {
        id: rows[0].id,
        name: rows[0].name,
        latitude: rows[0].latitude,
        longitude: rows[0].longitude,
        radiusMeters: rows[0].radiusMeters,
        enabled: rows[0].enabled,
        updatedAt: rows[0].updatedAt,
        updatedBy: rows[0].updatedBy,
      };
    }

    const [created] = await db
      .insert(restaurantSettingsTable)
      .values({
        name: DEFAULT_RESTAURANT.name,
        latitude: DEFAULT_RESTAURANT.latitude,
        longitude: DEFAULT_RESTAURANT.longitude,
        radiusMeters: DEFAULT_RESTAURANT.radiusMeters,
        enabled: DEFAULT_RESTAURANT.enabled,
      })
      .returning();

    return created ?? { ...DEFAULT_RESTAURANT };
  } catch {
    return { ...DEFAULT_RESTAURANT };
  }
}

export async function updateRestaurantSettings(
  input: Partial<RestaurantSettingsData>,
  userId?: string,
): Promise<RestaurantSettingsData> {
  const current = await getRestaurantSettings();

  if (current.id) {
    const [updated] = await db
      .update(restaurantSettingsTable)
      .set({
        name: input.name ?? current.name,
        latitude: input.latitude ?? current.latitude,
        longitude: input.longitude ?? current.longitude,
        radiusMeters: input.radiusMeters ?? current.radiusMeters,
        enabled: input.enabled ?? current.enabled,
        updatedAt: new Date(),
        updatedBy: userId ?? current.updatedBy,
      })
      .where(eq(restaurantSettingsTable.id, current.id))
      .returning();

    return updated ?? current;
  }

  const [created] = await db
    .insert(restaurantSettingsTable)
    .values({
      name: input.name ?? DEFAULT_RESTAURANT.name,
      latitude: input.latitude ?? DEFAULT_RESTAURANT.latitude,
      longitude: input.longitude ?? DEFAULT_RESTAURANT.longitude,
      radiusMeters: input.radiusMeters ?? DEFAULT_RESTAURANT.radiusMeters,
      enabled: input.enabled ?? DEFAULT_RESTAURANT.enabled,
      updatedBy: userId ?? null,
    })
    .returning();

  return created;
}

export async function getAlertSettings(): Promise<AlertSettingsData> {
  try {
    const q: any = db.select().from(alertSettingsTable);
    const rows = typeof q?.limit === "function" ? await q.limit(1) : (typeof q?.where === "function" ? await q.where().limit(1) : []);
    if (rows && rows[0]) {
      return {
        id: rows[0].id,
        maxStopDurationMinutes: rows[0].maxStopDurationMinutes,
        offlineGraceMinutes: rows[0].offlineGraceMinutes,
        lowBatteryThreshold: rows[0].lowBatteryThreshold,
        criticalBatteryThreshold: rows[0].criticalBatteryThreshold,
        maxShiftDurationHours: rows[0].maxShiftDurationHours,
        stopAlertEnabled: rows[0].stopAlertEnabled,
        gpsAlertEnabled: rows[0].gpsAlertEnabled,
        offlineAlertEnabled: rows[0].offlineAlertEnabled,
        batteryAlertEnabled: rows[0].batteryAlertEnabled,
        restaurantGeofenceAlertEnabled: rows[0].restaurantGeofenceAlertEnabled,
        soundEnabled: rows[0].soundEnabled,
        inAppAlertsEnabled: rows[0].inAppAlertsEnabled,
        pushAlertsEnabled: rows[0].pushAlertsEnabled,
        updatedAt: rows[0].updatedAt,
      };
    }

    const [created] = await db
      .insert(alertSettingsTable)
      .values({ ...DEFAULT_ALERTS })
      .returning();

    return created ?? { ...DEFAULT_ALERTS };
  } catch {
    return { ...DEFAULT_ALERTS };
  }
}

export async function updateAlertSettings(
  input: Partial<AlertSettingsData>,
): Promise<AlertSettingsData> {
  const current = await getAlertSettings();

  if (current.id) {
    const [updated] = await db
      .update(alertSettingsTable)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(alertSettingsTable.id, current.id))
      .returning();

    return updated ?? current;
  }

  const [created] = await db
    .insert(alertSettingsTable)
    .values({
      ...DEFAULT_ALERTS,
      ...input,
    })
    .returning();

  return created;
}

