import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, type ApiErrorBody } from "../types/errors.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
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
      },
    };
    res.status(400).json(body);
    return;
  }

  logger.error({ err }, "Unhandled error");
  const body: ApiErrorBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
  res.status(500).json(body);
}
