import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import type { ApiErrorBody } from "../types/errors.js";

const rateLimitHandler = (
  _req: unknown,
  res: { status: (code: number) => { json: (body: ApiErrorBody) => void } },
) => {
  res.status(429).json({
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests, please try again later",
    },
  });
};

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const aiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_AI_WINDOW_MS,
  max: env.RATE_LIMIT_AI_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
