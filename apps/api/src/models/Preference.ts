import { type Document, Schema, model, type Types } from "mongoose";
import type { JobPreferences, SearchPreset } from "@jobpilot/shared";

export const DEFAULT_PREFERENCES: JobPreferences = {
  targetTitles: [],
  employmentTypes: ["full-time"],
  experienceLevels: ["mid", "senior"],
  workModes: ["remote", "hybrid"],
  locations: [],
  openToRelocation: false,
  remoteWorldwide: false,
  visaSponsorshipNeeded: false,
  preferredCountries: [],
  salary: {
    currency: "USD",
    period: "yearly",
    hideWithoutSalary: false,
  },
  mustHaveSkills: [],
  niceToHaveSkills: [],
  industries: [],
  companySizes: [],
  datePosted: "all",
  excludedKeywords: [],
  excludedCompanies: [],
  roleFamilies: ["software"],
  alsoShowOtherRoles: true,
  sources: ["remotive", "arbeitnow"],
};

export interface IPreference {
  userId: Types.ObjectId;
  preferences: JobPreferences;
  presets: SearchPreset[];
  activePresetId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreferenceDocument extends IPreference, Document<Types.ObjectId> {}

const searchPresetSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    preferences: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false },
);

const preferenceSchema = new Schema<PreferenceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    preferences: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_PREFERENCES }),
    },
    presets: {
      type: [searchPresetSchema],
      default: [],
    },
    activePresetId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const Preference = model<PreferenceDocument>("Preference", preferenceSchema);
