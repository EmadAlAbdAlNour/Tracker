import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
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

export async function loginUser(emailOrPhone: string, password: string, device?: { platform: string; deviceIdentifier?: string | null; appVersion?: string | null }) {
  const normalizedLoginInput = emailOrPhone.trim();

  const user = await getUserByEmailOrPhone(normalizedLoginInput);

  if (!user) {
    throw createError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (!user.active) {
    throw createError(403, "AUTH_INACTIVE", "Account is inactive");
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw createError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const jti = randomUUID();
  const refreshToken = signRefreshToken(user.id, user.role, jti);
  let boundDeviceId: string | null = null;

  // Device binding enforcement for DRIVER role
  if (user.role === "DRIVER") {
    if (!device || !device.platform || !device.deviceIdentifier) {
      throw createError(400, "AUTH_DEVICE_REQUIRED", "Driver login requires device information");
    }

    const driver = await getDriverByUserId(user.id);
    if (!driver) {
      throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
    }

    // current authorized device (if any)
    const authorized = await db
      .select()
      .from(devicesTable)
      .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)))
      .limit(1);

    // upsert/update device metadata (do not change authorized flag here)
    const registeredDevice = await registerDriverDevice(user.id, device);

    if (!authorized[0]) {
      // no authorized device exists => bind this device
      await db.update(devicesTable).set({ authorized: true, updatedAt: new Date() } as any).where(eq(devicesTable.id, registeredDevice.id));
      // Clean up superseded un-authorized device records for this driver so superseded devices don't linger
      await db.delete(devicesTable).where(and(eq(devicesTable.driverId, driver.id), ne(devicesTable.id, registeredDevice.id)));
      await storeRefreshToken(user.id, refreshToken, registeredDevice.id);
      boundDeviceId = registeredDevice.id;
    } else if (authorized[0].id === registeredDevice.id) {
      // same authorized device re-logging in
      await storeRefreshToken(user.id, refreshToken, registeredDevice.id);
      boundDeviceId = registeredDevice.id;
    } else {
      // another device is authorized -> reject
      throw createError(403, "AUTH_DEVICE_MISMATCH", "This account is linked to another device. An administrator must reset the device.");
    }
  } else {
    // non-driver: allow optional device info but do not bind tokens to devices
    await storeRefreshToken(user.id, refreshToken, null);
  }

  const accessToken = signAccessToken(user.id, user.role, boundDeviceId);

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

  // If the token is device-bound, verify device still exists and is authorized
  if ((validRefreshToken as any).deviceId) {
    const deviceRow = await db.select().from(devicesTable).where(eq(devicesTable.id, (validRefreshToken as any).deviceId)).limit(1);
    if (!deviceRow[0] || !(deviceRow[0] as any).authorized) {
      throw createError(401, "AUTH_INVALID_DEVICE", "Device not authorized");
    }
  }

  const refreshHash = hashRefreshToken(rawRefreshToken);
  await revokeRefreshTokenByHash(refreshHash);

  const nextJti = randomUUID();
  const accessToken = signAccessToken(user.id, user.role);
  const newRefreshToken = signRefreshToken(user.id, user.role, nextJti);
  // inherit device binding if present
  await storeRefreshToken(user.id, newRefreshToken, (validRefreshToken as any).deviceId ?? null);

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
  const normalizedPhone = input.phone?.trim() || null;
  const existingUser = await db
    .select()
    .from(usersTable)
    .where(
      normalizedPhone
        ? or(eq(usersTable.email, normalizedEmail), eq(usersTable.phone, normalizedPhone))
        : eq(usersTable.email, normalizedEmail)
    )
    .limit(1);

  if (existingUser[0]) {
    if (existingUser[0].email.toLowerCase() === normalizedEmail) {
      throw createError(409, "EMAIL_EXISTS", "A user with that email already exists");
    }
    throw createError(409, "PHONE_EXISTS", "A user with that phone already exists");
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

export async function listDrivers(options?: { page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;
  const offset = (Math.max(1, page) - 1) * limit;

  const items = await db
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
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ total: sql`count(1)` })
    .from(driversTable)
    .innerJoin(usersTable, eq(usersTable.id, driversTable.userId));

  const total = Number((totalRow[0] as any)?.total ?? 0);

  return { items, total };
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
    if (patch.employeeId !== undefined || patch.active !== undefined) {
      const nextActive = patch.active !== undefined ? Boolean(patch.active) : current.active;
      await tx
        .update(driversTable)
        .set({
          employeeId: patch.employeeId ? String(patch.employeeId) : current.employeeId,
          active: nextActive,
          updatedAt: new Date(),
        })
        .where(eq(driversTable.id, driverId));

      if (patch.active !== undefined) {
        await tx
          .update(usersTable)
          .set({
            active: nextActive,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, current.userId));

        if (!nextActive) {
          // Deactivation: close active shifts, revoke tokens, unauthorize devices
          await tx
            .update(shiftsTable)
            .set({
              status: "COMPLETED",
              endedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(shiftsTable.driverId, driverId), eq(shiftsTable.status, "ACTIVE")));

          await tx
            .update(devicesTable)
            .set({ authorized: false, updatedAt: new Date() } as any)
            .where(eq(devicesTable.driverId, driverId));

          await revokeUserRefreshTokens(current.userId);
        }
      }
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

      let nextEmail = user.email;
      if (patch.email) {
        const candidateEmail = String(patch.email).trim().toLowerCase();
        if (candidateEmail !== user.email.toLowerCase()) {
          const emailConflict = await tx.select().from(usersTable).where(eq(usersTable.email, candidateEmail)).limit(1);
          if (emailConflict[0]) {
            throw createError(409, "EMAIL_EXISTS", "Email is already taken by another user");
          }
          nextEmail = candidateEmail;
        }
      }

      let nextPhone = user.phone;
      if (patch.phone !== undefined) {
        const candidatePhone = String(patch.phone).trim() || null;
        if (candidatePhone && candidatePhone !== user.phone) {
          const phoneConflict = await tx.select().from(usersTable).where(eq(usersTable.phone, candidatePhone)).limit(1);
          if (phoneConflict[0]) {
            throw createError(409, "PHONE_EXISTS", "Phone number is already taken by another user");
          }
        }
        nextPhone = candidatePhone;
      }

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
    .where(and(eq(devicesTable.driverId, driver.id), eq(devicesTable.authorized, true)))
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

let __testRegisterDriverDeviceOverride: null | ((userId: string, input: { platform: string; deviceIdentifier?: string | null; appVersion?: string | null }) => Promise<any>) = null;
export function __setTestRegisterDriverDeviceOverride(fn: null | ((userId: string, input: { platform: string; deviceIdentifier?: string | null; appVersion?: string | null }) => Promise<any>)) {
  __testRegisterDriverDeviceOverride = fn;
}

export async function registerDriverDevice(userId: string, input: { platform: string; deviceIdentifier?: string | null; appVersion?: string | null }) {
  // testing hook: allow tests to override device registration behavior without touching DB
  if (__testRegisterDriverDeviceOverride) {
    return await __testRegisterDriverDeviceOverride(userId, input);
  }
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

  // check for currently authorized device for this driver
  const authorized = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)))
    .limit(1);

  if (authorized[0]) {
    // if the existing device matches the authorized device -> allow update
    if (existingDevice[0] && existingDevice[0].id === authorized[0].id) {
      const [updatedAuth] = await db
        .update(devicesTable)
        .set({
          deviceIdentifier: normalizedIdentifier ?? existingDevice[0].deviceIdentifier,
          appVersion: normalizedAppVersion ?? existingDevice[0].appVersion,
          lastSeen: now,
          updatedAt: now,
        })
        .where(eq(devicesTable.id, existingDevice[0].id))
        .returning();

      return updatedAuth ?? existingDevice[0];
    }

    // authorized device exists and differs -> registration of a different device is forbidden
    if (!existingDevice[0] || existingDevice[0].id !== authorized[0].id) {
      throw createError(403, "AUTH_DEVICE_MISMATCH", "This account is linked to another device. An administrator must reset the device.");
    }
  }

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
    .where(and(eq(devicesTable.driverId, driver.id), eq(devicesTable.authorized, true)))
    .orderBy(desc(devicesTable.lastSeen), desc(devicesTable.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function resetDriverDeviceByDriverId(driverId: string) {
  // find authorized device for driver
  const authorized = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.driverId, driverId), eq((devicesTable as any).authorized, true)))
    .limit(1);

  if (!authorized[0]) {
    throw createError(404, "DEVICE_NOT_FOUND", "No authorized device found for this driver");
  }

  const deviceId = authorized[0].id;

  // mark unauthorized
  await db.update(devicesTable).set({ authorized: false, updatedAt: new Date() } as any).where(eq(devicesTable.id, deviceId));

  // revoke all refresh tokens associated with that device
  const { revokeRefreshTokensByDevice } = await import("../lib/auth");
  await revokeRefreshTokensByDevice(deviceId);

  return true;
}

