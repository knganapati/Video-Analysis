import { Router, type IRouter } from "express";
import healthRouter from "./health";
import highlightsRouter from "./highlights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(highlightsRouter);

export default router;
