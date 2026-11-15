import { Router } from "express";
import { getAnalyticsSummary } from "../controllers/analyticsController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get("/summary", asyncHandler(getAnalyticsSummary));
