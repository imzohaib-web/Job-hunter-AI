import type { HealthStatus } from "@jobpilot/shared";
import type { Request, Response } from "express";

export function getHealth(_req: Request, res: Response): void {
  const payload: HealthStatus = {
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(payload);
}
