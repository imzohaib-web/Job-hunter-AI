import { type Document, Schema, model, type Types } from "mongoose";

export interface LlmTokensUsage {
  prompt?: number;
  completion?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ILlmRun {
  task: string;
  provider: string;
  model: string;
  tokens: LlmTokensUsage | number;
  latencyMs: number;
  costUsd: number;
  userId?: Types.ObjectId | null;
  success: boolean;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type LlmRunDocument = Document<Types.ObjectId> & Omit<ILlmRun, "_id">;

const llmRunSchema = new Schema<ILlmRun>(
  {
    task: { type: String, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    tokens: { type: Schema.Types.Mixed, required: true },
    latencyMs: { type: Number, required: true },
    costUsd: { type: Number, required: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    success: { type: Boolean, required: true },
    error: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

llmRunSchema.index({ userId: 1, createdAt: -1 });
llmRunSchema.index({ createdAt: -1 });

export const LlmRun = model<ILlmRun>("LlmRun", llmRunSchema);
