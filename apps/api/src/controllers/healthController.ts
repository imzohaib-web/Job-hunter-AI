import { PIPELINE_VERSION, type DeepHealthStatus, type HealthStatus, type VersionInfo } from "@jobpilot/shared";
import axios from "axios";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { runDeepHealthChecks, summarizeDeepHealth } from "../services/healthChecks.js";

export function getHealth(_req: Request, res: Response): void {
  const payload: HealthStatus = {
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(payload);
}

export function getVersion(_req: Request, res: Response): void {
  const payload: VersionInfo = {
    service: "api",
    git_sha: process.env.GIT_SHA || "dev",
    build_time: process.env.BUILD_TIME || "unknown",
    pipeline_version: PIPELINE_VERSION,
  };
  res.status(200).json(payload);
}

export async function getAiVersion(_req: Request, res: Response): Promise<void> {
  try {
    const aiUrl = env.AI_SERVICE_URL;
    const { data } = await axios.get<VersionInfo>(`${aiUrl}/version`, { timeout: 3000 });
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({
      service: "ai-service",
      git_sha: "unknown",
      build_time: "unknown",
      pipeline_version: "unknown",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getDeepHealth(_req: Request, res: Response): Promise<void> {
  const checks = await runDeepHealthChecks();
  const status = summarizeDeepHealth(checks);
  const payload: DeepHealthStatus = {
    status,
    service: "api",
    timestamp: new Date().toISOString(),
    checks,
  };
  const httpCode = status === "error" ? 503 : 200;
  res.status(httpCode).json(payload);
}
