import { Router, type IRouter } from "express";
import healthRouter from "./health";
// @ts-ignore
import vortexRouter from "./vortex";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vortexRouter);

export default router;
