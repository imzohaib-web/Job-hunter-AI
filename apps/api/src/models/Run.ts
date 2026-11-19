import { type Document, Schema, model, type Types } from "mongoose";

export interface NodeStatusRecord {
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMs?: number;
  message?: string;
  error?: string;
}

export interface IRun {
  runId: string;
  userId: Types.ObjectId;
  matchId?: Types.ObjectId | null;
  jobId?: Types.ObjectId | null;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  nodeStatus: {
    company_research?: NodeStatusRecord;
    tailor_resume?: NodeStatusRecord;
    fabrication_check?: NodeStatusRecord;
    [node: string]: NodeStatusRecord | undefined;
  };
  events: Array<{
    node?: string;
    status?: string;
    message?: string;
    timestamp: Date;
  }>;
  inputs?: Record<string, unknown>;
  profileVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunDocument extends IRun, Document<Types.ObjectId> {}

const nodeStatusRecordSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["pending", "running", "completed", "skipped", "failed"],
      default: "pending",
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    message: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: false },
);

const runSchema = new Schema<RunDocument>(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "Match",
      default: null,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    nodeStatus: {
      type: Map,
      of: nodeStatusRecordSchema,
      default: () => ({
        company_research: { status: "pending" },
        tailor_resume: { status: "pending" },
        fabrication_check: { status: "pending" },
      }),
    },
    events: [
      {
        node: String,
        status: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    inputs: {
      type: Schema.Types.Mixed,
      default: null,
    },
    profileVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  },
);

runSchema.index({ userId: 1, createdAt: -1 });

export const Run = model<RunDocument>("Run", runSchema);
