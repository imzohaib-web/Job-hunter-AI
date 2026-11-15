import { Router } from "express";
import { deleteAccount } from "../controllers/authController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { checkAiQuota, incrementUserAiQuota } from "../middleware/quota.js";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import { getBullBoardAdapter } from "../queues/bullBoard.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { analyticsRouter } from "./analytics.js";
import { applicationRouter } from "./applications.js";
import { artifactRouter } from "./artifacts.js";
import { authRouter } from "./auth.js";
import { healthRouter } from "./health.js";
import { jobRouter } from "./jobs.js";
import { matchRouter } from "./matches.js";
import { resumeRouter } from "./resume.js";
import { runRouter } from "./runs.js";
import { searchRouter } from "./searches.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/resumes", resumeRouter);
apiRouter.use("/searches", searchRouter);
apiRouter.use("/matches", matchRouter);
apiRouter.use("/jobs", jobRouter);
apiRouter.use("/runs", runRouter);
apiRouter.use("/artifacts", artifactRouter);
apiRouter.use("/applications", applicationRouter);
apiRouter.use("/analytics", analyticsRouter);

// Account deletion endpoint (Prompt 11: DELETE /api/me that removes all user data and files)
apiRouter.delete("/me", requireAuth, asyncHandler(deleteAccount));

// Bull Board dashboard mounted behind admin role check
apiRouter.use(
  "/admin/queues",
  requireAuth,
  requireAdmin,
  getBullBoardAdapter().getRouter(),
);

// Protected AI endpoint for testing quota and aiRateLimiter
apiRouter.post(
  "/ai/test",
  requireAuth,
  aiRateLimiter,
  asyncHandler(checkAiQuota),
  asyncHandler(async (req, res) => {
    if (req.user?.id) {
      await incrementUserAiQuota(req.user.id);
    }
    res.status(200).json({ ok: true, message: "AI action executed successfully" });
  }),
);
