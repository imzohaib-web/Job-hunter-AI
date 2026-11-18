import { type Document, Schema, model, type Types } from "mongoose";

export interface IJob {
  source: string;
  externalId: string;
  hash: string;
  title: string;
  company: string;
  location: string;
  locationBadge?: string;
  duplicateLocations?: string[];
  remote: boolean;
  salary?: Record<string, unknown> | string | null;
  description: string;
  skills: string[];
  url: string;
  postedAt: Date;
  embedding: number[];
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobDocument extends IJob, Document<Types.ObjectId> {}

const jobSchema = new Schema<JobDocument>(
  {
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    hash: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, required: true },
    locationBadge: { type: String, default: null },
    duplicateLocations: { type: [String], default: [] },
    remote: { type: Boolean, default: false },
    salary: { type: Schema.Types.Mixed, default: null },
    description: { type: String, required: true },
    skills: { type: [String], default: [] },
    url: { type: String, required: true },
    postedAt: { type: Date, required: true, index: true },
    embedding: { type: [Number], default: [] },
    isDemo: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

jobSchema.index({ source: 1, externalId: 1 });
jobSchema.index({ createdAt: -1 });

export const Job = model<JobDocument>("Job", jobSchema);
