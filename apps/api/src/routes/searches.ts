import { Router } from "express";
import {
  createSearch,
  getSearch,
  streamSearchEvents,
} from "../controllers/searchController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createSearchSchema } from "../schemas/searchSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.post(
  "/",
  validate({ body: createSearchSchema }),
  asyncHandler(createSearch),
);
searchRouter.get("/:id", asyncHandler(getSearch));
searchRouter.get("/:id/events", asyncHandler(streamSearchEvents));
