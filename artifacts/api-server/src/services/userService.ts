import {
  db,
  usersTable,
  driversTable,
  devicesTable,
  shiftsTable,
  refreshTokensTable,
  notificationsTable,
  notificationReadsTable,
  locationPointsTable,
  alertStateTable,
} from "@workspace/db";
import { eq, and, or, ilike, desc, sql, inArray } from "drizzle-orm";
import { hashPassword, sanitizeUser, revokeUserRefreshTokens } from "../lib/auth";
import { createError } from "../lib/errors";

export interface ListUsersParams {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string | null;
  role: "ADMIN" | "CALL_CENTER" | "DRIVER";
  password?: string;
  active?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: "ADMIN" | "CALL_CENTER" | "DRIVER";
  password?: string;
  active?: boolean;
}

export async function listUsers(params: ListUsersParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (params.role) {
    conditions.push(eq(usersTable.role, params.role as any));
  }

  if (params.search) {
    const term = `%${params.search.trim()}%`;
    conditions.push(or(ilike(usersTable.name, term), ilike(usersTable.email, term), ilike(usersTable.phone, term)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(usersTable)
      .where(whereClause)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return {
    items: rows.map(sanitizeUser),
    total,
    page,
    limit,
  };
}

export async function getUserById(id: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return rows[0] ? sanitizeUser(rows[0]) : null;
}

export async function createUser(input: CreateUserInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = input.phone?.trim() || null;

  // Check unique email / phone
  const existing = await db
    .select()
    .from(usersTable)
    .where(
      normalizedPhone
        ? or(eq(usersTable.email, normalizedEmail), eq(usersTable.phone, normalizedPhone))
        : eq(usersTable.email, normalizedEmail)
    )
    .limit(1);

  if (existing[0]) {
    if (existing[0].email.toLowerCase() === normalizedEmail) {
      throw createError(409, "EMAIL_EXISTS", "A user with this email already exists");
    }
    throw createError(409, "PHONE_EXISTS", "A user with this phone number already exists");
  }

  if (!input.password) {
    throw createError(400, "PASSWORD_REQUIRED", "A password is required to create a user");
  }

  const passwordHash = await hashPassword(input.password);

  const [user] = await db
    .insert(usersTable)
    .values({
      name: input.name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      role: input.role,
      passwordHash,
      active: input.active ?? true,
    })
    .returning();

  return sanitizeUser(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing[0]) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.email !== undefined) {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (normalizedEmail !== existing[0].email.toLowerCase()) {
      const emailConflict = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
      if (emailConflict[0]) {
        throw createError(409, "EMAIL_EXISTS", "Email is already taken by another user");
      }
      updateData.email = normalizedEmail;
    }
  }
  if (input.phone !== undefined) {
    const normalizedPhone = input.phone?.trim() || null;
    if (normalizedPhone && normalizedPhone !== existing[0].phone) {
      const phoneConflict = await db.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
      if (phoneConflict[0]) {
        throw createError(409, "PHONE_EXISTS", "Phone number is already taken by another user");
      }
    }
    updateData.phone = normalizedPhone;
  }
  if (input.role !== undefined) updateData.role = input.role;
  if (input.active !== undefined) {
    updateData.active = input.active;
    if (!input.active) {
      // Revoke all refresh tokens if deactivated
      await revokeUserRefreshTokens(id);
    }
  }
  if (input.password) {
    updateData.passwordHash = await hashPassword(input.password);
    // Revoke sessions on password reset
    await revokeUserRefreshTokens(id);
  }

  const [updated] = await db
    .update(usersTable)
    .set(updateData as any)
    .where(eq(usersTable.id, id))
    .returning();

  return sanitizeUser(updated);
}

export async function deactivateUser(id: string) {
  return updateUser(id, { active: false });
}

export async function permanentDeleteUser(id: string, requestingAdminId?: string) {
  if (requestingAdminId && id === requestingAdminId) {
    throw createError(400, "CANNOT_DELETE_SELF", "Administrators cannot permanently delete their own account");
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing[0]) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  const user = existing[0];

  // Prevent deleting the last active admin
  if (user.role === "ADMIN") {
    const remainingAdmins = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.role, "ADMIN"), sql`${usersTable.id} != ${id}`, eq(usersTable.active, true)));
    const remainingCount = Number(remainingAdmins[0]?.count ?? 0);
    if (remainingCount <= 0) {
      throw createError(400, "CANNOT_DELETE_LAST_ADMIN", "Cannot delete the only remaining active administrator");
    }
  }

  return db.transaction(async (tx) => {
    // 1. Check if user is associated with a driver profile
    const driverRows = await tx.select().from(driversTable).where(eq(driversTable.userId, id)).limit(1);
    const driver = driverRows[0];

    if (driver) {
      // Find all shifts belonging to this driver
      const driverShifts = await tx
        .select({ id: shiftsTable.id })
        .from(shiftsTable)
        .where(eq(shiftsTable.driverId, driver.id));
      const shiftIds = driverShifts.map((s) => s.id);

      // 1a. Delete all notifications associated with this driver or driver shifts
      if (shiftIds.length > 0) {
        await tx
          .delete(notificationsTable)
          .where(or(eq(notificationsTable.driverId, driver.id), inArray(notificationsTable.shiftId, shiftIds)));
      } else {
        await tx
          .delete(notificationsTable)
          .where(eq(notificationsTable.driverId, driver.id));
      }

      // 1b. Delete all location points for this driver
      await tx.delete(locationPointsTable).where(eq(locationPointsTable.driverId, driver.id));

      // 1c. Delete all shifts for this driver
      await tx.delete(shiftsTable).where(eq(shiftsTable.driverId, driver.id));

      // 1d. Delete all devices for this driver
      await tx.delete(devicesTable).where(eq(devicesTable.driverId, driver.id));

      // 1e. Delete alert state for this driver
      await tx.delete(alertStateTable).where(eq(alertStateTable.driverId, driver.id));

      // 1f. Delete driver profile
      await tx.delete(driversTable).where(eq(driversTable.id, driver.id));
    }

    // 2. Delete all refresh tokens for this user
    await tx.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, id));

    // 3. Delete all notification read tracking records for this user
    await tx.delete(notificationReadsTable).where(eq(notificationReadsTable.userId, id));

    // 4. Delete user account record completely (freeing email and phone)
    await tx.delete(usersTable).where(eq(usersTable.id, id));

    return {
      success: true,
      deleted: true,
      userId: id,
      role: user.role,
    };
  });
}

// Backwards compatibility alias
export const permanentDeleteAndAnonymizeUser = permanentDeleteUser;


