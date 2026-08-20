import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, driversTable, refreshTokensTable, usersTable } from "@workspace/db";
import { getEnv } from "../config/env";
import { createError } from "./errors";

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER" | "DRIVER";
  active: boolean;
};

const env = getEnv();
const JWT_SECRET = env.jwtSecret;
const JWT_REFRESH_SECRET = env.jwtRefreshSecret;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

export function sanitizeUser(user: { id: string; name: string; email: string; phone: string | null; role: string; active: boolean; passwordHash?: string }): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as SafeUser["role"],
    active: user.active,
  };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role, type: "access" }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function signRefreshToken(userId: string, role: string, jti: string): string {
  return jwt.sign({ sub: userId, role, type: "refresh", jti }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

export async function getUserById(userId: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmailOrPhone(value: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, value), eq(usersTable.phone, value)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDriverByUserId(userId: string) {
  const rows = await db.select().from(driversTable).where(eq(driversTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export function getTokenPayload(token: string, secret: string): JwtPayload {
  const payload = jwt.verify(token, secret) as JwtPayload;
  if (!payload || typeof payload.sub !== "string") {
    throw createError(401, "AUTH_INVALID_TOKEN", "Invalid token");
  }
  return payload;
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokensTable.tokenHash, tokenHash), isNull(refreshTokensTable.revokedAt)));
}

export async function storeRefreshToken(userId: string, rawRefreshToken: string): Promise<void> {
  const hashed = hashRefreshToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokensTable).values({ userId, tokenHash: hashed, expiresAt });
}

export async function revokeUserRefreshTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokensTable.userId, userId), isNull(refreshTokensTable.revokedAt)));
}

export async function findValidRefreshToken(rawToken: string, userId: string) {
  const hash = hashRefreshToken(rawToken);
  const rows = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        eq(refreshTokensTable.tokenHash, hash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export function hasRole(user: { role: string }, roles: string[]): boolean {
  return roles.includes(user.role);
}
