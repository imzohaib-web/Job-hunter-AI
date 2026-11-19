import { Router } from "express";
import {
  getRunSnapshot,
  resumeRun,
  retryNode,
  streamRunEvents,
} from "../controllers/prepareController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const runRouter = Router();

runRouter.use(requireAuth);

runRouter.get("/:id", asyncHandler(getRunSnapshot));
runRouter.get("/:id/events", asyncHandler(streamRunEvents));
runRouter.post("/:id/resume", asyncHandler(resumeRun));
runRouter.post("/:id/retry-node", asyncHandler(retryNode));
