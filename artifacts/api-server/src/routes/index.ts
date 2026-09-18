import { Router, type IRouter } from "express";
import authRouter from "./auth";
import devicesRouter from "./devices";
import healthRouter from "./health";
import usersRouter from "./users";
import driversRouter from "./drivers";
import fleetRouter from "./fleet";
import settingsRouter from "./settings";
import notificationsRouter from "./notifications";
import releasesRouter from "./releases";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/devices", devicesRouter);
router.use("/drivers", driversRouter);
router.use("/fleet", fleetRouter);
router.use("/settings", settingsRouter);
router.use("/notifications", notificationsRouter);
router.use("/releases", releasesRouter);
router.use(releasesRouter);

export default router;