export async function assignDriverDevice(
  driverId: string,
  deviceInput: {
    deviceId?: string;
    platform?: "ANDROID" | "IOS" | "WEB";
    deviceIdentifier?: string;
    appVersion?: string;
  },
) {
  const driver = await getDriverById(driverId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  const now = new Date();

  return await db.transaction(async (tx) => {
    // 1. Atomically revoke and unauthorize ALL old authorized devices for this driver
    const oldAuthorized = await tx
      .select()
      .from(devicesTable)
      .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)));

    for (const oldDev of oldAuthorized) {
      await tx
        .update(devicesTable)
        .set({ authorized: false, updatedAt: now } as any)
        .where(eq(devicesTable.id, oldDev.id));

      await tx
        .update(refreshTokensTable)
        .set({ revokedAt: now })
        .where(eq(refreshTokensTable.deviceId, oldDev.id));
    }

    // 2. Locate or create target device
    let targetDevice: any = null;
    if (deviceInput.deviceId) {
      const existing = await tx
        .select()
        .from(devicesTable)
        .where(eq(devicesTable.id, deviceInput.deviceId))
        .limit(1);
      if (existing[0]) {
        targetDevice = existing[0];
      }
    } else if (deviceInput.deviceIdentifier) {
      const existing = await tx
        .select()
        .from(devicesTable)
        .where(
          and(
            eq(devicesTable.driverId, driver.id),
            eq(devicesTable.deviceIdentifier, deviceInput.deviceIdentifier),
          ),
        )
        .limit(1);
      if (existing[0]) {
        targetDevice = existing[0];
      }
    }

    if (targetDevice) {
      const [updated] = await tx
        .update(devicesTable)
        .set({
          driverId: driver.id,
          authorized: true,
          platform: (deviceInput.platform as any) ?? targetDevice.platform,
          deviceIdentifier: deviceInput.deviceIdentifier ?? targetDevice.deviceIdentifier,
          appVersion: deviceInput.appVersion ?? targetDevice.appVersion,
          updatedAt: now,
        } as any)
        .where(eq(devicesTable.id, targetDevice.id))
        .returning();
      targetDevice = updated ?? targetDevice;
    } else {
      const [created] = await tx
        .insert(devicesTable)
        .values({
          driverId: driver.id,
          platform: (deviceInput.platform as any) ?? "ANDROID",
          deviceIdentifier: deviceInput.deviceIdentifier ?? `dev_${randomUUID().slice(0, 8)}`,
          appVersion: deviceInput.appVersion ?? "1.0.0",
          authorized: true,
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning();
      targetDevice = created;
    }

    return targetDevice;
  });
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
    batteryPercentage?: number | null;
    isCharging?: boolean | null;
    locationServicesEnabled?: boolean | null;
    networkStatus?: string | null;
  },
  requestDeviceId?: string | null,
) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  if (!driver.active) {
    throw createError(403, "DRIVER_INACTIVE", "Driver account is inactive");
  }

  const authorizedDevice = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)))
    .limit(1);

  if (!authorizedDevice[0]) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Driver device is not authorized or has been revoked");
  }

  if (requestDeviceId && authorizedDevice[0].id !== requestDeviceId) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Device authorization has been revoked or replaced");
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

  const deviceUpdates: Record<string, unknown> = {
    lastSeen: receivedAt,
    lastLocationAt: receivedAt,
    updatedAt: receivedAt,
  };
  if (input.batteryPercentage !== undefined) deviceUpdates.batteryPercentage = input.batteryPercentage;
  if (input.isCharging !== undefined) deviceUpdates.isCharging = input.isCharging;
  if (input.locationServicesEnabled !== undefined) deviceUpdates.locationServicesEnabled = input.locationServicesEnabled;
  if (input.networkStatus !== undefined) deviceUpdates.networkStatus = input.networkStatus;

  await db
    .update(devicesTable)
    .set(deviceUpdates as any)
    .where(eq(devicesTable.driverId, driver.id));

  // Non-blocking alert evaluation
  import("./alertService").then(async ({ evaluateDriverAlerts }) => {
    const user = await getUserById(userId);
    evaluateDriverAlerts({
      driverId: driver.id,
      driverName: user?.name,
      shiftId: activeShift[0].id,
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      speed: input.speed,
      recordedAt,
      batteryPercentage: input.batteryPercentage,
      locationServicesEnabled: input.locationServicesEnabled,
    }).catch((err) => console.error("Single location alert evaluation error:", err));
  }).catch((err) => console.error("Alert service module load error:", err));

  return point;
}

