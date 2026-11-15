import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { globalRateLimiter } from "./middleware/rateLimiter.js";
import { requestId } from "./middleware/requestId.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { getBullBoardAdapter } from "./queues/bullBoard.js";
import { apiRouter } from "./routes/index.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(globalRateLimiter);
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === "/api/health" || req.url?.startsWith("/api/health/"),
      },
    }),
  );

  app.use("/admin/queues", requireAuth, requireAdmin, getBullBoardAdapter().getRouter());
  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
