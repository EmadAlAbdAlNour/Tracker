import { Router } from "express";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import { getLiveFleetStatus } from "../services/fleetService";

const router = Router();

router.get("/live", requireAuth, requireRole("ADMIN", "CALL_CENTER"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const data = await getLiveFleetStatus({ activeOnly });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

export default router;

