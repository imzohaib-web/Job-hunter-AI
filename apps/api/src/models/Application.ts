import { type Document, Schema, model, type Types } from "mongoose";

export type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  changedAt: Date;
  note?: string;
}

export interface IApplication {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  matchId?: Types.ObjectId;
  status: ApplicationStatus;
  statusHistory: StatusHistoryEntry[];
  notes?: string;
  order: number;
  appliedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationDocument extends IApplication, Document<Types.ObjectId> {}

const statusHistorySchema = new Schema<StatusHistoryEntry>(
  {
    status: {
      type: String,
      enum: ["saved", "applied", "interview", "offer", "rejected"],
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    note: {
      type: String,
      default: "",
    },
  },
  { _id: false },
);

const applicationSchema = new Schema<ApplicationDocument>(
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
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "Match",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["saved", "applied", "interview", "offer", "rejected"],
      default: "saved",
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: () => [
        {
          status: "saved",
          changedAt: new Date(),
        },
      ],
    },
    notes: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

applicationSchema.index({ userId: 1, createdAt: -1 });
applicationSchema.index({ userId: 1, status: 1, order: 1 });
applicationSchema.index({ userId: 1, jobId: 1 });

export const Application = model<ApplicationDocument>("Application", applicationSchema);
