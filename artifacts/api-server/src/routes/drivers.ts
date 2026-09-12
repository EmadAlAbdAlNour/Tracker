import { Router } from "express";
import { z } from "zod";
import { createError } from "../lib/errors";
import {
  createDriverRecord,
  endDriverShift,
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
  updateDriverProfile,
  resetDriverDeviceByDriverId,
} from "../services/authService";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { deviceRegisterSchema, driverCreateSchema, driverUpdateSchema, locationBatchSchema, locationPointSchema, paginationSchema, shiftListQuerySchema } from "../validation/auth";

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
    })();

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/me/shifts/start", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const shift = await startDriverShift(req.user!.id);
    res.status(201).json({ shift });
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

router.post("/me/location", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = locationPointSchema.parse(req.body);
    const point = await submitDriverLocation(req.user!.id, body);
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
router.post("/me/location/batch", requireAuth, requireRole("DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = locationBatchSchema.parse(req.body);
    const result = await submitDriverLocationBatch(req.user!.id, body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid batch payload", error.flatten()));
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

router.get("/", requireAuth, requireRole("ADMIN", "MANAGER", "CALL_CENTER"), async (req: AuthenticatedRequest, res, next) => {
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

router.post("/", requireAuth, requireRole("ADMIN", "MANAGER"), async (req: AuthenticatedRequest, res, next) => {
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

    if (req.user!.role === "MANAGER" || req.user!.role === "ADMIN" || req.user!.role === "CALL_CENTER") {
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
    const query = paginationSchema.parse(req.query);
    const result = await listDriverLocations(driverId, {
      page: query.page,
      limit: query.limit,
    });
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

router.patch("/:id", requireAuth, requireRole("ADMIN", "MANAGER"), async (req: AuthenticatedRequest, res, next) => {
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
