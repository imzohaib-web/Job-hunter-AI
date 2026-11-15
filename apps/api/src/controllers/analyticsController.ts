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

  // 4b. Average match score by status
  const allUserApps = await Application.find({ userId: userObjId })
    .select("status jobId matchId")
    .lean();
  const allUserMatches = await Match.find({ userId: userObjId })
    .select("jobId score")
    .lean();

  const matchScoreByJobId = new Map(allUserMatches.map((m) => [m.jobId.toString(), m.score]));
  const statuses = ["saved", "applied", "interview", "offer", "rejected"] as const;
  const averageMatchScoreByStatus = statuses.map((st) => {
    const appsInStatus = allUserApps.filter((a) => a.status === st);
    const scores: number[] = [];
    for (const app of appsInStatus) {
      const jId = app.jobId?.toString();
      if (jId && matchScoreByJobId.has(jId)) {
        scores.push(matchScoreByJobId.get(jId)!);
      }
    }
    const avg =
      scores.length > 0
        ? Number((scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1))
        : 0;
    return {
      status: st,
      averageScore: avg,
      count: appsInStatus.length,
    };
  });

  // 5. Top missing skills across user matches with actionable project suggestions
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

  const skillSuggestions: Record<string, string> = {
    docker: "Consider a project containerizing a full-stack app with Docker & Compose",
    kubernetes: "Deploy a microservice cluster using Minikube or Helm charts",
    aws: "Build and deploy a serverless API using AWS Lambda and DynamoDB",
    graphql: "Design and implement a GraphQL schema and resolver with Apollo Server",
    typescript: "Migrate an existing JavaScript codebase to strict TypeScript",
    react: "Build a responsive dashboard using React, modern hooks, and TanStack Query",
    python: "Develop an asynchronous REST microservice using FastAPI",
    redis: "Implement distributed caching or Pub/Sub messaging using Redis",
    postgresql: "Design an optimized relational schema with indexing and migration tooling",
    "ci/cd": "Set up automated test and deployment pipelines with GitHub Actions",
    terraform: "Define reproducible cloud infrastructure using Terraform modules",
    gcp: "Deploy containerized services using Google Cloud Run and Cloud Build",
  };

  const topMissingSkills = missingSkillsAgg.map((item) => {
    const skill = String(item._id);
    const lower = skill.toLowerCase();
    const matchedKey = Object.keys(skillSuggestions).find(
      (k) => lower.includes(k) || k.includes(lower),
    );
    const suggestion = matchedKey
      ? skillSuggestions[matchedKey]
      : `Consider a project utilizing ${skill} to strengthen your profile`;
    return {
      skill,
      count: item.count,
      suggestion,
    };
  });

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
      averageMatchScoreByStatus,
      topMissingSkills,
      llmUsage,
    },
  });
}
