import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { SourceAvailabilityInfo, UserPreferencesDocument } from "@jobpilot/shared";
import { DEFAULT_PREFERENCES, Preference } from "../models/Preference.js";
import { aiClient } from "../services/aiClient.js";
import { AppError } from "../types/errors.js";

const FALLBACK_SOURCES: SourceAvailabilityInfo[] = [
  {
    source: "remotive",
    name: "Remotive",
    available: true,
    supportedFilters: ["category", "search"],
  },
  {
    source: "arbeitnow",
    name: "Arbeitnow",
    available: true,
    supportedFilters: [],
  },
  {
    source: "adzuna",
    name: "Adzuna",
    available: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    reason:
      process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
        ? undefined
        : "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY credentials",
    supportedFilters: ["what", "where", "salary_min", "contract_type", "max_days_old"],
  },
  {
    source: "greenhouse",
    name: "Greenhouse",
    available: true,
    supportedFilters: [],
  },
  {
    source: "lever",
    name: "Lever",
    available: true,
    supportedFilters: [],
  },
];

export async function getPreferences(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  let doc = await Preference.findOne({ userId });
  if (!doc) {
    doc = await Preference.create({
      userId,
      preferences: { ...DEFAULT_PREFERENCES },
      presets: [],
      activePresetId: null,
    });
  }

  const payload: UserPreferencesDocument = {
    userId: doc.userId.toString(),
    preferences: doc.preferences,
    presets: doc.presets,
    activePresetId: doc.activePresetId ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  res.status(200).json({ data: payload });
}

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const { preferences, activePresetId } = req.body;

  const doc = await Preference.findOneAndUpdate(
    { userId },
    {
      $set: {
        preferences,
        ...(activePresetId !== undefined ? { activePresetId } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const payload: UserPreferencesDocument = {
    userId: doc.userId.toString(),
    preferences: doc.preferences,
    presets: doc.presets,
    activePresetId: doc.activePresetId ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  res.status(200).json({ data: payload });
}

export async function savePreset(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const { name, preferences } = req.body;
  const newPreset = {
    id: randomUUID(),
    name: name.trim(),
    preferences,
    createdAt: new Date().toISOString(),
  };

  let doc = await Preference.findOne({ userId });
  if (!doc) {
    doc = new Preference({
      userId,
      preferences: preferences ?? { ...DEFAULT_PREFERENCES },
      presets: [newPreset],
      activePresetId: newPreset.id,
    });
  } else {
    doc.presets.push(newPreset);
    doc.activePresetId = newPreset.id;
  }

  await doc.save();

  res.status(201).json({
    data: newPreset,
    presets: doc.presets,
    activePresetId: doc.activePresetId,
  });
}

export async function deletePreset(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const { presetId } = req.params;
  const doc = await Preference.findOne({ userId });
  if (!doc) {
    throw new AppError("NOT_FOUND", "Preferences not found", 404);
  }

  doc.presets = doc.presets.filter((p) => p.id !== presetId);
  if (doc.activePresetId === presetId) {
    doc.activePresetId = null;
  }

  await doc.save();

  res.status(200).json({
    success: true,
    presets: doc.presets,
    activePresetId: doc.activePresetId,
  });
}

export async function getSourceStatuses(_req: Request, res: Response): Promise<void> {
  try {
    const aiResponse = await aiClient.get<{ sources?: SourceAvailabilityInfo[]; data?: SourceAvailabilityInfo[] }>("/v1/sources", {
      timeout: 3000,
    });
    const sources = aiResponse.data?.sources ?? aiResponse.data?.data;
    if (sources && Array.isArray(sources)) {
      res.status(200).json({ data: sources });
      return;
    }
  } catch {
    // If aiClient is unavailable or fails, gracefully return fallback sources
  }

  res.status(200).json({ data: FALLBACK_SOURCES });
}
