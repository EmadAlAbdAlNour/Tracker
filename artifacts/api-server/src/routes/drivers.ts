import { Router } from "express";
import { z } from "zod";
import { createError } from "../lib/errors";
import {
  createDriverRecord,
  endDriverShift,
  forceEndDriverShift,
  getCurrentDriverProfile,
  getDriverById,
  getDriverByUserId,
  getDriverDevice,
  getDriverShiftsById,
  getDriverTrackingStatus,
  getLatestDriverLocation,
  listDriverLocations,
  listDriverShiftsForUser,
  listDrivers,
  registerDriverDevice,
  startDriverShift,
  submitDriverLocation,
  submitDriverLocationBatch,
  submitDriverHeartbeat,
  updateDriverProfile,
  resetDriverDeviceByDriverId,
  assignDriverDevice,
} from "../services/authService";
import { listDriverLocationHistory, getDriverActivityTimeline } from "../services/historyService";
import { recordAuditEvent } from "../services/auditService";
import { type AuthenticatedRequest, requireAuth, requireAuthOrTelemetry, requireRole } from "../middleware/auth";
import { signTelemetryToken, TELEMETRY_TOKEN_EXPIRY_SECONDS } from "../lib/auth";
import { deviceRegisterSchema, driverCreateSchema, driverUpdateSchema, heartbeatSchema, locationBatchSchema, locationPointSchema, paginationSchema, shiftListQuerySchema } from "../validation/auth";

const locationHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  shiftId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  shiftId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const router = Router();

router.get("/me", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const profile = await getCurrentDriverProfile(req.user!.id);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

router.get("/me/device", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const device = await getDriverDevice(req.user!.id);
    res.status(200).json({ device });
  } catch (error) {
    next(error);
  }
});

router.post("/me/device/register", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
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

// ADMIN-only: reset a driver's authorized device. This will mark the device unauthorized and revoke all refresh tokens tied to that device.
router.post("/:id/device/reset", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await (async () => {
      const driver = await getDriverById(driverId);
      if (!driver) throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
      await resetDriverDeviceByDriverId(driverId);
      await recordAuditEvent({
        actorId: req.user?.id,
        actorEmail: req.user?.email || "unknown",
        actorRole: req.user?.role || "ADMIN",
        action: "DEVICE_RESET",
        entityType: "DEVICE",
        entityId: driverId,
        details: { driverId },
        ipAddress: req.ip,
      });
    })();

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ADMIN-only: atomically assign/replace a driver's authorized device.
router.post("/:id/device/assign", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = z
      .object({
        deviceId: z.string().uuid().optional(),
        platform: z.enum(["ANDROID", "IOS", "WEB"]).optional(),
        deviceIdentifier: z.string().min(1).optional(),
        appVersion: z.string().optional(),
      })
      .parse(req.body);

    const device = await assignDriverDevice(driverId, body);
    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "DEVICE_ASSIGNED",
      entityType: "DEVICE",
      entityId: device.id,
      details: { driverId, platform: body.platform, deviceIdentifier: body.deviceIdentifier },
      ipAddress: req.ip,
    });
    res.status(200).json({ success: true, device });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid device assign payload", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/me/shifts/start", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const callerDeviceId = req.user?.deviceId || (req.headers["x-device-id"] as string);
    const bodyLocation =
      req.body && typeof req.body === "object" && req.body.latitude != null && req.body.longitude != null
        ? { latitude: Number(req.body.latitude), longitude: Number(req.body.longitude) }
        : null;
    const shift = await startDriverShift(req.user!.id, callerDeviceId, bodyLocation);
    const device = await getDriverDevice(req.user!.id);
    const deviceId = device?.id || callerDeviceId || "";
    const telemetryToken = signTelemetryToken(req.user!.id, "DRIVER", deviceId, shift.id);
    res.status(201).json({ shift, telemetryToken, expiresIn: TELEMETRY_TOKEN_EXPIRY_SECONDS });
  } catch (error) {
    next(error);
  }
});

// ADMIN-only: Force end an active driver shift (even if driver is outside geofence)
router.post("/:id/shifts/force-end", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const shift = await forceEndDriverShift(driverId);
    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "SHIFT_FORCE_ENDED",
      entityType: "SHIFT",
      entityId: shift.id,
      details: { driverId, shiftId: shift.id, endedAt: shift.endedAt },
      ipAddress: req.ip,
    });
    res.status(200).json({ success: true, shift });
  } catch (error) {
    next(error);
  }
});

