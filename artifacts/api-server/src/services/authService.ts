import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, devicesTable, driversTable, locationPointsTable, refreshTokensTable, shiftsTable, usersTable } from "@workspace/db";
import { getEnv } from "../config/env";
import {
  findValidRefreshToken,
  getTokenPayload,
  getUserByEmailOrPhone,
  getUserById,
  hashPassword,
  hashRefreshToken,
  revokeRefreshTokenByHash,
  revokeUserRefreshTokens,
  sanitizeUser,
  signAccessToken,
  signRefreshToken,
  storeRefreshToken,
  verifyPassword,
} from "../lib/auth";
import { createError } from "../lib/errors";

const env = getEnv();

export async function loginUser(emailOrPhone: string, password: string) {
  // TEMPORARY DIAGNOSTIC LOGGING: remove after production auth diagnosis.
  const normalizedLoginInput = emailOrPhone.trim();
  console.log("[TEMP LOGIN DEBUG] normalized login input", {
    emailOrPhone: normalizedLoginInput,
  });

  const user = await getUserByEmailOrPhone(normalizedLoginInput);
  console.log("[TEMP LOGIN DEBUG] user lookup result", {
    found: !!user,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    active: user?.active ?? null,
  });

  if (!user) {
    throw createError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (!user.active) {
    throw createError(403, "AUTH_INACTIVE", "Account is inactive");
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  console.log("[TEMP LOGIN DEBUG] verifyPassword result", {
    isValid,
  });

  if (!isValid) {
    throw createError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const jti = randomUUID();
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role, jti);
  await storeRefreshToken(user.id, refreshToken);

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

export async function refreshSession(rawRefreshToken: string) {
  const payload = getTokenPayload(rawRefreshToken, env.jwtRefreshSecret);
  if (payload.type !== "refresh") {
    throw createError(401, "AUTH_INVALID_TOKEN", "Refresh token required");
  }

  const user = await getUserById(String(payload.sub));
  if (!user) {
    throw createError(401, "AUTH_INVALID_TOKEN", "User not found");
  }
  if (!user.active) {
    throw createError(403, "AUTH_INACTIVE", "Account is inactive");
  }

  const validRefreshToken = await findValidRefreshToken(rawRefreshToken, user.id);
  if (!validRefreshToken) {
    throw createError(401, "AUTH_INVALID_TOKEN", "Refresh token is invalid or revoked");
  }

  const refreshHash = hashRefreshToken(rawRefreshToken);
  await revokeRefreshTokenByHash(refreshHash);

  const nextJti = randomUUID();
  const accessToken = signAccessToken(user.id, user.role);
  const newRefreshToken = signRefreshToken(user.id, user.role, nextJti);
  await storeRefreshToken(user.id, newRefreshToken);

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logoutUser(userId: string, rawRefreshToken?: string) {
  if (rawRefreshToken) {
    await revokeRefreshTokenByHash(hashRefreshToken(rawRefreshToken));
    return true;
  }

  await revokeUserRefreshTokens(userId);
  return true;
}

export async function createDriverRecord(input: {
  name: string;
  email: string;
  phone?: string | null;
  employeeId: string;
  password: string;
  active?: boolean;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, normalizedEmail), eq(usersTable.phone, input.phone ?? "")))
    .limit(1);

  if (existingUser[0]) {
    throw createError(409, "USER_ALREADY_EXISTS", "A user with that email or phone already exists");
  }

  const existingEmployee = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.employeeId, input.employeeId.trim()))
    .limit(1);

  if (existingEmployee[0]) {
    throw createError(409, "DRIVER_EMPLOYEE_ID_EXISTS", "Employee ID already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({
        name: input.name.trim(),
        email: normalizedEmail,
        phone: input.phone?.trim() || null,
        passwordHash,
        role: "DRIVER",
        active: input.active ?? true,
      })
      .returning();

    if (!user) {
      throw createError(500, "USER_CREATION_FAILED", "Could not create user record");
    }

    const [driver] = await tx
      .insert(driversTable)
      .values({
        userId: user.id,
        employeeId: input.employeeId.trim(),
        active: input.active ?? true,
      })
      .returning();

    if (!driver) {
      throw createError(500, "DRIVER_CREATION_FAILED", "Could not create driver profile");
    }

    return { user, driver };
  });

  return {
    user: sanitizeUser(result.user),
    driver: result.driver,
  };
}

