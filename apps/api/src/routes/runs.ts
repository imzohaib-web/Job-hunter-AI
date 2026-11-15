import { Router } from "express";
import { resumeRun, streamRunEvents } from "../controllers/prepareController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const runRouter = Router();

runRouter.use(requireAuth);

runRouter.get("/:id/events", asyncHandler(streamRunEvents));
runRouter.post("/:id/resume", asyncHandler(resumeRun));
