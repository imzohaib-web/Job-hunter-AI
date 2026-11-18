import { Router } from "express";
import {
  deletePreset,
  getPreferences,
  getSourceStatuses,
  savePreset,
  updatePreferences,
} from "../controllers/preferenceController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { savePresetSchema, updatePreferencesSchema } from "../schemas/preferenceSchemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const preferenceRouter = Router();

// Sources availability check (can be public or authenticated; let's allow authenticated)
preferenceRouter.use(requireAuth);

preferenceRouter.get("/", asyncHandler(getPreferences));
preferenceRouter.put(
  "/",
  validate({ body: updatePreferencesSchema }),
  asyncHandler(updatePreferences),
);
preferenceRouter.post(
  "/presets",
  validate({ body: savePresetSchema }),
  asyncHandler(savePreset),
);
preferenceRouter.delete("/presets/:presetId", asyncHandler(deletePreset));
preferenceRouter.get("/sources", asyncHandler(getSourceStatuses));
