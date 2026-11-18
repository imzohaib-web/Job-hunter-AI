import { Redis } from "ioredis";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { aiClient } from "./aiClient.js";
import { getStorageService } from "./storage/index.js";

export type CheckStatus = "ok" | "starting" | "error";

export interface DeepHealthChecks {
  api: CheckStatus;
  aiService: CheckStatus;
  mongo: CheckStatus;
  redis: CheckStatus;
  storage: CheckStatus;
}

export async function checkAiService(): Promise<CheckStatus> {
  try {
    const readyRes = await aiClient.get<{ status?: string }>("/ready", { timeout: 2000 });
    if (readyRes.status === 200 && readyRes.data?.status === "ready") {
      return "ok";
    }
    return "starting";
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr.response?.status === 503) {
      return "starting";
    }
    try {
      const healthRes = await aiClient.get<{ status?: string }>("/health", { timeout: 2000 });
      if (healthRes.status === 200) {
        return "starting";
      }
    } catch {
      // Both /ready and /health failed
    }
    return "error";
  }
}

export async function checkMongo(): Promise<CheckStatus> {
  try {
    const connection = await mongoose
      .createConnection(env.MONGODB_URI, { serverSelectionTimeoutMS: 3_000 })
      .asPromise();
    try {
      await connection.db?.admin().ping();
      return "ok";
    } finally {
      await connection.close();
    }
  } catch {
    return "error";
  }
}

export async function checkRedis(): Promise<CheckStatus> {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    client.disconnect();
  }
}

export async function checkStorage(): Promise<CheckStatus> {
  try {
    const storage = getStorageService();
    await storage.selfCheck();
    return "ok";
  } catch {
    return "error";
  }
}

export async function runDeepHealthChecks(): Promise<DeepHealthChecks> {
  const [aiService, mongo, redis, storage] = await Promise.all([
    checkAiService(),
    checkMongo(),
    checkRedis(),
    checkStorage(),
  ]);

  return {
    api: "ok",
    aiService,
    mongo,
    redis,
    storage,
  };
}

export function summarizeDeepHealth(
  checks: DeepHealthChecks,
): "ok" | "degraded" | "error" {
  const values = Object.values(checks);
  if (values.every((status) => status === "ok")) {
    return "ok";
  }
  if (values.every((status) => status === "error")) {
    return "error";
  }
  return "degraded";
}
