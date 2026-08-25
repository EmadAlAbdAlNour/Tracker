import { Router } from "express";
import { z } from "zod";
import { createError } from "../lib/errors";
import { loginUser, logoutUser, refreshSession } from "../services/authService";
import { loginSchema, logoutSchema, refreshTokenSchema } from "../validation/auth";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await loginUser(body.emailOrPhone, body.password, body.device);
    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid input", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const body = refreshTokenSchema.parse(req.body);
    const result = await refreshSession(body.refreshToken);
    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid input", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/logout", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = logoutSchema.parse(req.body ?? {});
    await logoutUser(req.user!.id, body.refreshToken);
    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid input", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  res.status(200).json({ user: req.user });
});

export default router;
