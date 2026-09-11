import { Router } from "express";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { getLiveFleetStatus } from "../services/fleetService";

const router = Router();

router.get("/live", requireAuth, requireRole("ADMIN", "MANAGER", "CALL_CENTER"), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const data = await getLiveFleetStatus();
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

export default router;

