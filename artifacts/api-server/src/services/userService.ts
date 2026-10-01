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
import { eq, and, or, ilike, desc, sql, inArray, ne } from "drizzle-orm";
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
  employeeId?: string | null;
  password?: string;
  active?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: "ADMIN" | "CALL_CENTER" | "DRIVER";
  employeeId?: string | null;
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
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        active: usersTable.active,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
        employeeId: driversTable.employeeId,
      })
      .from(usersTable)
      .leftJoin(driversTable, eq(driversTable.userId, usersTable.id))
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
    items: rows.map((r) => ({
      ...sanitizeUser(r),
      employeeId: r.employeeId ?? null,
    })),
    total,
    page,
    limit,
  };
}

export async function getUserById(id: string) {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      employeeId: driversTable.employeeId,
    })
    .from(usersTable)
    .leftJoin(driversTable, eq(driversTable.userId, usersTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);
  return rows[0]
    ? {
        ...sanitizeUser(rows[0]),
        employeeId: rows[0].employeeId ?? null,
      }
    : null;
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

  if (input.role === "DRIVER") {
    if (!input.employeeId || input.employeeId.trim().length === 0) {
      throw createError(400, "EMPLOYEE_ID_REQUIRED", "Employee ID is required when creating a driver");
    }

    const existingEmployee = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.employeeId, input.employeeId.trim()))
      .limit(1);

    if (existingEmployee[0]) {
      throw createError(409, "DRIVER_EMPLOYEE_ID_EXISTS", "Employee ID already exists");
    }
  }

  if (!input.password) {
    throw createError(400, "PASSWORD_REQUIRED", "A password is required to create a user");
  }

  const passwordHash = await hashPassword(input.password);

  return await db.transaction(async (tx) => {
    const [user] = await tx
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

    if (!user) {
      throw createError(500, "USER_CREATION_FAILED", "Could not create user account");
    }

    if (input.role === "DRIVER") {
      const [driver] = await tx
        .insert(driversTable)
        .values({
          userId: user.id,
          employeeId: input.employeeId!.trim(),
          active: input.active ?? true,
        })
        .returning();

      if (!driver) {
        throw createError(500, "DRIVER_CREATION_FAILED", "Could not create driver profile");
      }
    }

    return sanitizeUser(user);
  });
}

