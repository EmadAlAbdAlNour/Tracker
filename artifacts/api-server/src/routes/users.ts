import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { getUserById as getLibUserById, sanitizeUser } from "../lib/auth";
import { createError } from "../lib/errors";
import {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
} from "../services/userService";

const router = Router();

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(["ADMIN", "CALL_CENTER", "DRIVER"]).optional(),
  search: z.string().optional(),
});

const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "CALL_CENTER", "DRIVER"]),
  password: z.string().min(8).max(200),
  active: z.boolean().default(true),
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "CALL_CENTER", "DRIVER"]).optional(),
  password: z.string().min(8).max(200).optional(),
  active: z.boolean().optional(),
});

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getLibUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
      return;
    }

    res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = userQuerySchema.parse(req.query);
    const result = await listUsers(query);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid query parameters", error.flatten()));
      return;
    }
    next(error);
  }
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = userCreateSchema.parse(req.body);
    const user = await createUser(body);
    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid user payload", error.flatten()));
      return;
    }
    next(error);
  }
});

router.get("/:id", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await getUserById(id);
    if (!user) {
      next(createError(404, "USER_NOT_FOUND", "User not found"));
      return;
    }
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = userUpdateSchema.parse(req.body);
    const user = await updateUser(id, body);
    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid update payload", error.flatten()));
      return;
    }
    next(error);
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await deactivateUser(id);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
