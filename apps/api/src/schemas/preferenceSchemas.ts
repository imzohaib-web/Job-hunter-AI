import { z } from "zod";

export const preferenceLocationSchema = z.object({
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  label: z.string().trim().optional(),
});

export const preferenceSalarySchema = z.object({
  currency: z.string().trim().default("USD"),
  minimum: z.coerce.number().min(0).optional(),
  period: z.enum(["monthly", "yearly"]).default("yearly"),
  hideWithoutSalary: z.boolean().default(false),
});

export const jobPreferencesSchema = z.object({
  targetTitles: z.array(z.string().trim()).default([]),
  employmentTypes: z
    .array(z.enum(["full-time", "part-time", "contract", "internship", "freelance"]))
    .default([]),
  experienceLevels: z
    .array(z.enum(["internship", "entry", "mid", "senior", "lead"]))
    .default([]),
  workModes: z.array(z.enum(["remote", "hybrid", "on-site"])).default([]),
  locations: z.array(preferenceLocationSchema).default([]),
  openToRelocation: z.boolean().default(false),
  remoteWorldwide: z.boolean().default(false),
  visaSponsorshipNeeded: z.boolean().default(false),
  preferredCountries: z.array(z.string().trim()).default([]),
  salary: preferenceSalarySchema.default({
    currency: "USD",
    period: "yearly",
    hideWithoutSalary: false,
  }),
  mustHaveSkills: z.array(z.string().trim()).default([]),
  niceToHaveSkills: z.array(z.string().trim()).default([]),
  industries: z.array(z.string().trim()).default([]),
  companySizes: z.array(z.enum(["startup", "mid", "large"])).default([]),
  datePosted: z.enum(["24h", "3d", "7d", "30d", "all"]).default("all"),
  excludedKeywords: z.array(z.string().trim()).default([]),
  excludedCompanies: z.array(z.string().trim()).default([]),
  roleFamilies: z.array(z.string().trim()).default([]),
  alsoShowOtherRoles: z.boolean().default(true),
  sources: z.array(z.string().trim()).default([]),
  // Legacy compatibility fields
  roles: z.array(z.string().trim()).optional(),
  remoteOnly: z.boolean().optional(),
  seniority: z.string().trim().optional(),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
});

export type JobPreferencesInput = z.infer<typeof jobPreferencesSchema>;

export const updatePreferencesSchema = z.object({
  preferences: jobPreferencesSchema,
  activePresetId: z.string().nullable().optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const savePresetSchema = z.object({
  name: z.string().trim().min(1, "Preset name is required").max(60),
  preferences: jobPreferencesSchema,
});

export type SavePresetInput = z.infer<typeof savePresetSchema>;