export async function listDrivers() {
  const rows = await db
    .select({
      id: driversTable.id,
      userId: driversTable.userId,
      employeeId: driversTable.employeeId,
      active: driversTable.active,
      createdAt: driversTable.createdAt,
      updatedAt: driversTable.updatedAt,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
    })
    .from(driversTable)
    .innerJoin(usersTable, eq(usersTable.id, driversTable.userId));

  return rows;
}

export async function getDriverById(driverId: string) {
  const rows = await db
    .select({
      id: driversTable.id,
      userId: driversTable.userId,
      employeeId: driversTable.employeeId,
      active: driversTable.active,
      createdAt: driversTable.createdAt,
      updatedAt: driversTable.updatedAt,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
    })
    .from(driversTable)
    .innerJoin(usersTable, eq(usersTable.id, driversTable.userId))
    .where(eq(driversTable.id, driverId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getDriverByUserId(userId: string) {
  const rows = await db.select().from(driversTable).where(eq(driversTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function updateDriverProfile(driverId: string, patch: Record<string, unknown>) {
  if (!Object.keys(patch).length) {
    return getDriverById(driverId);
  }

  const current = await getDriverById(driverId);
  if (!current) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  if (patch.employeeId) {
    const existing = await db.select().from(driversTable).where(eq(driversTable.employeeId, String(patch.employeeId))).limit(1);
    if (existing[0] && existing[0].id !== driverId) {
      throw createError(409, "DRIVER_EMPLOYEE_ID_EXISTS", "Employee ID already exists");
    }
  }

  return db.transaction(async (tx) => {
    if (patch.employeeId || patch.active !== undefined) {
      await tx
        .update(driversTable)
        .set({
          employeeId: patch.employeeId ? String(patch.employeeId) : current.employeeId,
          active: patch.active !== undefined ? Boolean(patch.active) : current.active,
          updatedAt: new Date(),
        })
        .where(eq(driversTable.id, driverId));
    }

    if (patch.name || patch.email || patch.phone !== undefined || patch.password) {
      const userRow = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, current.userId))
        .limit(1);
      const user = userRow[0];
      if (!user) {
        throw createError(404, "USER_NOT_FOUND", "User not found");
      }

      const nextEmail = patch.email ? String(patch.email).trim().toLowerCase() : user.email;
      const nextPhone = patch.phone !== undefined && String(patch.phone).trim() !== "" ? String(patch.phone).trim() : user.phone;

      await tx
        .update(usersTable)
        .set({
          name: patch.name ? String(patch.name).trim() : user.name,
          email: nextEmail,
          phone: nextPhone,
          passwordHash: patch.password ? await hashPassword(String(patch.password)) : user.passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, user.id));
    }

    return getDriverById(driverId);
  });
}

export async function getCurrentDriverProfile(userId: string) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  const currentUser = await getUserById(userId);
  if (!currentUser) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  const activeShift = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.driverId, driver.id), eq(shiftsTable.status, "ACTIVE")))
    .limit(1);

  const device = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.driverId, driver.id))
    .orderBy(desc(devicesTable.lastSeen), desc(devicesTable.updatedAt))
    .limit(1);

  return {
    driver: {
      id: driver.id,
      userId: driver.userId,
      employeeId: driver.employeeId,
      active: driver.active,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone,
      role: currentUser.role,
      currentShiftStatus: activeShift[0]?.status ?? null,
      currentShiftStartedAt: activeShift[0]?.startedAt ?? null,
      device: device[0] ?? null,
    },
  };
}