export async function submitDriverLocationBatch(
  userId: string,
  inputs: Array<{
    clientLocationId?: string | null;
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
    recordedAt: string;
    source?: string;
    batteryPercentage?: number | null;
    isCharging?: boolean | null;
    locationServicesEnabled?: boolean | null;
    networkStatus?: string | null;
  }>,
  requestDeviceId?: string | null,
) {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
  }

  if (!driver.active) {
    throw createError(403, "DRIVER_INACTIVE", "Driver account is inactive");
  }

  const authorizedDevice = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)))
    .limit(1);

  if (!authorizedDevice[0]) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Driver device is not authorized or has been revoked");
  }

  if (requestDeviceId && authorizedDevice[0].id !== requestDeviceId) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Device authorization has been revoked or replaced");
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

  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw createError(400, "INVALID_BATCH", "Batch must contain at least one point");
  }

  if (inputs.length > 20) {
    throw createError(400, "BATCH_TOO_LARGE", "Batch size exceeds maximum of 20 points");
  }

  // validate timestamps and coerce numbers
  const now = new Date();
  const fullValues: any[] = [];
  const rowPlaceholders: string[] = [];
  let p = 1;
  for (const it of inputs) {
    const clientId = it.clientLocationId?.trim() || null;
    const recordedAt = new Date(it.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      throw createError(400, "INVALID_TIMESTAMP", "recordedAt must be a valid timestamp");
    }
    const receivedAt = new Date();
    const source = it.source?.trim() || 'mobile';
    const createdAt = receivedAt;

    // placeholders: driver_id, shift_id, client_location_id, latitude, longitude, accuracy, altitude, speed, heading, recorded_at, received_at, source, created_at
    const ph = `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`;
    rowPlaceholders.push(ph);
    fullValues.push(driver.id, activeShift[0].id, clientId, Number(it.latitude), Number(it.longitude), it.accuracy == null ? null : Number(it.accuracy), it.altitude == null ? null : Number(it.altitude), it.speed == null ? null : Number(it.speed), it.heading == null ? null : Number(it.heading), recordedAt, receivedAt, source, createdAt);
  }

  const sqlText = `INSERT INTO location_points (driver_id, shift_id, client_location_id, latitude, longitude, accuracy, altitude, speed, heading, recorded_at, received_at, source, created_at) VALUES ${rowPlaceholders.join(', ')} ON CONFLICT (driver_id, client_location_id) WHERE client_location_id IS NOT NULL DO NOTHING RETURNING client_location_id`;

  // Use raw pool query to perform the bulk insert with ON CONFLICT DO NOTHING
  const { pool } = await import("@workspace/db");
  const result = await pool.query(sqlText, fullValues);

  const insertedClientIds = (result.rows ?? []).map((r: any) => r.client_location_id).filter(Boolean);
  const accepted = insertedClientIds.length;
  const duplicates = inputs.length - accepted;

  // update devices lastSeen/lastLocationAt and telemetry from latest point
  const lastPoint = inputs[inputs.length - 1];
  const deviceUpdates: Record<string, unknown> = {
    lastSeen: now,
    lastLocationAt: now,
    updatedAt: now,
  };
  if (lastPoint.batteryPercentage !== undefined) deviceUpdates.batteryPercentage = lastPoint.batteryPercentage;
  if (lastPoint.isCharging !== undefined) deviceUpdates.isCharging = lastPoint.isCharging;
  if (lastPoint.locationServicesEnabled !== undefined) deviceUpdates.locationServicesEnabled = lastPoint.locationServicesEnabled;
  if (lastPoint.networkStatus !== undefined) deviceUpdates.networkStatus = lastPoint.networkStatus;

  await db
    .update(devicesTable)
    .set(deviceUpdates as any)
    .where(eq(devicesTable.driverId, driver.id));

  // Non-blocking alert evaluation on latest point
  import("./alertService").then(async ({ evaluateDriverAlerts }) => {
    const user = await getUserById(userId);
    evaluateDriverAlerts({
      driverId: driver.id,
      driverName: user?.name,
      shiftId: activeShift[0].id,
      latitude: Number(lastPoint.latitude),
      longitude: Number(lastPoint.longitude),
      speed: lastPoint.speed,
      recordedAt: new Date(lastPoint.recordedAt),
      batteryPercentage: lastPoint.batteryPercentage,
      locationServicesEnabled: lastPoint.locationServicesEnabled,
    }).catch((err) => console.error("Batch location alert evaluation error:", err));
  }).catch((err) => console.error("Alert service module load error in batch:", err));

  return { accepted, duplicates, acceptedClientIds: insertedClientIds };
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
  const page = Math.max(1, options?.page ?? 1);
  const limit = options?.limit ?? 20;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(locationPointsTable)
      .where(eq(locationPointsTable.driverId, driverId))
      .orderBy(desc(locationPointsTable.recordedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(locationPointsTable)
      .where(eq(locationPointsTable.driverId, driverId)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  return { items, total };
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
    .where(and(eq(devicesTable.driverId, driverId), eq(devicesTable.authorized, true)))
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

export async function startDriverShift(userId: string, requestDeviceId?: string | null) {
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

  const authorizedDevice = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)))
    .limit(1);

  if (!authorizedDevice[0]) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Driver device is not authorized or has been revoked");
  }

  if (requestDeviceId && authorizedDevice[0].id !== requestDeviceId) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Device authorization has been revoked or replaced");
  }

  const existingActive = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.driverId, driver.id), eq(shiftsTable.status, "ACTIVE")))
    .limit(1);

  if (existingActive[0]) {
    const shiftStart = new Date(existingActive[0].startedAt).getTime();
    const shiftHours = (Date.now() - shiftStart) / (1000 * 60 * 60);
    // Auto-complete stale shift if open for 14+ hours
    if (shiftHours >= 14) {
      await db
        .update(shiftsTable)
        .set({
          endedAt: new Date(),
          status: "COMPLETED",
          updatedAt: new Date(),
        })
        .where(eq(shiftsTable.id, existingActive[0].id));
    } else {
      throw createError(409, "SHIFT_ALREADY_ACTIVE", "An active shift already exists");
    }
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

  const page = Math.max(1, options?.page ?? 1);
  const limit = options?.limit ?? 20;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(shiftsTable)
      .where(and(...filters))
      .orderBy(desc(shiftsTable.startedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(shiftsTable)
      .where(and(...filters)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  const normalizedItems = items.map((shift) => ({
    ...shift,
    startTime: shift.startedAt ? new Date(shift.startedAt).toISOString() : null,
  }));
  return { items: normalizedItems, total };
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

  if (currentUser.role !== "ADMIN" && currentUser.role !== "DRIVER" && currentUser.role !== "CALL_CENTER") {
    throw createError(403, "AUTH_FORBIDDEN", "Access denied");
  }

  return listShiftsForDriver(driverId, options);
}
