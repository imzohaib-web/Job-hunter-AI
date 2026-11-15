import { Router } from "express";
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from "../controllers/applicationController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "../schemas/applicationSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const applicationRouter = Router();

applicationRouter.use(requireAuth);

applicationRouter.post(
  "/",
  validate({ body: createApplicationSchema }),
  asyncHandler(createApplication),
);
applicationRouter.get("/", asyncHandler(listApplications));
applicationRouter.patch(
  "/:id",
  validate({ body: updateApplicationSchema }),
  asyncHandler(updateApplication),
);
applicationRouter.delete("/:id", asyncHandler(deleteApplication));
