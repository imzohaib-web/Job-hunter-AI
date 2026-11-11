import type { DeepHealthStatus, HealthStatus } from "@jobpilot/shared";
import type { Request, Response } from "express";
import { runDeepHealthChecks, summarizeDeepHealth } from "../services/healthChecks.js";

export function getHealth(_req: Request, res: Response): void {
  const payload: HealthStatus = {
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(payload);
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
  const httpStatus = status === "error" ? 503 : 200;
  res.status(httpStatus).json(payload);
}
