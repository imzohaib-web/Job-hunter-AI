import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.header("X-Request-Id");
  const id =
    existingId && existingId.trim().length > 0 ? existingId : crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