// Also support POST /:id/shifts/end for ADMIN
router.post("/:id/shifts/end", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const shift = await forceEndDriverShift(driverId);
    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "SHIFT_FORCE_ENDED",
      entityType: "SHIFT",
      entityId: shift.id,
      details: { driverId, shiftId: shift.id, endedAt: shift.endedAt },
      ipAddress: req.ip,
    });
    res.status(200).json({ success: true, shift });
  } catch (error) {
    next(error);
  }
});

router.post("/me/telemetry-token", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const driver = await getDriverByUserId(req.user!.id);
    if (!driver) throw createError(404, "DRIVER_NOT_FOUND", "Driver not found");
    if (!driver.active) throw createError(403, "DRIVER_INACTIVE", "Driver is inactive");

    const device = await getDriverDevice(req.user!.id);
    if (!device || !(device as any).authorized) {
      throw createError(403, "DEVICE_UNAUTHORIZED", "Device is not authorized or has been revoked");
    }

    const callerDeviceId = req.user?.deviceId || (req.headers["x-device-id"] as string) || device.id;
    if (device.id !== callerDeviceId && device.deviceIdentifier !== callerDeviceId) {
      throw createError(403, "DEVICE_UNAUTHORIZED", "Device authorization has been revoked or replaced");
    }

    const activeShifts = await listDriverShiftsForUser(req.user!.id, { status: "ACTIVE", limit: 1 });
    const activeShift = activeShifts.items[0];
    if (!activeShift) {
      throw createError(409, "SHIFT_NOT_ACTIVE", "Driver does not have an active shift");
    }

    const telemetryToken = signTelemetryToken(req.user!.id, "DRIVER", device.id, activeShift.id);
    res.status(200).json({ telemetryToken, expiresIn: TELEMETRY_TOKEN_EXPIRY_SECONDS, shiftId: activeShift.id });
  } catch (error) {
    next(error);
  }
});

router.post("/me/shifts/end", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const shift = await endDriverShift(req.user!.id);
    res.status(200).json({ shift });
  } catch (error) {
    next(error);
  }
});

router.post("/me/location", requireAuthOrTelemetry, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = locationPointSchema.parse(req.body);
    const callerDeviceId = req.user?.deviceId || (req.headers["x-device-id"] as string);
    const expectedShiftId = req.user?.isTelemetryToken ? req.user?.shiftId : null;
    const point = await submitDriverLocation(req.user!.id, body, callerDeviceId, expectedShiftId);
    res.status(201).json({ location: point });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid location payload", error.flatten()));
      return;
    }
    next(error);
  }
});

// Batch upload: up to 20 points
router.post("/me/location/batch", requireAuthOrTelemetry, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = locationBatchSchema.parse(req.body);
    const callerDeviceId = req.user?.deviceId || (req.headers["x-device-id"] as string);
    const expectedShiftId = req.user?.isTelemetryToken ? req.user?.shiftId : null;
    const result = await submitDriverLocationBatch(req.user!.id, body, callerDeviceId, expectedShiftId);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid batch payload", error.flatten()));
      return;
    }
    next(error);
  }
});

