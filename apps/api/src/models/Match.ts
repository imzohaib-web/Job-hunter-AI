import { type Document, Schema, model, type Types } from "mongoose";

export interface MatchBreakdown {
  skillsScore?: number;
  experienceScore?: number;
  educationScore?: number;
  semanticScore?: number;
  reasoning?: string;
  [key: string]: unknown;
}

export interface IMatch {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  searchId?: Types.ObjectId;
  score: number;
  breakdown: MatchBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
  hardFilterFailed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchDocument extends IMatch, Document<Types.ObjectId> {}

const matchSchema = new Schema<MatchDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    searchId: {
      type: Schema.Types.ObjectId,
      ref: "SearchRun",
      default: null,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    breakdown: {
      type: Schema.Types.Mixed,
      default: {},
    },
    matchedSkills: {
      type: [String],
      default: [],
    },
    missingSkills: {
      type: [String],
      default: [],
    },
    explanation: {
      type: String,
      default: "",
    },
    hardFilterFailed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique on userId + jobId
matchSchema.index({ userId: 1, jobId: 1 }, { unique: true });
matchSchema.index({ userId: 1, createdAt: -1 });
matchSchema.index({ userId: 1, score: -1 });
matchSchema.index({ searchId: 1, score: -1 });

export const Match = model<MatchDocument>("Match", matchSchema);
