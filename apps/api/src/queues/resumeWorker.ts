import { isAxiosError } from "axios";
import { Worker, type Job } from "bullmq";
import { env } from "../config/env.js";
import { Resume } from "../models/Resume.js";
import { aiClient } from "../services/aiClient.js";
import { getStorageService } from "../services/storage/index.js";
import { AppError, type ErrorCode } from "../types/errors.js";
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
    let fileBuffer: Buffer;
    try {
      fileBuffer = await storage.get(storageKey);
    } catch (storageErr) {
      throw new AppError(
        "STORAGE_FAILED",
        "Failed to retrieve stored resume file from disk",
        500,
        storageErr instanceof Error ? storageErr.message : undefined,
      );
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    formData.append("file", blob, filename);

    // Call AI service /v1/parse-resume
    // Note: Do not manually set Content-Type: multipart/form-data here because
    // Axios must attach the boundary delimiter automatically.
    let response;
    try {
      response = await aiClient.post("/v1/parse-resume", formData);
    } catch (aiErr) {
      if (isAxiosError(aiErr)) {
        const isUnavailable =
          !aiErr.response ||
          aiErr.response.status >= 502 ||
          aiErr.code === "ECONNREFUSED" ||
          aiErr.code === "ETIMEDOUT" ||
          aiErr.code === "ECONNABORTED";

        if (isUnavailable) {
          throw new AppError(
            "PARSER_UNAVAILABLE",
            "Resume parser service is unavailable. Please try again later.",
            503,
            aiErr.message,
          );
        } else {
          const detail =
            aiErr.response?.data && typeof aiErr.response.data === "object"
              ? JSON.stringify(aiErr.response.data)
              : aiErr.message;
          throw new AppError(
            "PARSER_FAILED",
            `Resume parsing failed: ${detail}`,
            502,
            detail,
          );
        }
      }
      throw new AppError(
        "PARSER_FAILED",
        aiErr instanceof Error ? aiErr.message : "Failed to parse resume",
        502,
      );
    }

    const result = response.data;
    const parsedData = result.data;
    const warnings = result.warnings ?? [];
    const fieldConfidences = parsedData?.field_confidence ?? {};

    // Requirement 2: Never return or accept an empty profile silently
    if (
      !parsedData ||
      ((!parsedData.skills || parsedData.skills.length === 0) &&
        (!parsedData.experience || parsedData.experience.length === 0) &&
        (!parsedData.education || parsedData.education.length === 0))
    ) {
      throw new AppError(
        "PARSER_FAILED",
        "Resume parser returned an empty profile with no skills, experience, or education",
        502,
      );
    }

    resume.parsedProfile = parsedData;
    resume.warnings = warnings;
    resume.fieldConfidences = fieldConfidences;
    resume.status = "ready";
    resume.error = null;
    await resume.save();

    // Requirement 3: Log the keys and array lengths (not values) that are stored
    logger.info(
      {
        resumeId,
        keys: Object.keys(parsedData),
        skillsCount: parsedData.skills?.length ?? 0,
        experienceCount: parsedData.experience?.length ?? 0,
        educationCount: parsedData.education?.length ?? 0,
        projectsCount: parsedData.projects?.length ?? 0,
        certificationsCount: parsedData.certifications?.length ?? 0,
        languagesCount: parsedData.languages?.length ?? 0,
      },
      "Resume parsed successfully and updated to ready with stored profile counts",
    );
  } catch (err: unknown) {
    let errorCode: ErrorCode = "PARSER_FAILED";
    let errorMessage = "Failed to parse resume";

    if (err instanceof AppError) {
      errorCode = err.code;
      errorMessage = err.message;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    logger.error(
      { resumeId, code: errorCode, err: errorMessage },
      "Resume parsing failed in worker",
    );

    resume.status = "failed";
    resume.error = `${errorCode}: ${errorMessage}`;
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
