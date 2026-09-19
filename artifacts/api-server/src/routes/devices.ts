import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import { registerDriverDevice } from "../services/authService";
import { deviceRegisterSchema, paginationSchema } from "../validation/auth";
import { db, devicesTable, driversTable, usersTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();

router.get("/", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = paginationSchema.parse(req.query);
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: devicesTable.id,
          driverId: devicesTable.driverId,
          platform: devicesTable.platform,
          deviceIdentifier: devicesTable.deviceIdentifier,
          appVersion: devicesTable.appVersion,
          authorized: devicesTable.authorized,
          batteryPercentage: devicesTable.batteryPercentage,
          isCharging: devicesTable.isCharging,
          locationServicesEnabled: devicesTable.locationServicesEnabled,
          networkStatus: devicesTable.networkStatus,
          lastSeen: devicesTable.lastSeen,
          lastLocationAt: devicesTable.lastLocationAt,
          createdAt: devicesTable.createdAt,
          driverName: usersTable.name,
          driverEmail: usersTable.email,
          driverPhone: usersTable.phone,
          employeeId: driversTable.employeeId,
        })
        .from(devicesTable)
        .innerJoin(driversTable, eq(devicesTable.driverId, driversTable.id))
        .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
        .orderBy(desc(devicesTable.authorized), desc(devicesTable.lastSeen), desc(devicesTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(devicesTable)
        .innerJoin(driversTable, eq(devicesTable.driverId, driversTable.id))
        .innerJoin(usersTable, eq(driversTable.userId, usersTable.id)),
    ]);

    res.status(200).json({
      items: rows,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid pagination", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/register", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = deviceRegisterSchema.parse(req.body);
    const device = await registerDriverDevice(req.user!.id, body);
    res.status(200).json({ device });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid device payload", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/assign", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = z
      .object({
        driverId: z.string().uuid(),
        deviceId: z.string().uuid().optional(),
        platform: z.enum(["ANDROID", "IOS", "WEB"]).optional(),
        deviceIdentifier: z.string().min(1).optional(),
        appVersion: z.string().optional(),
      })
      .parse(req.body);

    const { assignDriverDevice } = await import("../services/authService");
    const device = await assignDriverDevice(body.driverId, body);
    res.status(200).json({ success: true, device });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid device assign payload", error.flatten()));
      return;
    }
    next(error);
  }
});

export default router;
