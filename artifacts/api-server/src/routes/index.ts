import { Router, type IRouter } from "express";
import authRouter from "./auth";
import devicesRouter from "./devices";
import healthRouter from "./health";
import usersRouter from "./users";
import driversRouter from "./drivers";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/devices", devicesRouter);
router.use("/drivers", driversRouter);

export default router;
