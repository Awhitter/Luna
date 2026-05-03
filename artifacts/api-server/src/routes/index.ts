import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import tasksRouter from "./tasks";
import cycleRouter from "./cycle";
import dailyContextRouter from "./daily-context";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(tasksRouter);
router.use(cycleRouter);
router.use(dailyContextRouter);
router.use(openaiRouter);

export default router;