export async function updateUser(id: string, input: UpdateUserInput) {
  return await db.transaction(async (tx) => {
    const existing = await tx.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!existing[0]) {
      throw createError(404, "USER_NOT_FOUND", "User not found");
    }

    const targetUser = existing[0];
    const PRIMARY_ADMIN_EMAIL = "admin@tracker.local";
    const isPrimaryAdmin = targetUser.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();

    if (isPrimaryAdmin) {
      if (input.active === false) {
        throw createError(400, "CANNOT_DEACTIVATE_PRIMARY_ADMIN", "The primary system administrator account cannot be deactivated");
      }
      if (input.role && input.role !== "ADMIN") {
        throw createError(400, "CANNOT_DEMOTE_PRIMARY_ADMIN", "The primary system administrator role cannot be changed");
      }
    }

    if (targetUser.role === "ADMIN" && (input.active === false || (input.role && input.role !== "ADMIN"))) {
      const activeAdmins = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.role, "ADMIN"), eq(usersTable.active, true), ne(usersTable.id, id)))
        .limit(1);

      if (activeAdmins.length === 0) {
        throw createError(400, "LAST_ADMIN_PROTECTED", "Cannot deactivate or demote the last active administrator");
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== existing[0].email.toLowerCase()) {
        const emailConflict = await tx.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
        if (emailConflict[0]) {
          throw createError(409, "EMAIL_EXISTS", "Email is already taken by another user");
        }
        updateData.email = normalizedEmail;
      }
    }
    if (input.phone !== undefined) {
      const normalizedPhone = input.phone?.trim() || null;
      if (normalizedPhone && normalizedPhone !== existing[0].phone) {
        const phoneConflict = await tx.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
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

    // Handle Driver record synchronization & role transitions
    const driverRows = await tx.select().from(driversTable).where(eq(driversTable.userId, id)).limit(1);
    const existingDriver = driverRows[0];

    const targetRole = input.role ?? targetUser.role;

    if (targetRole === "DRIVER") {
      if (existingDriver) {
        const driverUpdate: Record<string, unknown> = { updatedAt: new Date() };
        if (input.active !== undefined) driverUpdate.active = input.active;
        if (input.employeeId && input.employeeId.trim() !== existingDriver.employeeId) {
          const empConflict = await tx
            .select({ id: driversTable.id })
            .from(driversTable)
            .where(and(eq(driversTable.employeeId, input.employeeId.trim()), ne(driversTable.id, existingDriver.id)))
            .limit(1);
          if (empConflict[0]) {
            throw createError(409, "DRIVER_EMPLOYEE_ID_EXISTS", "Employee ID already exists");
          }
          driverUpdate.employeeId = input.employeeId.trim();
        }
        await tx.update(driversTable).set(driverUpdate as any).where(eq(driversTable.id, existingDriver.id));
      } else {
        // Non-driver becoming a driver: employeeId is strictly required
        if (!input.employeeId || input.employeeId.trim().length === 0) {
          throw createError(400, "EMPLOYEE_ID_REQUIRED", "Employee ID is required when setting role to DRIVER");
        }
        const empConflict = await tx
          .select({ id: driversTable.id })
          .from(driversTable)
          .where(eq(driversTable.employeeId, input.employeeId.trim()))
          .limit(1);
        if (empConflict[0]) {
          throw createError(409, "DRIVER_EMPLOYEE_ID_EXISTS", "Employee ID already exists");
        }
        await tx.insert(driversTable).values({
          userId: id,
          employeeId: input.employeeId.trim(),
          active: input.active !== undefined ? input.active : targetUser.active,
        });
      }
    } else if (targetUser.role === "DRIVER" && input.role && input.role !== "DRIVER") {
      // Transitioning FROM DRIVER to non-DRIVER
      if (existingDriver) {
        const activeShifts = await tx
          .select({ id: shiftsTable.id })
          .from(shiftsTable)
          .where(and(eq(shiftsTable.driverId, existingDriver.id), eq(shiftsTable.status, "ACTIVE")))
          .limit(1);
        if (activeShifts.length > 0) {
          throw createError(400, "CANNOT_CHANGE_ROLE_ACTIVE_SHIFT", "Cannot change role of a driver with an active shift. End the shift first.");
        }
        const anyShifts = await tx
          .select({ id: shiftsTable.id })
          .from(shiftsTable)
          .where(eq(shiftsTable.driverId, existingDriver.id))
          .limit(1);
        if (anyShifts.length > 0) {
          throw createError(
            400,
            "CANNOT_DEMOTE_DRIVER_WITH_SHIFTS",
            "Cannot change role of a driver with existing shift history. Deactivate this account and create a separate administrative account instead."
          );
        }
        // Clean up driver record and any devices so no orphaned driver record remains
        await tx.delete(devicesTable).where(eq(devicesTable.driverId, existingDriver.id));
        await tx.delete(alertStateTable).where(eq(alertStateTable.driverId, existingDriver.id));
        await tx.delete(driversTable).where(eq(driversTable.id, existingDriver.id));
      }
    }

    const [updated] = await tx
      .update(usersTable)
      .set(updateData as any)
      .where(eq(usersTable.id, id))
      .returning();

    return sanitizeUser(updated);
  });
}

export async function deactivateUser(id: string) {
  return updateUser(id, { active: false });
}

export async function permanentDeleteUser(id: string, requestingAdminId?: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing[0]) {
    throw createError(404, "USER_NOT_FOUND", "User not found");
  }

  const user = existing[0];

  // 1. Prevent deleting the protected primary system administrator
  const PRIMARY_ADMIN_EMAIL = "admin@tracker.local";
  if (user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw createError(400, "CANNOT_DELETE_PRIMARY_ADMIN", "The primary system administrator account cannot be permanently deleted");
  }

  // 2. Prevent self-deletion
  if (requestingAdminId && id === requestingAdminId) {
    throw createError(400, "CANNOT_DELETE_SELF", "Administrators cannot permanently delete their own account");
  }

  // 3. Prevent deleting the last active admin
  if (user.role === "ADMIN") {
    const remainingAdmins = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.role, "ADMIN"), ne(usersTable.id, id), eq(usersTable.active, true)));
    const remainingCount = Number(remainingAdmins[0]?.count ?? 0);
    if (remainingCount <= 0) {
      throw createError(400, "CANNOT_DELETE_LAST_ADMIN", "Cannot delete the only remaining active administrator");
    }
  }

  try {
    return await db.transaction(async (tx) => {
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
  } catch (error: any) {
    console.error("[permanentDeleteUser] Deletion transaction failed:", {
      targetUserId: id,
      targetEmail: user.email,
      targetRole: user.role,
      requestingAdminId,
      errorName: error?.name,
      errorMessage: error?.message,
      pgCode: error?.cause?.code || error?.code,
      pgTable: error?.cause?.table || error?.table,
      pgConstraint: error?.cause?.constraint || error?.constraint,
      stack: error?.stack,
    });
    throw error;
  }
}

// Backwards compatibility alias
export const permanentDeleteAndAnonymizeUser = permanentDeleteUser;


