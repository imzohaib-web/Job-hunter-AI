import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Artifact } from "../models/Artifact.js";
import { LlmRun } from "../models/LlmRun.js";
import { Match } from "../models/Match.js";
import { Resume } from "../models/Resume.js";
import { aiClient } from "../services/aiClient.js";
import { incrementUserAiQuota } from "../middleware/quota.js";
import { appEventBus } from "../services/eventBus.js";
import { AppError } from "../types/errors.js";
import { logger } from "../utils/logger.js";

export async function prepareApplication(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid match id");
  }

  const match = await Match.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  }).populate("jobId");

  if (!match) {
    throw new AppError(404, "MATCH_NOT_FOUND", "Match record not found");
  }

  // 1. Enforce verifiedProfile requirement (409 guard)
  const resume = await Resume.findOne({ userId: new Types.ObjectId(userId) }).sort({
    createdAt: -1,
  });

  if (!resume || !resume.verifiedProfile) {
    throw new AppError(
      409,
      "PROFILE_NOT_VERIFIED",
      "Candidate profile must be verified before tailoring application materials",
    );
  }

  const startTime = Date.now();

  const jobDoc = match.jobId as unknown as {
    source?: string;
    externalId?: string;
    title: string;
    company: string;
    location: string;
    remote?: boolean;
    description: string;
    skills?: string[];
    url: string;
    postedAt?: Date;
  };

  const preparePayload = {
    profile: resume.verifiedProfile,
    job: {
      source: jobDoc.source || "manual",
      external_id: jobDoc.externalId || `job-${match.jobId._id}`,
      title: jobDoc.title,
      company: jobDoc.company,
      location: jobDoc.location,
      remote: jobDoc.remote,
      description: jobDoc.description,
      skills: jobDoc.skills || [],
      url: jobDoc.url,
      posted_at: jobDoc.postedAt
        ? new Date(jobDoc.postedAt).toISOString()
        : new Date().toISOString(),
    },
    company_name: jobDoc.company,
  };

  try {
    const aiRes = await aiClient.post<{ run_id: string; status: string }>(
      "/v1/graphs/prepare-application",
      preparePayload,
    );

    const latencyMs = Date.now() - startTime;
    await incrementUserAiQuota(userId);

    // Log call into LlmRun without prompt text
    await LlmRun.create({
      task: "prepare-application",
      provider: "ai-service",
      model: "graph-orchestrator",
      tokens: { prompt: 0, completion: 0, total: 0 },
      latencyMs,
      costUsd: 0.005,
      userId: new Types.ObjectId(userId),
      success: true,
    });

    res.status(202).json({
      data: {
        runId: aiRes.data.run_id,
        status: aiRes.data.status,
        matchId: match._id,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await LlmRun.create({
      task: "prepare-application",
      provider: "ai-service",
      model: "graph-orchestrator",
      tokens: { prompt: 0, completion: 0, total: 0 },
      latencyMs: Date.now() - startTime,
      costUsd: 0,
      userId: new Types.ObjectId(userId),
      success: false,
      error: errorMsg,
    });
    throw err;
  }
}

export async function persistGraphArtifacts(
  userId: string,
  matchId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const finalResult = (state.final_result || state) as Record<string, unknown>;
  const tailoredResume = finalResult.tailored_resume || state.tailored_resume;
  const coverLetter = finalResult.cover_letter || state.cover_letter;
  const interviewPack = finalResult.interview_pack || state.interview_pack;
  const companyInsight = finalResult.company_insight || state.company_insight;

  const userObjId = new Types.ObjectId(userId);
  const matchObjId = new Types.ObjectId(matchId);

  if (tailoredResume) {
    const tailoredObj = tailoredResume as Record<string, unknown>;
    await Artifact.findOneAndUpdate(
      { userId: userObjId, matchId: matchObjId, type: "tailored_resume" },
      {
        userId: userObjId,
        matchId: matchObjId,
        type: "tailored_resume",
        content: tailoredResume,
        fabricationReport: tailoredObj.fabrication_report || null,
        version: 1,
      },
      { upsert: true, new: true },
    );
  }

  if (coverLetter) {
    await Artifact.findOneAndUpdate(
      { userId: userObjId, matchId: matchObjId, type: "cover_letter" },
      {
        userId: userObjId,
        matchId: matchObjId,
        type: "cover_letter",
        content: coverLetter,
        version: 1,
      },
      { upsert: true, new: true },
    );
  }

  if (interviewPack) {
    await Artifact.findOneAndUpdate(
      { userId: userObjId, matchId: matchObjId, type: "interview_pack" },
      {
        userId: userObjId,
        matchId: matchObjId,
        type: "interview_pack",
        content: interviewPack,
        version: 1,
      },
      { upsert: true, new: true },
    );
  }

  if (companyInsight) {
    await Artifact.findOneAndUpdate(
      { userId: userObjId, matchId: matchObjId, type: "company_insight" },
      {
        userId: userObjId,
        matchId: matchObjId,
        type: "company_insight",
        content: companyInsight,
        version: 1,
      },
      { upsert: true, new: true },
    );
  }
}

export async function streamRunEvents(
  req: Request<{ id: string }, unknown, unknown, { matchId?: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id: runId } = req.params;
  const { matchId } = req.query;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const sseResponse = await aiClient.get(`/v1/graphs/${runId}/events`, {
      responseType: "stream",
    });

    sseResponse.data.on("data", async (chunk: Buffer) => {
      res.write(chunk);
    });

    sseResponse.data.on("end", async () => {
      // Stream finished, fetch final graph snapshot and persist artifacts
      try {
        const snapshotRes = await aiClient.get<{ state: Record<string, unknown> }>(
          `/v1/graphs/${runId}`,
        );
        if (snapshotRes.data?.state && matchId) {
          await persistGraphArtifacts(userId, matchId, snapshotRes.data.state);
        }
      } catch (snapErr) {
        logger.warn(
          { snapErr, runId },
          "Failed to fetch final graph snapshot for artifacts",
        );
      }
      res.end();
    });

    sseResponse.data.on("error", (streamErr: unknown) => {
      logger.error({ streamErr, runId }, "Error in relayed graph SSE stream");
      res.end();
    });

    req.on("close", () => {
      sseResponse.data?.destroy?.();
    });
  } catch (err: unknown) {
    logger.warn(
      { err, runId },
      "Could not connect to ai-service graph SSE, falling back to event bus",
    );
    // Fall back to local event bus listener
    const unsubscribe = appEventBus.onRunEvent(runId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.status === "completed" || event.status === "failed") {
        unsubscribe();
        res.end();
      }
    });

    req.on("close", () => {
      unsubscribe();
    });
  }
}

export async function resumeRun(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id: runId } = req.params;

  try {
    const resumeRes = await aiClient.post(`/v1/graphs/${runId}/resume`);
    res.status(200).json({ data: resumeRes.data });
  } catch {
    throw new AppError(500, "RESUME_FAILED", "Failed to resume graph execution");
  }
}

export async function getRunSnapshot(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id: runId } = req.params;

  try {
    const snapshotRes = await aiClient.get(`/v1/graphs/${runId}`);
    res.status(200).json({ data: snapshotRes.data });
  } catch {
    throw new AppError(404, "RUN_NOT_FOUND", "Run not found");
  }
}