// Periodic heartbeat: lightweight device keep-alive
router.post("/me/heartbeat", requireAuthOrTelemetry, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = heartbeatSchema.parse(req.body || {});
    const callerDeviceId = req.user?.deviceId || (req.headers["x-device-id"] as string);
    const expectedShiftId = req.user?.isTelemetryToken ? req.user?.shiftId : null;
    const result = await submitDriverHeartbeat(req.user!.id, body, callerDeviceId, expectedShiftId);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid heartbeat payload", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/me/shifts", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = shiftListQuerySchema.parse(req.query);
    const result = await listDriverShiftsForUser(req.user!.id, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      from: query.from,
      to: query.to,
    });
    res.status(200).json({
      page: query.page,
      limit: query.limit,
      total: result.total,
      items: result.items,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid shift filter", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/", requireAuth, requireRole("ADMIN", "CALL_CENTER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = paginationSchema.parse(req.query);
    const result = await listDrivers({ page: query.page, limit: query.limit });
    res.status(200).json({
      page: query.page,
      limit: query.limit,
      total: result.total,
      items: result.items,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid pagination", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = driverCreateSchema.parse(req.body);
    const result = await createDriverRecord({
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      employeeId: body.employeeId,
      password: body.password,
      active: body.active,
    });

    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "DRIVER_CREATED",
      entityType: "DRIVER",
      entityId: result.driver.id,
      details: { driverId: result.driver.id, employeeId: result.driver.employeeId, name: body.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ driver: result.driver, user: result.user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid driver payload", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const driver = await getDriverById(driverId);
    if (!driver) {
      next(createError(404, "DRIVER_NOT_FOUND", "Driver not found"));
      return;
    }

    if (req.user!.role === "DRIVER" && driver.userId !== req.user!.id) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's data"));
      return;
    }

    if (req.user!.role === "ADMIN" || req.user!.role === "CALL_CENTER") {
      res.status(200).json({ driver });
      return;
    }

    const ownDriver = await getDriverByUserId(req.user!.id);
    if (!ownDriver || ownDriver.id !== driverId) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's data"));
      return;
    }

    res.status(200).json({ driver });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/shifts", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const query = shiftListQuerySchema.parse(req.query);
    const result = await getDriverShiftsById(req.user!, driverId, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      from: query.from,
      to: query.to,
    });
    res.status(200).json({
      page: query.page,
      limit: query.limit,
      total: result.total,
      items: result.items,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid shift filter", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/:id/location/latest", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const driver = await getDriverById(driverId);
    if (!driver) {
      next(createError(404, "DRIVER_NOT_FOUND", "Driver not found"));
      return;
    }
    if (req.user!.role === "DRIVER" && driver.userId !== req.user!.id) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's location"));
      return;
    }
    const location = await getLatestDriverLocation(driverId);
    res.status(200).json({ location });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/locations", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const driver = await getDriverById(driverId);
    if (!driver) {
      next(createError(404, "DRIVER_NOT_FOUND", "Driver not found"));
      return;
    }
    if (req.user!.role === "DRIVER" && driver.userId !== req.user!.id) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's location"));
      return;
    }
    const query = locationHistoryQuerySchema.parse(req.query);
    const result = await listDriverLocationHistory(driverId, {
      page: query.page,
      limit: query.limit,
      shiftId: query.shiftId,
      from: query.from,
      to: query.to,
      order: query.order,
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid location query", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/:id/activity", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const driver = await getDriverById(driverId);
    if (!driver) {
      next(createError(404, "DRIVER_NOT_FOUND", "Driver not found"));
      return;
    }
    if (req.user!.role === "DRIVER" && driver.userId !== req.user!.id) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's activity"));
      return;
    }
    const query = activityQuerySchema.parse(req.query);
    const result = await getDriverActivityTimeline(driverId, {
      page: query.page,
      limit: query.limit,
      shiftId: query.shiftId,
      from: query.from,
      to: query.to,
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid activity query", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/:id/tracking-status", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const driver = await getDriverById(driverId);
    if (!driver) {
      next(createError(404, "DRIVER_NOT_FOUND", "Driver not found"));
      return;
    }
    if (req.user!.role === "DRIVER" && driver.userId !== req.user!.id) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's tracking status"));
      return;
    }
    const status = await getDriverTrackingStatus(driverId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const driver = await getDriverById(driverId);
    if (!driver) {
      next(createError(404, "DRIVER_NOT_FOUND", "Driver not found"));
      return;
    }

    if (req.user!.role === "DRIVER" && driver.userId !== req.user!.id) {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot access another driver's data"));
      return;
    }

    if (req.user!.role === "DRIVER") {
      next(createError(403, "AUTH_FORBIDDEN", "Driver cannot modify driver records"));
      return;
    }

    const body = driverUpdateSchema.parse(req.body);
    const updated = await updateDriverProfile(driverId, body);
    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "DRIVER_UPDATED",
      entityType: "DRIVER",
      entityId: driverId,
      details: { ...body, password: body.password ? "[REDACTED]" : undefined },
      ipAddress: req.ip,
    });
    res.status(200).json({ driver: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid driver payload", error.flatten()));
      return;
    }
    next(error);
  }
});

export default router;
