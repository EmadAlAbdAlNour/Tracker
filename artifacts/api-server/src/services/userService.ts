import { db, usersTable } from "@workspace/db";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
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

