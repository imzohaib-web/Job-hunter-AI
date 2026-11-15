import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: env.NODE_ENV === "test" ? 1 : null,
      lazyConnect: true,
      enableOfflineQueue: env.NODE_ENV !== "test",
      connectTimeout: env.NODE_ENV === "test" ? 300 : 5000,
      retryStrategy:
        env.NODE_ENV === "test" ? () => null : (times) => Math.min(times * 100, 3000),
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      logger.error({ err }, "Redis client error");
    });
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info("Redis client disconnected gracefully");
    } catch (err) {
      logger.warn({ err }, "Error while disconnecting Redis client; forcing disconnect");
      redisClient.disconnect();
    } finally {
      redisClient = null;
    }
  }
}
