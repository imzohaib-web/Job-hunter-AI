import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Application } from "../models/Application.js";
import { Job } from "../models/Job.js";
import { AppError } from "../types/errors.js";

export async function getJob(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid job id");
  }

  const job = await Job.findById(id).lean();
  if (!job) {
    throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  }

  res.status(200).json({ data: job });
}

export async function saveJob(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid job id");
  }

  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  }

  let application = await Application.findOne({
    userId: new Types.ObjectId(userId),
    jobId: job._id,
  });

  if (!application) {
    application = await Application.create({
      userId: new Types.ObjectId(userId),
      jobId: job._id,
      status: "saved",
      statusHistory: [
        {
          status: "saved",
          changedAt: new Date(),
          note: "Job saved from search results",
        },
      ],
      order: 0,
    });
  } else if (application.status !== "saved") {
    // If it was already applied or in another stage, keep it, but if user expressly saved, record history
    application.statusHistory.push({
      status: "saved",
      changedAt: new Date(),
      note: "Job re-saved by user",
    });
    application.status = "saved";
    await application.save();
  }

  res.status(200).json({ data: application });
}

export async function unsaveJob(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid job id");
  }

  const result = await Application.findOneAndDelete({
    userId: new Types.ObjectId(userId),
    jobId: new Types.ObjectId(id),
    status: "saved",
  });

  if (!result) {
    throw new AppError(
      404,
      "APPLICATION_NOT_FOUND",
      "Saved job not found or application has progressed",
    );
  }

  res.status(200).json({ ok: true, message: "Job unsaved successfully" });
}
