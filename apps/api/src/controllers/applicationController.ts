import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Application, type ApplicationStatus } from "../models/Application.js";
import { Match } from "../models/Match.js";
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "../schemas/applicationSchemas.js";
import { AppError } from "../types/errors.js";

export async function createApplication(
  req: Request<unknown, unknown, CreateApplicationInput>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { matchId, jobId, notes } = req.body;
  let targetJobId: Types.ObjectId;
  let targetMatchId: Types.ObjectId | undefined;

  if (matchId) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new AppError(400, "INVALID_ID", "Invalid matchId");
    }
    const match = await Match.findOne({
      _id: matchId,
      userId: new Types.ObjectId(userId),
    });
    if (!match) {
      throw new AppError(404, "MATCH_NOT_FOUND", "Match not found");
    }
    targetJobId = match.jobId;
    targetMatchId = match._id;
  } else if (jobId) {
    if (!Types.ObjectId.isValid(jobId)) {
      throw new AppError(400, "INVALID_ID", "Invalid jobId");
    }
    targetJobId = new Types.ObjectId(jobId);
  } else {
    throw new AppError(400, "VALIDATION_ERROR", "Either matchId or jobId is required");
  }

  let application = await Application.findOne({
    userId: new Types.ObjectId(userId),
    jobId: targetJobId,
  });

  if (!application) {
    // Find highest order in "saved" column to place at the end
    const lastApp = await Application.findOne({
      userId: new Types.ObjectId(userId),
      status: "saved",
    })
      .sort({ order: -1 })
      .select("order")
      .lean();

    const nextOrder = lastApp ? (lastApp.order || 0) + 1 : 0;

    application = await Application.create({
      userId: new Types.ObjectId(userId),
      jobId: targetJobId,
      matchId: targetMatchId,
      status: "saved",
      statusHistory: [
        {
          status: "saved",
          changedAt: new Date(),
          note: notes || "Application created",
        },
      ],
      notes: notes || "",
      order: nextOrder,
    });
  }

  res.status(201).json({ data: application });
}

export async function listApplications(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const applications = await Application.find({
    userId: new Types.ObjectId(userId),
  })
    .sort({ order: 1, updatedAt: -1 })
    .populate("jobId")
    .populate("matchId")
    .lean();

  // If matchId was not saved on application, backfill from Match collection
  const appsNeedingMatch = applications.filter((app) => !app.matchId && app.jobId);
  if (appsNeedingMatch.length > 0) {
    const getJobIdString = (job: unknown): string => {
      if (!job) return "";
      if (typeof job === "object" && job !== null && "_id" in job) {
        return String((job as { _id: unknown })._id);
      }
      return String(job);
    };

    const jobIds = appsNeedingMatch
      .map((a) => {
        const idStr = getJobIdString(a.jobId);
        return Types.ObjectId.isValid(idStr) ? new Types.ObjectId(idStr) : null;
      })
      .filter((id): id is Types.ObjectId => id !== null);

    if (jobIds.length > 0) {
      const matches = await Match.find({
        userId: new Types.ObjectId(userId),
        jobId: { $in: jobIds },
      }).lean();

      const matchMap = new Map(matches.map((m) => [m.jobId.toString(), m]));
      for (const app of appsNeedingMatch) {
        const jId = getJobIdString(app.jobId);
        if (matchMap.has(jId)) {
          (app as Record<string, unknown>).matchId = matchMap.get(jId);
        }
      }
    }
  }

  const grouped: Record<ApplicationStatus, typeof applications> = {
    saved: [],
    applied: [],
    interview: [],
    offer: [],
    rejected: [],
  };

  for (const app of applications) {
    const status = app.status as ApplicationStatus;
    if (grouped[status]) {
      grouped[status].push(app);
    } else {
      grouped.saved.push(app);
    }
  }

  res.status(200).json({ data: grouped });
}

export async function updateApplication(
  req: Request<{ id: string }, unknown, UpdateApplicationInput>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid application id");
  }

  const application = await Application.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  });

  if (!application) {
    throw new AppError(404, "APPLICATION_NOT_FOUND", "Application not found");
  }

  const { status, notes, order, note, appliedAt } = req.body;

  if (status && status !== application.status) {
    application.statusHistory.push({
      status,
      changedAt: new Date(),
      note: note || `Status transitioned to ${status}`,
    });
    application.status = status;

    if (status === "applied" && !application.appliedAt) {
      application.appliedAt = new Date();
    }
  }

  if (appliedAt !== undefined) {
    application.appliedAt = appliedAt ? new Date(appliedAt) : null;
  }

  if (typeof notes === "string") {
    application.notes = notes;
  }

  if (typeof order === "number") {
    application.order = order;
  }

  await application.save();

  res.status(200).json({ data: application });
}

export async function deleteApplication(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid application id");
  }

  const deleted = await Application.findOneAndDelete({
    _id: id,
    userId: new Types.ObjectId(userId),
  });

  if (!deleted) {
    throw new AppError(404, "APPLICATION_NOT_FOUND", "Application not found");
  }

  res.status(200).json({ ok: true, message: "Application deleted successfully" });
}
