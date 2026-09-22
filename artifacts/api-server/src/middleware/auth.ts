import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getEnv } from "../config/env";
import { createError } from "../lib/errors";
import { getUserById, hasRole, sanitizeUser } from "../lib/auth";

export type AuthenticatedRequest = Request & {
  user?: Awaited<ReturnType<typeof sanitizeUser>> & {
    deviceId?: string;
    isTelemetryToken?: boolean;
    shiftId?: string;
  };
};

const env = getEnv();

async function authenticateToken(
  req: AuthenticatedRequest,
  allowTelemetry: boolean
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw createError(401, "AUTH_REQUIRED", "Authentication required");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  let payload: { sub?: string; role?: string; deviceId?: string; type?: string; shiftId?: string } | undefined;
  try {
    payload = jwt.verify(token, env.jwtSecret) as {
      sub?: string;
      role?: string;
      deviceId?: string;
      type?: string;
      shiftId?: string;
    };
  } catch (err) {
    throw createError(401, "AUTH_INVALID_TOKEN", "Invalid token");
  }

  if (!payload?.sub) {
    throw createError(401, "AUTH_INVALID_TOKEN", "Invalid token");
  }

  if (payload.type === "telemetry") {
    if (!allowTelemetry) {
      throw createError(403, "AUTH_FORBIDDEN", "Telemetry token cannot be used for general API operations");
    }
    if (payload.role !== "DRIVER") {
      throw createError(403, "AUTH_FORBIDDEN", "Telemetry token must have DRIVER role");
    }
  }

  const user = await getUserById(payload.sub);
  if (!user) {
    throw createError(401, "AUTH_INVALID_TOKEN", "User not found");
  }
  if (!user.active) {
    throw createError(403, "AUTH_INACTIVE", "Account is inactive");
  }

  req.user = {
    ...sanitizeUser(user),
    ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
    ...(payload.type === "telemetry"
      ? { isTelemetryToken: true, shiftId: payload.shiftId }
      : {}),
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await authenticateToken(req, false);
    next();
  } catch (error) {
    next(error instanceof Error ? error : createError(401, "AUTH_REQUIRED", "Authentication required"));
  }
}

export async function requireAuthOrTelemetry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await authenticateToken(req, true);
    next();
  } catch (error) {
    next(error instanceof Error ? error : createError(401, "AUTH_REQUIRED", "Authentication required"));
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(createError(401, "AUTH_REQUIRED", "Authentication required"));
      return;
    }

    if (!hasRole(req.user, roles)) {
      next(createError(403, "AUTH_FORBIDDEN", "Access denied"));
      return;
    }

    next();
  };
}

export function requireActiveUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    next(createError(401, "AUTH_REQUIRED", "Authentication required"));
    return;
  }

  if (!req.user.active) {
    next(createError(403, "AUTH_INACTIVE", "Account is inactive"));
    return;
  }

  next();
}