export async function registerDriverDevice(userId: string, input: { platform: string; deviceIdentifier?: string | null; appVersion?: string | null }) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  const normalizedPlatform = input.platform.trim();
  const normalizedIdentifier = input.deviceIdentifier?.trim() || null;
  const normalizedAppVersion = input.appVersion?.trim() || null;
  const now = new Date();

  const existingDevice = normalizedIdentifier
    ? await db
        .select()
        .from(devicesTable)
        .where(
          and(
            eq(devicesTable.driverId, driver.id),
            eq(devicesTable.platform, normalizedPlatform),
            eq(devicesTable.deviceIdentifier, normalizedIdentifier),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(devicesTable)
        .where(and(eq(devicesTable.driverId, driver.id), eq(devicesTable.platform, normalizedPlatform)))
        .orderBy(desc(devicesTable.lastSeen), desc(devicesTable.updatedAt))
        .limit(1);

  if (existingDevice[0]) {
    const [updated] = await db
      .update(devicesTable)
      .set({
        deviceIdentifier: normalizedIdentifier ?? existingDevice[0].deviceIdentifier,
        appVersion: normalizedAppVersion ?? existingDevice[0].appVersion,
        lastSeen: now,
        updatedAt: now,
      })
      .where(eq(devicesTable.id, existingDevice[0].id))
      .returning();

    return updated ?? existingDevice[0];
  }

  const [created] = await db
    .insert(devicesTable)
    .values({
      driverId: driver.id,
      platform: normalizedPlatform,
      deviceIdentifier: normalizedIdentifier,
      appVersion: normalizedAppVersion,
      lastSeen: now,
      lastLocationAt: null,
    })
    .returning();

  if (!created) {
    throw createError(500, "DEVICE_REGISTRATION_FAILED", "Device registration failed");
  }

  return created;
}

export async function getDriverDevice(userId: string) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  const rows = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.driverId, driver.id))
    .orderBy(desc(devicesTable.lastSeen), desc(devicesTable.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function submitDriverLocation(
  userId: string,
  input: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
    recordedAt: string;
    source?: string;
    clientLocationId?: string | null;
  },
) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  if (!driver.active) {
    throw createError(403, "DRIVER_INACTIVE", "Driver account is inactive");
  }

  const activeShift = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.driverId, driver.id), eq(shiftsTable.status, "ACTIVE")))
    .orderBy(desc(shiftsTable.startedAt))
    .limit(1);

  if (!activeShift[0]) {
    throw createError(409, "SHIFT_NOT_ACTIVE", "Driver is not on an active shift");
  }

  const recordedAt = new Date(input.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) {
    throw createError(400, "INVALID_TIMESTAMP", "recordedAt must be a valid timestamp");
  }

  const normalizedClientId = input.clientLocationId?.trim() || null;
  const receivedAt = new Date();

  if (normalizedClientId) {
    const existing = await db
      .select()
      .from(locationPointsTable)
      .where(and(eq(locationPointsTable.driverId, driver.id), eq(locationPointsTable.clientLocationId, normalizedClientId)))
      .limit(1);

    if (existing[0]) {
      return existing[0];
    }
  }

  const [point] = await db
    .insert(locationPointsTable)
    .values({
      driverId: driver.id,
      shiftId: activeShift[0].id,
      clientLocationId: normalizedClientId,
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      accuracy: input.accuracy == null ? null : Number(input.accuracy),
      altitude: input.altitude == null ? null : Number(input.altitude),
      speed: input.speed == null ? null : Number(input.speed),
      heading: input.heading == null ? null : Number(input.heading),
      recordedAt,
      receivedAt,
      source: input.source?.trim() || "mobile",
      createdAt: receivedAt,
    })
    .returning();

  if (!point) {
    throw createError(500, "LOCATION_SAVE_FAILED", "Could not store location");
  }

  await db
    .update(devicesTable)
    .set({
      lastSeen: receivedAt,
      lastLocationAt: receivedAt,
      updatedAt: receivedAt,
    })
    .where(eq(devicesTable.driverId, driver.id));

  return point;
}

