import { Router } from "express";
import { getMatchById, listMatches } from "../controllers/matchController.js";
import { prepareApplication } from "../controllers/prepareController.js";
import { requireAuth } from "../middleware/auth.js";
import { checkAiQuota } from "../middleware/quota.js";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { matchesQuerySchema } from "../schemas/searchSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const matchRouter = Router();

matchRouter.use(requireAuth);

matchRouter.get("/", validate({ query: matchesQuerySchema }), asyncHandler(listMatches));
matchRouter.get("/:id", asyncHandler(getMatchById));
matchRouter.post(
  "/:id/prepare",
  aiRateLimiter,
  asyncHandler(checkAiQuota),
  asyncHandler(prepareApplication),
);
