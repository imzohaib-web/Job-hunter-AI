import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError, type ApiErrorBody } from "../types/errors.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const reqId = req.id !== undefined ? String(req.id) : undefined;

  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        ...(reqId ? { requestId: reqId } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.flatten(),
        ...(reqId ? { requestId: reqId } : {}),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "MulterError"
  ) {
    const multerErr = err as { code?: string; message?: string };
    if (multerErr.code === "LIMIT_FILE_SIZE") {
      const body: ApiErrorBody = {
        error: {
          code: "FILE_TOO_LARGE",
          message: "File exceeds maximum size of 5 MB",
          ...(reqId ? { requestId: reqId } : {}),
        },
      };
      res.status(413).json(body);
      return;
    }
    const body: ApiErrorBody = {
      error: {
        code: "BAD_REQUEST",
        message: multerErr.message ?? "File upload error",
        ...(reqId ? { requestId: reqId } : {}),
      },
    };
    res.status(400).json(body);
    return;
  }

  logger.error(
    {
      err,
      requestId: reqId,
      stack: err instanceof Error ? err.stack : undefined,
    },
    "Unhandled error",
  );

  const isDev = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  const body: ApiErrorBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      ...(reqId ? { requestId: reqId } : {}),
      ...(isDev
        ? {
            details:
              err instanceof Error
                ? { message: err.message, stack: err.stack }
                : { message: String(err) },
          }
        : {}),
    },
  };
  res.status(500).json(body);
}
