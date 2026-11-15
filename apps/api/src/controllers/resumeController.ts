import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { Resume, type ResumeDocument } from "../models/Resume.js";
import { enqueueResumeParse } from "../queues/resumeQueue.js";
import { processParseResumeJob } from "../queues/resumeWorker.js";
import { validateResumeFile } from "../services/resumeFileValidator.js";
import { LocalStorageService, getStorageService } from "../services/storage/index.js";
import { AppError } from "../types/errors.js";
import { logger } from "../utils/logger.js";

/** Helper to enforce verifiedProfile requirement for tailoring. */
export function ensureProfileVerified(resume: ResumeDocument): void {
  if (!resume.verifiedProfile) {
    throw new AppError(
      "CONFLICT",
      "Resume profile has not been verified yet. Please review and verify the profile before tailoring application materials.",
      409,
    );
  }
}

export async function uploadResume(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  if (!req.file) {
    throw new AppError(
      "BAD_REQUEST",
      "No file uploaded. Please upload a PDF or DOCX file.",
      400,
    );
  }

  // 1. Validate magic bytes with file-type (rejects renamed .exe, fake mimes)
  const validation = await validateResumeFile(req.file.buffer, req.file.originalname);

  // 2. Store file via StorageService (outside public path)
  const storage = getStorageService();
  const stored = await storage.upload(
    req.file.buffer,
    req.file.originalname,
    validation.detectedMime,
  );

  // 3. Create Resume document in database
  const resume = await Resume.create({
    userId,
    original: {
      filename: stored.filename,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      size: stored.size,
      uploadedAt: new Date(),
    },
    version: 1,
    status: "processing",
    warnings: [],
    fieldConfidences: {},
  });

  const jobPayload = {
    resumeId: resume._id.toString(),
    userId,
    storageKey: stored.storageKey,
    filename: stored.filename,
    mimeType: stored.mimeType,
  };

  // 4. Enqueue BullMQ job parse-resume (fallback directly in test mode if Redis is down)
  try {
    await enqueueResumeParse(jobPayload);
  } catch (queueErr) {
    if (env.NODE_ENV === "test") {
      logger.info("Test environment: executing resume parser worker synchronously");
      await processParseResumeJob(jobPayload).catch((err) => {
        logger.warn({ err }, "Synchronous test parser failed as expected in test case");
      });
    } else {
      throw queueErr;
    }
  }

  // Reload fresh resume status
  const freshResume = await Resume.findById(resume._id);
  const downloadUrl = await storage.getSignedUrl(stored.storageKey);

  res.status(201).json({
    resume: freshResume ?? resume,
    downloadUrl,
  });
}

export async function listResumes(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const resumes = await Resume.find({ userId }).sort({ createdAt: -1 });
  const storage = getStorageService();

  const data = await Promise.all(
    resumes.map(async (r) => {
      const downloadUrl = await storage.getSignedUrl(r.original.storageKey);
      return {
        ...r.toObject(),
        downloadUrl,
      };
    }),
  );

  res.status(200).json({ resumes: data });
}

export async function getResume(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", 404);
  }

  const storage = getStorageService();
  const downloadUrl = await storage.getSignedUrl(resume.original.storageKey);

  res.status(200).json({
    resume,
    downloadUrl,
  });
}

export async function patchResumeProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", 404);
  }

  // Update verified profile and bump version
  resume.verifiedProfile = req.body;
  resume.version += 1;
  await resume.save();

  res.status(200).json({
    resume,
  });
}

export async function deleteResume(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", 404);
  }

  // Delete underlying file from object storage
  const storage = getStorageService();
  if (resume.original?.storageKey) {
    await storage.delete(resume.original.storageKey);
  }

  await Resume.findByIdAndDelete(resume._id);

  res.status(200).json({
    success: true,
    message: "Resume deleted successfully",
  });
}

export async function downloadResumeFile(req: Request, res: Response): Promise<void> {
  const { key, expires, sig } = req.query as {
    key?: string;
    expires?: string;
    sig?: string;
  };

  if (!key || !expires || !sig) {
    throw new AppError("BAD_REQUEST", "Missing signature or expiration", 400);
  }

  const storage = getStorageService();
  if (storage instanceof LocalStorageService) {
    const isValid = storage.verifySignedUrl(key, parseInt(expires, 10), sig);
    if (!isValid) {
      throw new AppError("UNAUTHORIZED", "Invalid or expired signed URL", 401);
    }
  }

  const buffer = await storage.get(key);
  res.setHeader("Content-Disposition", `inline; filename="${key}"`);
  res.send(buffer);
}

/** Check verification status of resume before tailoring. Returns 409 if not verified. */
export async function verifyResumeForTailoring(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", 404);
  }

  ensureProfileVerified(resume);

  res.status(200).json({
    verified: true,
    verifiedProfile: resume.verifiedProfile,
  });
}
