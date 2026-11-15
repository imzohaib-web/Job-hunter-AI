import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const DISCOVERY_QUEUE_NAME = "job-discovery";
export const DISCOVERY_DLQ_NAME = "job-discovery-dlq";
export const DISCOVERY_JOB_NAME = "discover-and-rank";

export interface DiscoveryJobData {
  searchId: string;
  userId: string;
  query: {
    keywords: string;
    location?: string;
    remoteOnly?: boolean;
    seniority?: string;
    sources?: string[];
  };
}

let discoveryQueue: Queue<DiscoveryJobData> | null = null;
let discoveryDlq: Queue<DiscoveryJobData> | null = null;

export function getDiscoveryQueue(): Queue<DiscoveryJobData> {
  if (!discoveryQueue) {
    discoveryQueue = new Queue<DiscoveryJobData>(DISCOVERY_QUEUE_NAME, {
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
        removeOnFail: false, // Keep failed for DLQ inspection
      },
    });

    discoveryQueue.on("error", (err) => {
      logger.error({ err }, "BullMQ DiscoveryQueue error");
    });
  }

  return discoveryQueue;
}

export function getDiscoveryDlq(): Queue<DiscoveryJobData> {
  if (!discoveryDlq) {
    discoveryDlq = new Queue<DiscoveryJobData>(DISCOVERY_DLQ_NAME, {
      connection: {
        url: env.REDIS_URL,
      },
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });

    discoveryDlq.on("error", (err) => {
      logger.error({ err }, "BullMQ Discovery DLQ error");
    });
  }

  return discoveryDlq;
}

export async function enqueueDiscovery(data: DiscoveryJobData): Promise<void> {
  if (env.NODE_ENV === "test") {
    // In test environment, allow tests to execute pipeline directly
    return;
  }

  try {
    const queue = getDiscoveryQueue();
    await queue.add(DISCOVERY_JOB_NAME, data);
    logger.info({ searchId: data.searchId }, "Enqueued discovery job to BullMQ");
  } catch (err) {
    logger.warn({ err, searchId: data.searchId }, "Failed to enqueue to BullMQ directly");
    throw err;
  }
}

export async function closeDiscoveryQueue(): Promise<void> {
  if (discoveryQueue) {
    await discoveryQueue.close();
    discoveryQueue = null;
  }
  if (discoveryDlq) {
    await discoveryDlq.close();
    discoveryDlq = null;
  }
}
