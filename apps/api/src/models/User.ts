import { type Document, Schema, model, type Types } from "mongoose";

export interface UserQuotaCounters {
  dailyAiRequests: number;
  lastResetDate: string; // YYYY-MM-DD
  dailyLimit: number;
}

export interface IUser {
  email: string;
  passwordHash: string;
  name: string;
  role: "user" | "admin";
  quota: UserQuotaCounters;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument extends IUser, Document<Types.ObjectId> {}

const userQuotaSchema = new Schema<UserQuotaCounters>(
  {
    dailyAiRequests: { type: Number, default: 0 },
    lastResetDate: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10),
    },
    dailyLimit: { type: Number, default: 50 },
  },
  { _id: false },
);

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    quota: {
      type: userQuotaSchema,
      default: () => ({
        dailyAiRequests: 0,
        lastResetDate: new Date().toISOString().slice(0, 10),
        dailyLimit: 50,
      }),
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ createdAt: -1 });

export const User = model<UserDocument>("User", userSchema);
