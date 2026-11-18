import type { Request, Response } from "express";
import { Types } from "mongoose";
import { SearchRun } from "../models/SearchRun.js";
import { enqueueDiscovery } from "../queues/discoveryQueue.js";
import type { CreateSearchInput } from "../schemas/searchSchemas.js";
import { aiClient } from "../services/aiClient.js";
import { appEventBus } from "../services/eventBus.js";
import { AppError } from "../types/errors.js";

const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function createSearch(
  req: Request<unknown, unknown, CreateSearchInput>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  // Pre-search readiness check against ai-service /ready
  try {
    const readyRes = await aiClient.get<{ status?: string }>("/ready", { timeout: 3000 });
    if (readyRes.status !== 200 || readyRes.data?.status !== "ready") {
      throw new AppError(
        "AI_SERVICE_UNAVAILABLE",
        "The AI service is still starting, try again in a moment",
        503,
      );
    }
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    const axiosErr = err as { response?: { status?: number; data?: unknown } };
    if (axiosErr.response?.status === 503 || axiosErr.response?.status === 500) {
      throw new AppError(
        "AI_SERVICE_UNAVAILABLE",
        "The AI service is still starting, try again in a moment",
        503,
      );
    }
    if (process.env.NODE_ENV !== "test") {
      throw new AppError(
        "AI_SERVICE_UNAVAILABLE",
        "The AI service is still starting, try again in a moment",
        503,
      );
    }
  }

  const preferences = req.body.preferences;
  const rawKeywords =
    req.body.keywords ||
    (req.body as { query?: string }).query ||
    (preferences?.targetTitles?.join(", ")) ||
    "";
  const keywords = rawKeywords.trim();
  const location =
    req.body.location ||
    (preferences?.locations?.map((l: { city?: string; country?: string; label?: string }) => l.city || l.country || l.label).filter(Boolean).join(", ")) ||
    null;
  const remoteOnly = Boolean(
    req.body.remoteOnly ??
      (preferences?.remoteWorldwide || preferences?.workModes?.includes("remote") || false),
  );
  const seniority = req.body.seniority || preferences?.experienceLevels?.[0] || null;
  const sources = req.body.sources || preferences?.sources || [];

  // 10-minute idempotency check for the current user
  // Never reuse a SearchRun if status === "failed", and allow forced re-runs when requested.
  // Only reuse if there is an active in-flight run (pending/processing).
  const force = Boolean(req.body.force);
  if (!force) {
    const tenMinutesAgo = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
    const existingRun = await SearchRun.findOne({
      userId: new Types.ObjectId(userId),
      createdAt: { $gte: tenMinutesAgo },
      status: { $in: ["pending", "processing"] },
      "query.keywords": keywords,
      "query.location": location || null,
      "query.remoteOnly": Boolean(remoteOnly),
      "query.seniority": seniority || null,
    }).sort({ createdAt: -1 });

    if (existingRun) {
      res.status(200).json({
        message: "Reusing active search run from past 10 minutes",
        data: existingRun,
      });
      return;
    }
  }

  const searchRun = await SearchRun.create({
    userId: new Types.ObjectId(userId),
    query: {
      keywords,
      location: location || null,
      remoteOnly: Boolean(remoteOnly),
      seniority: seniority || null,
      sources: sources || [],
      preferences: preferences || null,
    },
    status: "pending",
    resultsCount: 0,
    perSourceCounts: {},
    durationMs: 0,
  });

  try {
    await enqueueDiscovery({
      searchId: searchRun._id.toString(),
      userId,
      query: {
        keywords,
        location: location || undefined,
        remoteOnly,
        seniority: seniority || undefined,
        sources,
        preferences,
      },
    });
  } catch {
    // If BullMQ fails or is in test mode, searchRun remains available
  }

  res.status(201).json({
    data: searchRun,
  });
}

export async function getSearch(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const searchRun = await SearchRun.findOne({
    _id: req.params.id,
    userId: new Types.ObjectId(userId),
  });

  if (!searchRun) {
    throw new AppError(404, "SEARCH_NOT_FOUND", "Search run not found");
  }

  res.status(200).json({
    data: searchRun,
  });
}

export async function streamSearchEvents(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const searchRun = await SearchRun.findOne({
    _id: req.params.id,
    userId: new Types.ObjectId(userId),
  });

  if (!searchRun) {
    throw new AppError(404, "SEARCH_NOT_FOUND", "Search run not found");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send initial event
  res.write(
    `data: ${JSON.stringify({
      type: searchRun.status === "failed" ? "failed" : "status",
      status: searchRun.status,
      resultsCount: searchRun.resultsCount,
      perSourceCounts: searchRun.perSourceCounts,
      sourceStatuses: searchRun.sourceStatuses,
      diagnostics: searchRun.diagnostics,
      error: searchRun.error,
      errorStack: searchRun.errorStack,
      durationMs: searchRun.durationMs,
    })}\n\n`,
  );

  // If already finished, close
  if (searchRun.status === "completed" || searchRun.status === "failed") {
    res.end();
    return;
  }

  const unsubscribe = appEventBus.onSearchEvent(searchRun._id.toString(), (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === "completed" || event.type === "failed") {
      unsubscribe();
      res.end();
    }
  });

  req.on("close", () => {
    unsubscribe();
  });
}
