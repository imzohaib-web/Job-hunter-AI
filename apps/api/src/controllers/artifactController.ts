import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Artifact } from "../models/Artifact.js";
import type {
  ApproveChangesInput,
  ExportArtifactQuery,
} from "../schemas/artifactSchemas.js";
import { aiClient } from "../services/aiClient.js";
import { AppError } from "../types/errors.js";

interface ExperienceItem {
  bullets?: string[];
  [key: string]: unknown;
}

interface ResumeSections {
  summary?: string;
  experience?: ExperienceItem[];
  [key: string]: unknown;
}

interface TailoredResumeContent {
  sections?: ResumeSections;
  changes?: Array<{
    id?: string;
    section: string;
    before: string;
    after: string;
    reason?: string;
    source_fact_ref?: string;
    approved?: boolean;
  }>;
  [key: string]: unknown;
}

export async function approveChanges(
  req: Request<{ id: string }, unknown, ApproveChangesInput>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid artifact id");
  }

  const artifact = await Artifact.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  });

  if (!artifact) {
    throw new AppError(404, "ARTIFACT_NOT_FOUND", "Artifact not found");
  }

  const content = (artifact.content || {}) as TailoredResumeContent;
  const sections: ResumeSections = content.sections ? { ...content.sections } : {};
  const changes = Array.isArray(content.changes) ? [...content.changes] : [];

  const { approvedChangeIds, decisions } = req.body;

  // Process decisions list
  if (Array.isArray(decisions)) {
    for (const dec of decisions) {
      if (typeof dec.index === "number" && changes[dec.index]) {
        changes[dec.index].approved = dec.accepted;
        applyChangeToSections(sections, changes[dec.index], dec.accepted);
      }
    }
  } else if (Array.isArray(approvedChangeIds)) {
    for (const change of changes) {
      if (change.id && approvedChangeIds.includes(change.id)) {
        change.approved = true;
        applyChangeToSections(sections, change, true);
      }
    }
  }

  content.sections = sections;
  content.changes = changes;

  artifact.content = content;
  artifact.version += 1;
  await artifact.save();

  res.status(200).json({ data: artifact });
}

function applyChangeToSections(
  sections: ResumeSections,
  change: { section: string; before: string; after: string },
  accepted: boolean = true,
): void {
  const targetText = accepted ? change.after : change.before;
  const oldText = accepted ? change.before : change.after;

  if (change.section === "summary") {
    sections.summary = targetText;
  } else if (change.section === "experience" && Array.isArray(sections.experience)) {
    for (const exp of sections.experience) {
      if (Array.isArray(exp.bullets)) {
        const bulletIdx = exp.bullets.indexOf(oldText);
        if (bulletIdx !== -1) {
          exp.bullets[bulletIdx] = targetText;
          break;
        }
      }
    }
  }
}

export async function getArtifacts(
  req: Request<unknown, unknown, unknown, { matchId?: string; type?: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { matchId, type } = req.query;
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
  };

  if (matchId) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new AppError(400, "INVALID_ID", "Invalid match id");
    }
    filter.matchId = new Types.ObjectId(matchId);
  }

  if (type) {
    filter.type = type;
  }

  const artifacts = await Artifact.find(filter).sort({ createdAt: -1 }).lean();
  res.status(200).json({ data: artifacts });
}

export async function getArtifactById(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid artifact id");
  }

  const artifact = await Artifact.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  }).lean();

  if (!artifact) {
    throw new AppError(404, "ARTIFACT_NOT_FOUND", "Artifact not found");
  }

  res.status(200).json({ data: artifact });
}

export async function exportArtifact(
  req: Request<{ id: string }, unknown, unknown, ExportArtifactQuery>,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const { id } = req.params;
  const { format = "docx" } = req.query;

  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, "INVALID_ID", "Invalid artifact id");
  }

  const artifact = await Artifact.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  });

  if (!artifact) {
    throw new AppError(404, "ARTIFACT_NOT_FOUND", "Artifact not found");
  }

  const content = (artifact.content || {}) as TailoredResumeContent;
  const resumeToExport = content.sections || content;

  if (format === "docx") {
    try {
      const exportRes = await aiClient.post(
        "/v1/export-resume-docx",
        {
          resume: resumeToExport,
          target_job_title: "Tailored Role",
        },
        {
          responseType: "arraybuffer",
        },
      );

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="Tailored_Resume.docx"');
      res.status(200).send(Buffer.from(exportRes.data));
    } catch {
      // In case ai-service DOCX export fails, send a fallback response
      throw new AppError(500, "EXPORT_FAILED", "Failed to export resume DOCX");
    }
  } else {
    // PDF or fallback format
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ data: resumeToExport });
  }
}
