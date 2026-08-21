import { Router, type IRouter } from "express";
import { checkDatabaseHealth } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const databaseReachable = await checkDatabaseHealth();

  res.status(200).json({
    status: "ok",
    database: databaseReachable ? "reachable" : "unreachable",
  });
});

export default router;
