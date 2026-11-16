import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { AppError } from "../types/errors.js";
import { logger } from "../utils/logger.js";

export const RESUME_QUEUE_NAME = "resume-processing";
export const PARSE_RESUME_JOB_NAME = "parse-resume";

export interface ParseResumeJobData {
  resumeId: string;
  userId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
}

let resumeQueue: Queue<ParseResumeJobData> | null = null;

export function getResumeQueue(): Queue<ParseResumeJobData> {
  if (!resumeQueue) {
    resumeQueue = new Queue<ParseResumeJobData>(RESUME_QUEUE_NAME, {
      connection: {
        url: env.REDIS_URL,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    resumeQueue.on("error", (err) => {
      logger.error({ err }, "BullMQ ResumeQueue error");
    });
  }

  return resumeQueue;
}

export async function enqueueResumeParse(data: ParseResumeJobData): Promise<void> {
  if (env.NODE_ENV === "test") {
    throw new Error("BullMQ disabled in test environment");
  }

  try {
    const queue = getResumeQueue();
    await queue.add(PARSE_RESUME_JOB_NAME, data);
    logger.info({ resumeId: data.resumeId }, "Enqueued parse-resume job to BullMQ");
  } catch (err) {
    logger.warn(
      { err, resumeId: data.resumeId },
      "Failed to enqueue to BullMQ directly; will fall back if in test",
    );
    throw new AppError(
      "QUEUE_UNAVAILABLE",
      "Resume processing queue is currently unavailable. Please try again later.",
      503,
      err instanceof Error ? err.message : undefined,
    );
  }
}

export async function closeResumeQueue(): Promise<void> {
  if (resumeQueue) {
    await resumeQueue.close();
    resumeQueue = null;
  }
}
