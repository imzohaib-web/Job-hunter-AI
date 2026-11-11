import { Redis } from "ioredis";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { aiClient } from "./aiClient.js";

export type CheckStatus = "ok" | "error";

export interface DeepHealthChecks {
  api: CheckStatus;
  aiService: CheckStatus;
  mongo: CheckStatus;
  redis: CheckStatus;
}

export async function checkAiService(): Promise<CheckStatus> {
  try {
    const res = await aiClient.get("/health");
    if (res.status === 200 && res.data?.status === "ok") {
      return "ok";
    }
    return "error";
  } catch {
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

export async function runDeepHealthChecks(): Promise<DeepHealthChecks> {
  const [aiService, mongo, redis] = await Promise.all([
    checkAiService(),
    checkMongo(),
    checkRedis(),
  ]);

  return {
    api: "ok",
    aiService,
    mongo,
    redis,
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
