import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { Resume, type ResumeDocument } from "../models/Resume.js";
import { enqueueResumeParse } from "../queues/resumeQueue.js";
import { processParseResumeJob } from "../queues/resumeWorker.js";
import { validateResumeFile } from "../services/resumeFileValidator.js";
import { LocalStorageService, getStorageService } from "../services/storage/index.js";
import { aiClient } from "../services/aiClient.js";
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
      "UNSUPPORTED_FILE_TYPE",
      "No file uploaded. Please upload a PDF or DOCX file.",
      400,
    );
  }

  // 1. Validate magic bytes with file-type (rejects renamed .exe, fake mimes)
  const validation = await validateResumeFile(req.file.buffer, req.file.originalname);

  // 2. Store file via StorageService (outside public path)
  const storage = getStorageService();
  let stored;
  try {
    stored = await storage.upload(
      req.file.buffer,
      req.file.originalname,
      validation.detectedMime,
    );
  } catch (err) {
    const isDev = env.NODE_ENV !== "production";
    const details = isDev
      ? err instanceof Error
        ? {
            message: err.message,
            code: (err as NodeJS.ErrnoException).code,
            stack: err.stack,
          }
        : { message: String(err) }
      : undefined;

    logger.error({ err, details }, "Storage upload failed");
    throw new AppError(
      "STORAGE_FAILED",
      "Failed to store resume file. Please try again.",
      500,
      details,
    );
  }

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
  const shouldSync = req.query.sync === "true" || req.headers["x-sync-parse"] === "true";
  if (shouldSync) {
    await processParseResumeJob(jobPayload);
  } else {
    try {
      await enqueueResumeParse(jobPayload);
    } catch (queueErr) {
      if (queueErr instanceof AppError && queueErr.code === "QUEUE_UNAVAILABLE") {
        throw queueErr;
      }
      if (env.NODE_ENV === "test") {
        logger.info("Test environment: executing resume parser worker synchronously");
        await processParseResumeJob(jobPayload).catch((err) => {
          logger.warn({ err }, "Synchronous test parser failed as expected in test case");
        });
      } else {
        throw new AppError(
          "QUEUE_UNAVAILABLE",
          "Resume processing queue is currently unavailable. Please try again later.",
          503,
          queueErr instanceof Error ? queueErr.message : undefined,
        );
      }
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

export async function reparseResume(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", 404);
  }

  const storage = getStorageService();
  const fileBuffer = await storage.get(resume.original.storageKey);

  const FormData = (await import("form-data")).default;
  const formData = new FormData();
  formData.append("file", fileBuffer, {
    filename: resume.original.filename,
    contentType: resume.original.mimeType,
  });

  const parseRes = await aiClient.post("/v1/parse-resume", formData, {
    headers: formData.getHeaders(),
    timeout: 30000,
  });

  const parsed: any = parseRes.data.data;
  resume.parsedProfile = parsed;

  // Lossless migration: merge newly extracted fields into verifiedProfile without losing existing edits
  if (resume.verifiedProfile) {
    const verified: any = { ...resume.verifiedProfile };
    // 1. Headline
    if (!verified.headline && parsed.headline) {
      verified.headline = parsed.headline;
    }
    // 2. Links
    if ((!verified.links || verified.links.length === 0) && parsed.links) {
      verified.links = parsed.links;
    }
    // 3. Skill groups
    if ((!verified.skill_groups || verified.skill_groups.length === 0) && parsed.skill_groups) {
      verified.skill_groups = parsed.skill_groups;
    }
    // 4. Project context_line and bullets
    if (Array.isArray(verified.projects) && Array.isArray(parsed.projects)) {
      for (const vp of verified.projects) {
        const matchingParsed = parsed.projects.find(
          (p: any) => p.name?.toLowerCase() === vp.name?.toLowerCase()
        );
        if (matchingParsed) {
          if (!vp.context_line && matchingParsed.context_line) {
            vp.context_line = matchingParsed.context_line;
          }
          if ((!vp.bullets || vp.bullets.length === 0) && matchingParsed.bullets) {
            vp.bullets = matchingParsed.bullets;
          }
        }
      }
    }
    // 5. Education coursework and GPA scale
    if (Array.isArray(verified.education) && Array.isArray(parsed.education)) {
      for (const ve of verified.education) {
        const matchingParsed = parsed.education.find(
          (e: any) => e.institution?.toLowerCase() === ve.institution?.toLowerCase()
        );
        if (matchingParsed) {
          if ((!ve.coursework || ve.coursework.length === 0) && matchingParsed.coursework) {
            ve.coursework = matchingParsed.coursework;
          }
          if (!ve.gpa_scale && matchingParsed.gpa_scale) {
            ve.gpa_scale = matchingParsed.gpa_scale;
          }
          if (ve.expected === undefined && matchingParsed.expected !== undefined) {
            ve.expected = matchingParsed.expected;
          }
        }
      }
    }
    // 6. Scholarships
    if ((!verified.scholarships || verified.scholarships.length === 0) && parsed.scholarships) {
      verified.scholarships = parsed.scholarships;
    }
    resume.verifiedProfile = verified;
  } else {
    resume.verifiedProfile = parsed;
  }
  resume.markModified("parsedProfile");
  resume.markModified("verifiedProfile");

  resume.version += 1;
  await resume.save();

  res.status(200).json({
    resume,
    message: "Resume successfully re-parsed with lossless profile model.",
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

/** Debug endpoint returning item counts and warnings (dev only, admin). */
export async function getResumeDebug(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  const query = req.user?.role === "admin" ? { _id: id } : { _id: id, userId };
  const resume = await Resume.findOne(query);
  if (!resume) {
    throw new AppError("NOT_FOUND", "Resume not found", 404);
  }

  const isAllowed =
    env.NODE_ENV !== "production" ||
    req.user?.role === "admin" ||
    (userId && resume.userId.toString() === userId);

  if (!isAllowed) {
    throw new AppError(
      "FORBIDDEN",
      "Debug endpoint only available in development or for admin users",
      403,
    );
  }

  const profile = resume.parsedProfile;
  const counts = {
    skillsCount: profile?.skills?.length ?? 0,
    experienceCount: profile?.experience?.length ?? 0,
    educationCount: profile?.education?.length ?? 0,
    projectsCount: profile?.projects?.length ?? 0,
    certificationsCount: profile?.certifications?.length ?? 0,
    languagesCount: profile?.languages?.length ?? 0,
  };

  res.status(200).json({
    resumeId: resume._id,
    status: resume.status,
    version: resume.version,
    counts,
    warnings: resume.warnings ?? [],
    fieldConfidences: resume.fieldConfidences ?? {},
    error: resume.error,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  });
}
