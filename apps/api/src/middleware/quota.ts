import type { NextFunction, Request, Response } from "express";
import { User } from "../models/User.js";
import { AppError } from "../types/errors.js";

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkAiQuota(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Authentication required to check quota", 401);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  const today = getTodayDateString();
  if (user.quota.lastResetDate !== today) {
    user.quota.dailyAiRequests = 0;
    user.quota.lastResetDate = today;
    await user.save();
  }

  if (user.quota.dailyAiRequests >= user.quota.dailyLimit) {
    throw new AppError(
      "TOO_MANY_REQUESTS",
      `Daily AI request limit of ${user.quota.dailyLimit} reached. Limit resets at UTC midnight.`,
      429,
      {
        limit: user.quota.dailyLimit,
        used: user.quota.dailyAiRequests,
        resetsAt: `${today}T23:59:59Z`,
      },
    );
  }

  next();
}

export async function incrementUserAiQuota(userId: string): Promise<void> {
  const today = getTodayDateString();
  const user = await User.findById(userId);
  if (!user) return;

  if (user.quota.lastResetDate !== today) {
    user.quota.dailyAiRequests = 1;
    user.quota.lastResetDate = today;
  } else {
    user.quota.dailyAiRequests += 1;
  }

  await user.save();
}
