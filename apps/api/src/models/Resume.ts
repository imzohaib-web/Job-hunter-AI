import { type Document, Schema, model, type Types } from "mongoose";
import type { ParsedProfile } from "@jobpilot/shared";

export type ResumeStatus = "uploading" | "processing" | "ready" | "failed";

export interface OriginalFileRef {
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

export interface IResume {
  userId: Types.ObjectId;
  original: OriginalFileRef;
  parsedProfile?: ParsedProfile | null;
  verifiedProfile?: ParsedProfile | null;
  version: number;
  status: ResumeStatus;
  warnings?: string[];
  fieldConfidences?: Record<string, number>;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResumeDocument extends IResume, Document<Types.ObjectId> {}

const originalFileRefSchema = new Schema<OriginalFileRef>(
  {
    filename: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const resumeSchema = new Schema<ResumeDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    original: {
      type: originalFileRefSchema,
      required: true,
    },
    parsedProfile: {
      type: Schema.Types.Mixed,
      default: null,
    },
    verifiedProfile: {
      type: Schema.Types.Mixed,
      default: null,
    },
    version: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["uploading", "processing", "ready", "failed"],
      default: "uploading",
      index: true,
    },
    warnings: {
      type: [String],
      default: [],
    },
    fieldConfidences: {
      type: Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

resumeSchema.index({ userId: 1, createdAt: -1 });

export const Resume = model<ResumeDocument>("Resume", resumeSchema);
