import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { createError } from "../lib/errors";
import { generateOperationalReport } from "../services/reportService";

const router = Router();

const reportQuerySchema = z.object({
  from: z.string().min(1, "from timestamp is required"),
  to: z.string().min(1, "to timestamp is required"),
  driverId: z.string().uuid().optional(),
});

router.get("/summary", requireAuth, requireRole("ADMIN", "CALL_CENTER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = reportQuerySchema.parse(req.query);
    const result = await generateOperationalReport(query);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(createError(400, "VALIDATION_ERROR", "Invalid report query parameters", error.flatten()));
      return;
    }
    next(error);
  }
});

export default router;
