import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/notificationService";
import { getDriverByUserId } from "../lib/auth";

const router = Router();

const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
  type: z.string().optional(),
  driverId: z.string().uuid().optional(),
});

router.get("/", requireAuth, requireRole("ADMIN", "CALL_CENTER", "DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = notificationQuerySchema.parse(req.query);
    if (req.user!.role === "DRIVER") {
      const driver = await getDriverByUserId(req.user!.id);
      if (!driver) {
        res.status(200).json({ items: [], total: 0, unreadCount: 0, page: 1, limit: query.limit });
        return;
      }
      query.driverId = driver.id;
    }

    const result = await listNotifications(query, req.user!.id);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid notification query", error.flatten()));
      return;
    }
    next(error);
  }
});

router.patch("/:id/read", requireAuth, requireRole("ADMIN", "CALL_CENTER", "DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const notification = await markNotificationAsRead(id, req.user!.id);
    if (!notification) {
      next(createError(404, "NOT_FOUND", "Notification not found"));
      return;
    }
    res.status(200).json({ notification: { ...notification, read: true } });
  } catch (error) {
    next(error);
  }
});

router.post("/read-all", requireAuth, requireRole("ADMIN", "CALL_CENTER", "DRIVER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    await markAllNotificationsAsRead(req.user!.id);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
