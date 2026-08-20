import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import { registerDriverDevice } from "../services/authService";
import { deviceRegisterSchema } from "../validation/auth";

const router = Router();

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

export default router;
