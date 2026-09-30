import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  getAlertSettings,
  updateAlertSettings,
} from "../services/settingsService";

const router = Router();

const restaurantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().min(10).max(50000).optional(),
  enabled: z.boolean().optional(),
});

const alertUpdateSchema = z.object({
  maxStopDurationMinutes: z.number().int().min(1).max(120).optional(),
  offlineGraceMinutes: z.number().int().min(1).max(60).optional(),
  lowBatteryThreshold: z.number().int().min(5).max(50).optional(),
  criticalBatteryThreshold: z.number().int().min(1).max(30).optional(),
  maxShiftDurationHours: z.number().int().min(1).max(24).optional(),
  stopAlertEnabled: z.boolean().optional(),
  gpsAlertEnabled: z.boolean().optional(),
  offlineAlertEnabled: z.boolean().optional(),
  batteryAlertEnabled: z.boolean().optional(),
  restaurantGeofenceAlertEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  inAppAlertsEnabled: z.boolean().optional(),
  pushAlertsEnabled: z.boolean().optional(),
});

// Restaurant settings
router.get("/restaurant", requireAuth, requireRole("ADMIN", "CALL_CENTER"), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const settings = await getRestaurantSettings();
    res.status(200).json({ settings });
  } catch (error) {
    next(error);
  }
});

import { recordAuditEvent } from "../services/auditService";

router.put("/restaurant", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = restaurantUpdateSchema.parse(req.body);
    const settings = await updateRestaurantSettings(body, req.user!.id);
    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "RESTAURANT_SETTINGS_UPDATED",
      entityType: "SETTINGS",
      entityId: settings.id || "restaurant-settings",
      details: body,
      ipAddress: req.ip,
    });
    res.status(200).json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid restaurant settings", error.flatten()));
      return;
    }
    next(error);
  }
});

// Alert settings
router.get("/alerts", requireAuth, requireRole("ADMIN", "CALL_CENTER"), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const settings = await getAlertSettings();
    res.status(200).json({ settings });
  } catch (error) {
    next(error);
  }
});

router.put("/alerts", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = alertUpdateSchema.parse(req.body);
    const settings = await updateAlertSettings(body);
    await recordAuditEvent({
      actorId: req.user?.id,
      actorEmail: req.user?.email || "unknown",
      actorRole: req.user?.role || "ADMIN",
      action: "ALERT_SETTINGS_UPDATED",
      entityType: "SETTINGS",
      entityId: settings.id || "alert-settings",
      details: body,
      ipAddress: req.ip,
    });
    res.status(200).json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid alert settings", error.flatten()));
      return;
    }
    next(error);
  }
});

export default router;

