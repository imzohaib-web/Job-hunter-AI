import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Artifact } from "../models/Artifact.js";
import { Job } from "../models/Job.js";
import { LlmRun } from "../models/LlmRun.js";
import { Match } from "../models/Match.js";
import { Resume } from "../models/Resume.js";
import { Run, type NodeStatusRecord } from "../models/Run.js";
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

  const jobDoc = match.jobId as unknown as {
    _id?: Types.ObjectId;
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

  // Enforce non-empty job description (409 guard)
  if (!jobDoc?.description || !jobDoc.description.trim()) {
    throw new AppError(
      409,
      "JOB_DESCRIPTION_EMPTY",
      "Target job posting description is empty or missing",
    );
  }

  const startTime = Date.now();
  const requestId = (req as unknown as { id?: string }).id || `req-${Date.now()}`;

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
    company_website: undefined as string | undefined,
  };

  try {
    const aiRes = await aiClient.post<{ run_id: string; status: string }>(
      "/v1/graphs/prepare-application",
      preparePayload,
    );

    const runId = aiRes.data.run_id;
    const latencyMs = Date.now() - startTime;
    await incrementUserAiQuota(userId);

    // Structured logging at each hop without leaking resume or job text
    const verifiedProfileObj = resume.verifiedProfile as unknown as {
      skills?: unknown[];
      experience?: unknown[];
      projects?: unknown[];
    };
    logger.info(
      {
        requestId,
        runId,
        matchId: match._id.toString(),
        userId,
        profileStats: {
          skillsCount: verifiedProfileObj?.skills?.length ?? 0,
          experienceCount: verifiedProfileObj?.experience?.length ?? 0,
          projectsCount: verifiedProfileObj?.projects?.length ?? 0,
        },
        jobStats: {
          descriptionLength: jobDoc.description.length,
          title: jobDoc.title,
          company: jobDoc.company,
        },
      },
      "Prepare application graph initiated successfully",
    );

    // Persist initial Run record in MongoDB for state restoration
    await Run.create({
      runId,
      userId: new Types.ObjectId(userId),
      matchId: match._id,
      jobId: match.jobId._id,
      status: "queued",
      nodeStatus: {
        company_research: { status: "pending" },
        tailor_resume: { status: "pending" },
        fabrication_check: { status: "pending" },
      },
      inputs: preparePayload,
      profileVersion: resume.version || 1,
    });

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
        runId,
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
  profileVersion: number = 1,
): Promise<void> {
  const finalResult = (state.final_result || state) as Record<string, unknown>;
  const tailoredResume = finalResult.tailored_resume || state.tailored_resume;
  const companyInsight = finalResult.company_insight || state.company_insight;

  const userObjId = new Types.ObjectId(userId);
  const matchObjId = new Types.ObjectId(matchId);

  if (tailoredResume) {
    const tailoredObj = tailoredResume as Record<string, unknown>;
    const latestArtifact = await Artifact.findOne({
      userId: userObjId,
      matchId: matchObjId,
      type: "tailored_resume",
    }).sort({ version: -1 });

    const nextVersion = latestArtifact ? latestArtifact.version + 1 : 1;

    await Artifact.create({
      userId: userObjId,
      matchId: matchObjId,
      type: "tailored_resume",
      content: tailoredResume,
      fabricationReport: tailoredObj.fabrication_report || state.fabrication_report || null,
      version: nextVersion,
    });

    logger.info(
      { userId, matchId, version: nextVersion },
      "Tailored resume artifact persisted with version increment",
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

  // Send SSE heartbeat every 15s to keep connection alive
  const heartbeatTimer = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": heartbeat\n\n");
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeatTimer);
  };

  try {
    const sseResponse = await aiClient.get(`/v1/graphs/${runId}/events`, {
      responseType: "stream",
      headers: req.headers["last-event-id"]
        ? { "Last-Event-ID": String(req.headers["last-event-id"]) }
        : undefined,
    });

    sseResponse.data.on("data", async (chunk: Buffer) => {
      res.write(chunk);

      // Parse event string and update MongoDB Run record
      try {
        const text = chunk.toString("utf-8");
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            const eventData = JSON.parse(jsonStr) as {
              node?: string;
              status?: string;
              started_at?: string;
              ended_at?: string;
              message?: string;
            };

            if (eventData.node && eventData.node !== "system") {
              const runDoc = await Run.findOne({ runId, userId: new Types.ObjectId(userId) });
              if (runDoc) {
                const nodeKey = eventData.node;
                const nodeStatuses = (runDoc.nodeStatus || {}) as Record<string, NodeStatusRecord>;
                const existing = nodeStatuses[nodeKey] || { status: "pending" };
                const updatedStatus = (
                  eventData.status === "done" ? "completed" : (eventData.status || "pending")
                ) as "pending" | "running" | "completed" | "skipped" | "failed";

                const startedAtDate = eventData.started_at ? new Date(eventData.started_at) : existing.startedAt || new Date();
                const endedAtDate = eventData.ended_at ? new Date(eventData.ended_at) : null;
                const durationMs = endedAtDate && startedAtDate ? endedAtDate.getTime() - startedAtDate.getTime() : 0;

                nodeStatuses[nodeKey] = {
                  status: updatedStatus,
                  startedAt: startedAtDate,
                  endedAt: endedAtDate,
                  durationMs,
                  message: eventData.message || "",
                  error: updatedStatus === "failed" ? eventData.message : "",
                };
                runDoc.nodeStatus = nodeStatuses;
                runDoc.markModified("nodeStatus");

                if (updatedStatus === "failed") {
                  runDoc.status = "failed";
                  runDoc.error = eventData.message || "Node execution failed";
                } else if (runDoc.status === "queued" && updatedStatus === "running") {
                  runDoc.status = "running";
                }

                await runDoc.save();
              }
            } else if (eventData.node === "system" && eventData.status === "done") {
              await Run.updateOne(
                { runId, userId: new Types.ObjectId(userId) },
                { status: "completed" },
              );
            }
          }
        }
      } catch (parseErr) {
        // Log parse warning without interrupting stream
        logger.debug({ parseErr }, "Non-fatal error parsing relayed SSE event");
      }
    });

    sseResponse.data.on("end", async () => {
      cleanup();
      try {
        const snapshotRes = await aiClient.get<{ state: Record<string, unknown> }>(
          `/v1/graphs/${runId}`,
        );
        const runDoc = await Run.findOne({ runId });
        const resolvedMatchId = (matchId as string) || runDoc?.matchId?.toString();
        if (snapshotRes.data?.state && resolvedMatchId) {
          await persistGraphArtifacts(
            userId,
            resolvedMatchId,
            snapshotRes.data.state,
            runDoc?.profileVersion || 1,
          );
          if (runDoc) {
            runDoc.status = "completed";
            await runDoc.save();
          }
        }
      } catch (snapErr) {
        logger.warn({ snapErr, runId }, "Failed to fetch final graph snapshot for artifacts");
      }
      res.end();
    });

    sseResponse.data.on("error", (streamErr: unknown) => {
      cleanup();
      logger.error({ streamErr, runId }, "Error in relayed graph SSE stream");
      res.end();
    });

    req.on("close", () => {
      cleanup();
      sseResponse.data?.destroy?.();
    });
  } catch (err: unknown) {
    cleanup();
    logger.warn(
      { err, runId },
      "Could not connect to ai-service graph SSE, falling back to event bus",
    );
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

export async function getRunSnapshot(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id: runId } = req.params;

  // 1. Check MongoDB for persisted run (so page refresh restores stepper state)
  const runDoc = await Run.findOne({
    runId,
    userId: new Types.ObjectId(userId),
  }).lean();

  // 2. Fetch live state from ai-service
  try {
    const aiSnapshot = await aiClient.get(`/v1/graphs/${runId}`);
    res.status(200).json({ data: aiSnapshot.data });
    return;
  } catch (aiErr) {
    if (runDoc) {
      // Reconstruct snapshot from persisted Mongo document
      const nodeStatusMap: Record<string, string> = {};
      const errorsMap: Record<string, string> = {};
      const eventsList: Array<{
        node?: string;
        status?: string;
        message?: string;
        timestamp: Date;
      }> = runDoc.events || [];

      if (runDoc.nodeStatus) {
        const rawNodeStatus = runDoc.nodeStatus as unknown as Record<
          string,
          { status: string; message?: string }
        >;
        for (const [node, info] of Object.entries(rawNodeStatus)) {
          nodeStatusMap[node] = info.status;
          if (info.status === "failed" && info.message) {
            errorsMap[node] = info.message;
          }
        }
      }

      res.status(200).json({
        data: {
          run_id: runDoc.runId,
          graph_type: "prepare-application",
          status: runDoc.status,
          node_status: nodeStatusMap,
          errors: errorsMap,
          events: eventsList,
          error: runDoc.error,
          state: runDoc.inputs,
        },
      });
      return;
    }

    throw new AppError(404, "RUN_NOT_FOUND", "Run not found");
  }
}

export async function retryNode(
  req: Request<{ id: string }, unknown, { node: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id: runId } = req.params;
  const { node } = req.body;

  const validNodes = ["company_research", "tailor_resume", "fabrication_check"];
  if (!node || !validNodes.includes(node)) {
    throw new AppError(
      400,
      "INVALID_NODE",
      `Node must be one of: ${validNodes.join(", ")}`,
    );
  }

  const runDoc = await Run.findOne({ runId, userId: new Types.ObjectId(userId) });
  if (runDoc) {
    runDoc.status = "running";
    const nodeStatuses = (runDoc.nodeStatus || {}) as Record<string, NodeStatusRecord>;
    nodeStatuses[node] = {
      status: "running",
      startedAt: new Date(),
      endedAt: null,
      message: `Retrying node '${node}'`,
    };
    runDoc.nodeStatus = nodeStatuses;
    runDoc.markModified("nodeStatus");
    await runDoc.save();
  }

  try {
    const aiRes = await aiClient.post(`/v1/graphs/${runId}/retry-node`, { node });
    res.status(200).json({ data: aiRes.data });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId, node }, "Failed to retry graph node");
    throw new AppError(500, "RETRY_NODE_FAILED", `Failed to retry node '${node}': ${errorMsg}`);
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
