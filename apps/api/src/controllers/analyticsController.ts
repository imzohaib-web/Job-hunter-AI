import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Application } from "../models/Application.js";
import { LlmRun } from "../models/LlmRun.js";
import { Match } from "../models/Match.js";
import { Resume } from "../models/Resume.js";
import { AppError } from "../types/errors.js";

export async function getAnalyticsSummary(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const userObjId = new Types.ObjectId(userId);

  // 1. Totals
  const [totalApplications, totalMatches, totalResumes] = await Promise.all([
    Application.countDocuments({ userId: userObjId }),
    Match.countDocuments({ userId: userObjId }),
    Resume.countDocuments({ userId: userObjId }),
  ]);

  // 2. Funnel counts
  const [savedCount, appliedCount, interviewCount, offerCount, rejectedCount] =
    await Promise.all([
      Application.countDocuments({ userId: userObjId, status: "saved" }),
      Application.countDocuments({ userId: userObjId, status: "applied" }),
      Application.countDocuments({ userId: userObjId, status: "interview" }),
      Application.countDocuments({ userId: userObjId, status: "offer" }),
      Application.countDocuments({ userId: userObjId, status: "rejected" }),
    ]);

  const funnel = {
    counts: {
      saved: savedCount,
      applied: appliedCount,
      interview: interviewCount,
      offer: offerCount,
      rejected: rejectedCount,
    },
    conversionRates: {
      savedToApplied:
        savedCount > 0 ? Number(((appliedCount / savedCount) * 100).toFixed(1)) : 0,
      appliedToInterview:
        appliedCount > 0 ? Number(((interviewCount / appliedCount) * 100).toFixed(1)) : 0,
      interviewToOffer:
        interviewCount > 0 ? Number(((offerCount / interviewCount) * 100).toFixed(1)) : 0,
      overallConversion:
        totalApplications > 0
          ? Number(((offerCount / totalApplications) * 100).toFixed(1))
          : 0,
    },
  };

  // 3. Applications per week
  const appsPerWeekAgg = await Application.aggregate([
    { $match: { userId: userObjId } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          week: { $week: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.week": 1 } },
  ]);

  const applicationsPerWeek = appsPerWeekAgg.map((item) => ({
    week: `${item._id.year}-W${String(item._id.week).padStart(2, "0")}`,
    count: item.count,
  }));

  // 4. Average match score of applied jobs
  const appliedApps = await Application.find({
    userId: userObjId,
    status: { $in: ["applied", "interview", "offer", "rejected"] },
  })
    .select("jobId")
    .lean();

  const appliedJobIds = appliedApps.map((a) => a.jobId);
  const appliedMatches = await Match.find({
    userId: userObjId,
    jobId: { $in: appliedJobIds },
  })
    .select("score")
    .lean();

  const averageMatchScore =
    appliedMatches.length > 0
      ? Number(
          (
            appliedMatches.reduce((acc, m) => acc + m.score, 0) / appliedMatches.length
          ).toFixed(1),
        )
      : 0;

  // 5. Top missing skills across user matches
  const missingSkillsAgg = await Match.aggregate([
    { $match: { userId: userObjId } },
    { $unwind: "$missingSkills" },
    {
      $group: {
        _id: "$missingSkills",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const topMissingSkills = missingSkillsAgg.map((item) => ({
    skill: item._id,
    count: item.count,
  }));

  // 6. LLM usage and cost per day for current user
  const llmUsageAgg = await LlmRun.aggregate([
    { $match: { userId: userObjId } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        runsCount: { $sum: 1 },
        totalCostUsd: { $sum: "$costUsd" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const llmUsage = llmUsageAgg.map((item) => ({
    date: item._id,
    runsCount: item.runsCount,
    totalCostUsd: Number(item.totalCostUsd.toFixed(4)),
  }));

  res.status(200).json({
    data: {
      totals: {
        applications: totalApplications,
        matches: totalMatches,
        resumes: totalResumes,
      },
      funnel,
      applicationsPerWeek,
      averageMatchScore,
      topMissingSkills,
      llmUsage,
    },
  });
}
