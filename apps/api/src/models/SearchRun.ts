import { type Document, Schema, model, type Types } from "mongoose";

export interface ISearchRun {
  userId: Types.ObjectId;
  query: string | Record<string, unknown>;
  filters?: Record<string, unknown>;
  perSourceCounts?: Record<string, number>;
  sourceStatuses?: Array<{
    source: string;
    status: string;
    count: number;
    reason?: string | null;
    error?: string | null;
    durationMs?: number;
    localFiltersApplied?: string[];
  }>;
  diagnostics?: Record<string, unknown> | null;
  resultsCount: number;
  status: string;
  error?: string | null;
  errorDetails?: unknown;
  errorStack?: string | null;
  durationMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchRunDocument extends ISearchRun, Document<Types.ObjectId> {}

const searchRunSchema = new Schema<SearchRunDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    query: {
      type: Schema.Types.Mixed,
      required: true,
    },
    filters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    perSourceCounts: {
      type: Schema.Types.Mixed,
      default: {},
    },
    sourceStatuses: {
      type: Schema.Types.Mixed,
      default: [],
    },
    diagnostics: {
      type: Schema.Types.Mixed,
      default: null,
    },
    resultsCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "pending",
    },
    error: {
      type: String,
      default: null,
    },
    errorDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
    errorStack: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

searchRunSchema.index({ userId: 1, createdAt: -1 });

export const SearchRun = model<SearchRunDocument>("SearchRun", searchRunSchema);
