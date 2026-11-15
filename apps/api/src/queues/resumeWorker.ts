import { Worker, type Job } from "bullmq";
import { env } from "../config/env.js";
import { Resume } from "../models/Resume.js";
import { aiClient } from "../services/aiClient.js";
import { getStorageService } from "../services/storage/index.js";
import { logger } from "../utils/logger.js";
import {
  PARSE_RESUME_JOB_NAME,
  RESUME_QUEUE_NAME,
  type ParseResumeJobData,
} from "./resumeQueue.js";

export async function processParseResumeJob(data: ParseResumeJobData): Promise<void> {
  const { resumeId, storageKey, filename, mimeType } = data;
  logger.info({ resumeId, filename }, "Starting parse-resume processing");

  const resume = await Resume.findById(resumeId);
  if (!resume) {
    logger.error({ resumeId }, "Resume document not found for parsing job");
    return;
  }

  resume.status = "processing";
  await resume.save();

  try {
    const storage = getStorageService();
    const fileBuffer = await storage.get(storageKey);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    formData.append("file", blob, filename);

    // Call AI service /v1/parse-resume
    const response = await aiClient.post("/v1/parse-resume", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    const result = response.data;
    const parsedData = result.data;
    const warnings = result.warnings ?? [];
    const fieldConfidences = parsedData?.field_confidence ?? {};

    resume.parsedProfile = parsedData;
    resume.warnings = warnings;
    resume.fieldConfidences = fieldConfidences;
    resume.status = "ready";
    resume.error = null;
    await resume.save();

    logger.info({ resumeId }, "Resume parsed successfully and updated to ready");
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to parse resume";
    logger.error({ resumeId, err: errorMessage }, "Resume parsing failed in worker");

    resume.status = "failed";
    resume.error = errorMessage;
    await resume.save();

    throw err;
  }
}

let resumeWorker: Worker<ParseResumeJobData> | null = null;

export function createResumeWorker(): Worker<ParseResumeJobData> {
  if (!resumeWorker) {
    resumeWorker = new Worker<ParseResumeJobData>(
      RESUME_QUEUE_NAME,
      async (job: Job<ParseResumeJobData>) => {
        if (job.name === PARSE_RESUME_JOB_NAME) {
          await processParseResumeJob(job.data);
        }
      },
      {
        connection: {
          url: env.REDIS_URL,
        },
        concurrency: 3,
      },
    );

    resumeWorker.on("completed", (job) => {
      logger.info(
        { jobId: job.id, resumeId: job.data.resumeId },
        "Resume parsing job completed",
      );
    });

    resumeWorker.on("failed", (job, err) => {
      logger.error(
        { jobId: job?.id, resumeId: job?.data.resumeId, err: err.message },
        "Resume parsing job failed",
      );
    });
  }

  return resumeWorker;
}

export async function closeResumeWorker(): Promise<void> {
  if (resumeWorker) {
    await resumeWorker.close();
    resumeWorker = null;
  }
}
