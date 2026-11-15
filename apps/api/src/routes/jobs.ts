import { Router } from "express";
import { getJob, saveJob, unsaveJob } from "../controllers/jobController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const jobRouter = Router();

jobRouter.use(requireAuth);

jobRouter.get("/:id", asyncHandler(getJob));
jobRouter.post("/:id/save", asyncHandler(saveJob));
jobRouter.delete("/:id/save", asyncHandler(unsaveJob));
