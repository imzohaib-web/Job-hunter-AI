import { Router } from "express";
import {
  approveChanges,
  exportArtifact,
  getArtifactById,
  getArtifacts,
} from "../controllers/artifactController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  approveChangesSchema,
  exportArtifactQuerySchema,
} from "../schemas/artifactSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const artifactRouter = Router();

artifactRouter.use(requireAuth);

artifactRouter.get("/", asyncHandler(getArtifacts));
artifactRouter.get("/:id", asyncHandler(getArtifactById));
artifactRouter.patch(
  "/:id/approve-changes",
  validate({ body: approveChangesSchema }),
  asyncHandler(approveChanges),
);
artifactRouter.post(
  "/:id/export",
  validate({ query: exportArtifactQuerySchema }),
  asyncHandler(exportArtifact),
);
