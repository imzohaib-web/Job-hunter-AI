import { type Document, Schema, model, type Types } from "mongoose";

export type ArtifactType =
  "tailored_resume" | "cover_letter" | "interview_pack" | "company_insight";

export interface IArtifact {
  userId: Types.ObjectId;
  matchId: Types.ObjectId;
  type: ArtifactType;
  content: Record<string, unknown> | string;
  fabricationReport?: Record<string, unknown> | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArtifactDocument extends IArtifact, Document<Types.ObjectId> {}

const artifactSchema = new Schema<ArtifactDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["tailored_resume", "cover_letter", "interview_pack", "company_insight"],
      required: true,
      index: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    fabricationReport: {
      type: Schema.Types.Mixed,
      default: null,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  },
);

artifactSchema.index({ userId: 1, createdAt: -1 });
artifactSchema.index({ userId: 1, matchId: 1, type: 1 });

export const Artifact = model<ArtifactDocument>("Artifact", artifactSchema);
