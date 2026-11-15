import type { Request, Response } from "express";
import { Types } from "mongoose";
import { SearchRun } from "../models/SearchRun.js";
import { enqueueDiscovery } from "../queues/discoveryQueue.js";
import type { CreateSearchInput } from "../schemas/searchSchemas.js";
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

  const rawKeywords = req.body.keywords || (req.body as { query?: string }).query || "";
  const keywords = rawKeywords.trim();
  const { location, remoteOnly, seniority, sources } = req.body;

  // 10-minute idempotency check for the current user
  const tenMinutesAgo = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const existingRun = await SearchRun.findOne({
    userId: new Types.ObjectId(userId),
    createdAt: { $gte: tenMinutesAgo },
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

  const searchRun = await SearchRun.create({
    userId: new Types.ObjectId(userId),
    query: {
      keywords,
      location: location || null,
      remoteOnly: Boolean(remoteOnly),
      seniority: seniority || null,
      sources: sources || [],
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
        location,
        remoteOnly,
        seniority,
        sources,
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
