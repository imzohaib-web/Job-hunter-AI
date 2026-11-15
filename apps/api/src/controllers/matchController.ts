import type { Request, Response } from "express";
import { type FilterQuery, Types } from "mongoose";
import { Job } from "../models/Job.js";
import { type IMatch, Match } from "../models/Match.js";
import type { MatchesQueryParams } from "../schemas/searchSchemas.js";
import { AppError } from "../types/errors.js";

export async function listMatches(
  req: Request<unknown, unknown, unknown, MatchesQueryParams>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { searchId, minScore, remote, sort, page = 1, limit = 10 } = req.query;

  const matchFilter: FilterQuery<IMatch> = {
    userId: new Types.ObjectId(userId),
  };

  if (searchId) {
    matchFilter.searchId = new Types.ObjectId(searchId);
  }

  if (typeof minScore === "number") {
    matchFilter.score = { $gte: minScore };
  }

  // If remote filter is applied, find jobs that match remote status
  if (typeof remote === "boolean") {
    const remoteJobIds = await Job.find({ remote }).select("_id").lean();
    const allowedJobIds = remoteJobIds.map((j) => j._id);
    matchFilter.jobId = { $in: allowedJobIds };
  }

  // Sorting
  let sortOption: Record<string, 1 | -1> = { score: -1 };
  if (sort === "score_asc") sortOption = { score: 1 };
  else if (sort === "date_desc") sortOption = { createdAt: -1 };
  else if (sort === "date_asc") sortOption = { createdAt: 1 };

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Match.countDocuments(matchFilter);

  const matches = await Match.find(matchFilter)
    .sort(sortOption)
    .skip(skip)
    .limit(Number(limit))
    .populate("jobId")
    .lean();

  res.status(200).json({
    data: matches,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    },
  });
}

export async function getMatchById(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid match id");
  }

  const match = await Match.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  })
    .populate("jobId")
    .lean();

  if (!match) {
    throw new AppError(404, "MATCH_NOT_FOUND", "Match not found");
  }

  res.status(200).json({ data: match });
}
