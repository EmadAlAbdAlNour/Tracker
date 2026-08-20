import { Router } from "express";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth";
import { getUserById, sanitizeUser } from "../lib/auth";

const router = Router();

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
      return;
    }

    res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

export default router;
