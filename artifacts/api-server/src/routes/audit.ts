import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import { listAuditLogs } from "../services/auditService";

const router = Router();

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  entityType: z.string().optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

router.get("/", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = auditQuerySchema.parse(req.query);
    const result = await listAuditLogs(query);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid audit log filter", error.flatten()));
      return;
    }
    next(error);
  }
});

export default router;