export async function getLatestDriverLocation(driverId: string) {
  const rows = await db
    .select()
    .from(locationPointsTable)
    .where(eq(locationPointsTable.driverId, driverId))
    .orderBy(desc(locationPointsTable.recordedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function listDriverLocations(driverId: string, options?: { page?: number; limit?: number }) {
  return db
    .select()
    .from(locationPointsTable)
    .where(eq(locationPointsTable.driverId, driverId))
    .orderBy(desc(locationPointsTable.recordedAt))
    .limit(options?.limit ?? 20)
    .offset(((options?.page ?? 1) - 1) * (options?.limit ?? 20));
}

export async function getDriverTrackingStatus(driverId: string) {
  const activeShift = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.driverId, driverId), eq(shiftsTable.status, "ACTIVE")))
    .orderBy(desc(shiftsTable.startedAt))
    .limit(1);

  const latestLocation = await getLatestDriverLocation(driverId);
  const device = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.driverId, driverId))
    .orderBy(desc(devicesTable.lastSeen), desc(devicesTable.updatedAt))
    .limit(1);

  return {
    driverId,
    activeShift: activeShift[0] ?? null,
    trackingActive: Boolean(activeShift[0]),
    latestLocation: latestLocation ?? null,
    lastSeen: device[0]?.lastSeen ?? null,
    lastLocationAt: device[0]?.lastLocationAt ?? null,
  };
}

export async function startDriverShift(userId: string) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  const user = await getUserById(userId);
  if (!user || user.role !== "DRIVER") {
    throw createError(403, "AUTH_FORBIDDEN", "Only drivers can start a shift");
  }

  if (!driver.active) {
    throw createError(403, "DRIVER_INACTIVE", "Driver account is inactive");
  }

  const existingActive = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.driverId, driver.id), eq(shiftsTable.status, "ACTIVE")))
    .limit(1);

  if (existingActive[0]) {
    throw createError(409, "SHIFT_ALREADY_ACTIVE", "An active shift already exists");
  }

  const [shift] = await db
    .insert(shiftsTable)
    .values({
      driverId: driver.id,
      status: "ACTIVE",
      startedAt: new Date(),
    })
    .returning();

  if (!shift) {
    throw createError(500, "SHIFT_START_FAILED", "Could not start shift");
  }

  return shift;
}

export async function endDriverShift(userId: string) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  const activeShift = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.driverId, driver.id), eq(shiftsTable.status, "ACTIVE")))
    .orderBy(desc(shiftsTable.startedAt))
    .limit(1);

  if (!activeShift[0]) {
    throw createError(404, "NO_ACTIVE_SHIFT", "No active shift found");
  }

  const [shift] = await db
    .update(shiftsTable)
    .set({
      endedAt: new Date(),
      status: "COMPLETED",
      updatedAt: new Date(),
    })
    .where(eq(shiftsTable.id, activeShift[0].id))
    .returning();

  if (!shift) {
    throw createError(500, "SHIFT_END_FAILED", "Could not end shift");
  }

  return shift;
}

export async function listShiftsForDriver(driverId: string, options?: { status?: "ACTIVE" | "COMPLETED"; from?: string; to?: string; page?: number; limit?: number }) {
  const filters = [eq(shiftsTable.driverId, driverId)];
  if (options?.status) {
    filters.push(eq(shiftsTable.status, options.status));
  }
  if (options?.from) {
    filters.push(sql`${shiftsTable.startedAt} >= ${new Date(options.from)}`);
  }
  if (options?.to) {
    filters.push(sql`${shiftsTable.startedAt} <= ${new Date(options.to)}`);
  }

  return db
    .select()
    .from(shiftsTable)
    .where(and(...filters))
    .orderBy(desc(shiftsTable.startedAt))
    .limit(options?.limit ?? 20)
    .offset(((options?.page ?? 1) - 1) * (options?.limit ?? 20));
}

export async function listDriverShiftsForUser(userId: string, options?: { page?: number; limit?: number; status?: "ACTIVE" | "COMPLETED"; from?: string; to?: string }) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  return listShiftsForDriver(driver.id, options);
}

export async function getDriverShiftsById(currentUser: { id: string; role: string }, driverId: string, options?: { page?: number; limit?: number; status?: "ACTIVE" | "COMPLETED"; from?: string; to?: string }) {
  if (currentUser.role === "DRIVER") {
    const ownDriver = await getDriverByUserId(currentUser.id);
    if (!ownDriver || ownDriver.id !== driverId) {
      throw createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's shift history");
    }
  }

  if (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGER" && currentUser.role !== "DRIVER") {
    throw createError(403, "AUTH_FORBIDDEN", "Access denied");
  }

  return listShiftsForDriver(driverId, options);
}
