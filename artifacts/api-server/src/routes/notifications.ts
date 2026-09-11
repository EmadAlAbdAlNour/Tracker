import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/notificationService";

const router = Router();

const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
  type: z.string().optional(),
  driverId: z.string().uuid().optional(),
});

router.get("/", requireAuth, requireRole("ADMIN", "MANAGER", "CALL_CENTER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = notificationQuerySchema.parse(req.query);
    const result = await listNotifications(query);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid notification query", error.flatten()));
      return;
    }
    next(error);
  }
});

router.patch("/:id/read", requireAuth, requireRole("ADMIN", "MANAGER", "CALL_CENTER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const notification = await markNotificationAsRead(id);
    if (!notification) {
      next(createError(404, "NOT_FOUND", "Notification not found"));
      return;
    }
    res.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
});

router.post("/read-all", requireAuth, requireRole("ADMIN", "MANAGER", "CALL_CENTER"), async (_req: AuthenticatedRequest, res, next) => {
  try {
    await markAllNotificationsAsRead();
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;

