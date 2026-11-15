import type { Server } from "node:http";
import { createApp } from "./app.js";
import { connectMongo, disconnectMongo } from "./config/db.js";
import { env } from "./config/env.js";
import { disconnectRedis, getRedisClient } from "./config/redis.js";
import { closeDiscoveryQueue } from "./queues/discoveryQueue.js";
import { closeDiscoveryWorker, startDiscoveryWorker } from "./queues/discoveryWorker.js";
import { closeResumeQueue } from "./queues/resumeQueue.js";
import { closeResumeWorker, createResumeWorker } from "./queues/resumeWorker.js";
import { logger } from "./utils/logger.js";

const app = createApp();

let server: Server | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  try {
    // 1. Connect MongoDB with retry
    await connectMongo();

    // 2. Connect Redis
    getRedisClient();

    // 3. Start BullMQ background workers
    if (env.NODE_ENV !== "test") {
      createResumeWorker();
      startDiscoveryWorker();
    }

    // 4. Start HTTP listener
    server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, "JobPilot API server listening");
    });

    server.on("error", async (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.fatal(
          { port: env.PORT },
          `Port ${env.PORT} is already in use. A process (such as Docker Desktop or another terminal) is already running on this port.`,
        );
      } else {
        logger.fatal({ err }, "HTTP server error; shutting down");
      }
      await gracefulShutdown("SERVER_ERROR");
      process.exit(1);
    });
  } catch (err) {
    logger.fatal({ err }, "Fatal error during API startup; shutting down");
    await gracefulShutdown("STARTUP_ERROR");
    process.exit(1);
  }
}

export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, "Received shutdown signal; closing connections...");

  const forceTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing process exit");
    process.exit(1);
  }, 10_000);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info("HTTP server closed");
    }

    await closeResumeWorker();
    await closeResumeQueue();
    await closeDiscoveryWorker();
    await closeDiscoveryQueue();
    await disconnectMongo();
    await disconnectRedis();

    logger.info("Graceful shutdown completed clean");
    clearTimeout(forceTimeout);
  } catch (err) {
    logger.error({ err }, "Error during graceful shutdown");
    clearTimeout(forceTimeout);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

if (env.NODE_ENV !== "test") {
  startServer();
}
