import { Router } from "express";
import {
  deleteResume,
  downloadResumeFile,
  getResume,
  getResumeDebug,
  listResumes,
  patchResumeProfile,
  reparseResume,
  uploadResume,
  verifyResumeForTailoring,
} from "../controllers/resumeController.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadResumeMiddleware } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { patchProfileSchema } from "../schemas/resumeSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const resumeRouter = Router();

// Signed URL download does not require auth header since token is signed HMAC
resumeRouter.get("/download", asyncHandler(downloadResumeFile));

resumeRouter.post("/", requireAuth, uploadResumeMiddleware, asyncHandler(uploadResume));
resumeRouter.get("/", requireAuth, asyncHandler(listResumes));
resumeRouter.get("/:id", requireAuth, asyncHandler(getResume));
resumeRouter.get("/:id/debug", requireAuth, asyncHandler(getResumeDebug));
resumeRouter.patch(
  "/:id/profile",
  requireAuth,
  validate({ body: patchProfileSchema }),
  asyncHandler(patchResumeProfile),
);
resumeRouter.post("/:id/reparse", requireAuth, asyncHandler(reparseResume));
resumeRouter.post("/:id/re-parse", requireAuth, asyncHandler(reparseResume));
resumeRouter.delete("/:id", requireAuth, asyncHandler(deleteResume));
resumeRouter.get(
  "/:id/tailoring-check",
  requireAuth,
  asyncHandler(verifyResumeForTailoring),
);
