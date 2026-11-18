import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Bookmark,
  Briefcase,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type {
  CompanySize,
  DatePostedFilter,
  EmploymentType,
  ExperienceLevel,
  JobPreferences,
  ParsedProfile,
  SalaryPeriod,
  SearchPreset,
  SourceAvailabilityInfo,
  WorkMode,
} from "@jobpilot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const clientPreferencesSchema = z.object({
  targetTitles: z.array(z.string().trim()).default([]),
  employmentTypes: z
    .array(z.enum(["full-time", "part-time", "contract", "internship", "freelance"]))
    .default(["full-time"]),
  experienceLevels: z
    .array(z.enum(["internship", "entry", "mid", "senior", "lead"]))
    .default(["mid", "senior"]),
  workModes: z.array(z.enum(["remote", "hybrid", "on-site"])).default(["remote", "hybrid"]),
  locations: z
    .array(
      z.object({
        country: z.string().trim().optional(),
        city: z.string().trim().optional(),
        label: z.string().trim().optional(),
      }),
    )
    .default([]),
  openToRelocation: z.boolean().default(false),
  remoteWorldwide: z.boolean().default(false),
  visaSponsorshipNeeded: z.boolean().default(false),
  preferredCountries: z.array(z.string().trim()).default([]),
  salary: z
    .object({
      currency: z.string().trim().default("USD"),
      minimum: z.coerce.number().min(0, "Minimum salary cannot be negative").optional(),
      period: z.enum(["monthly", "yearly"]).default("yearly"),
      hideWithoutSalary: z.boolean().default(false),
    })
    .default({
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
  roleFamilies: z.array(z.string().trim()).default(["software"]),
  alsoShowOtherRoles: z.boolean().default(true),
  sources: z
    .array(z.string().trim())
    .default([
      "remotive",
      "arbeitnow",
      "remoteok",
      "jobicy",
      "himalayas",
      "weworkremotely",
      "greenhouse",
      "lever",
      "jsearch",
      "adzuna",
    ]),
});

export type FormPreferences = z.infer<typeof clientPreferencesSchema>;

export const DEFAULT_FORM_PREFERENCES: FormPreferences = {
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
  sources: [
    "remotive",
    "arbeitnow",
    "remoteok",
    "jobicy",
    "himalayas",
    "weworkremotely",
    "greenhouse",
    "lever",
    "jsearch",
    "adzuna",
  ],
};

export const COMMON_INDUSTRIES = [
  "AI / Machine Learning",
  "Fintech",
  "Healthtech",
  "SaaS",
  "E-commerce",
  "Edtech",
  "Cybersecurity",
  "Cloud & DevOps",
  "Web3 / Blockchain",
  "Consumer Tech",
];

export const COMMON_ROLE_FAMILIES = [
  { id: "software", label: "Software Engineering" },
  { id: "data", label: "Data & AI / ML" },
  { id: "devops", label: "DevOps / Infrastructure" },
  { id: "product", label: "Product Management" },
  { id: "design", label: "Product & UI/UX Design" },
  { id: "qa", label: "QA & Testing" },
];

export const EMPLOYMENT_TYPE_OPTIONS: Array<{ id: EmploymentType; label: string }> = [
  { id: "full-time", label: "Full-time" },
  { id: "part-time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "freelance", label: "Freelance" },
];

export const EXPERIENCE_LEVEL_OPTIONS: Array<{ id: ExperienceLevel; label: string }> = [
  { id: "internship", label: "Internship" },
  { id: "entry", label: "Entry / Junior (0-2y)" },
  { id: "mid", label: "Mid-level (3-5y)" },
  { id: "senior", label: "Senior (5-8y)" },
  { id: "lead", label: "Lead / Staff (8y+)" },
];

export const WORK_MODE_OPTIONS: Array<{ id: WorkMode; label: string }> = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "on-site", label: "On-site" },
];

export const COMPANY_SIZE_OPTIONS: Array<{ id: CompanySize; label: string; desc: string }> = [
  { id: "startup", label: "Startup", desc: "1-50 employees" },
  { id: "mid", label: "Mid-size", desc: "51-500 employees" },
  { id: "large", label: "Enterprise", desc: "500+ employees" },
];

export const DATE_POSTED_OPTIONS: Array<{ id: DatePostedFilter; label: string }> = [
  { id: "24h", label: "Last 24 hours" },
  { id: "3d", label: "Past 3 days" },
  { id: "7d", label: "Past 7 days" },
  { id: "30d", label: "Past 30 days" },
  { id: "all", label: "Anytime" },
];

export function inferExperienceLevels(profile?: ParsedProfile | null): ExperienceLevel[] {
  if (!profile?.experience || profile.experience.length === 0) {
    return ["mid", "senior"];
  }

  // Calculate approximate years from experiences
  let totalMonths = 0;
  for (const exp of profile.experience) {
    if (!exp.start) continue;
    const startYear = parseInt(exp.start.match(/\d{4}/)?.[0] || "0", 10);
    const endStr = exp.end;
    const endYear =
      endStr && endStr.toLowerCase() !== "present"
        ? parseInt(endStr.match(/\d{4}/)?.[0] || String(new Date().getFullYear()), 10)
        : new Date().getFullYear();

    if (startYear > 1980 && endYear >= startYear) {
      totalMonths += Math.max(1, (endYear - startYear) * 12);
    }
  }

  const years = totalMonths / 12;
  if (years < 1) return ["internship", "entry"];
  if (years <= 3) return ["entry", "mid"];
  if (years <= 6) return ["mid", "senior"];
  return ["senior", "lead"];
}

export interface JobPreferencesFormProps {
  initialPreferences?: Partial<JobPreferences> | null;
  profile?: ParsedProfile | null;
  presets?: SearchPreset[];
  activePresetId?: string | null;
  availableSources?: SourceAvailabilityInfo[];
  isSaving?: boolean;
  isSearching?: boolean;
  onSave?: (prefs: FormPreferences) => Promise<void> | void;
  onSaveAndFindJobs?: (prefs: FormPreferences) => Promise<void> | void;
  onSavePreset?: (name: string, prefs: FormPreferences) => Promise<void> | void;
  onDeletePreset?: (presetId: string) => Promise<void> | void;
  onApplyPreset?: (preset: SearchPreset) => void;
  onReset?: () => void;
}

export function JobPreferencesForm({
  initialPreferences,
  profile,
  presets = [],
  activePresetId = null,
  availableSources = [
    { source: "remotive", name: "Remotive", available: true, supportedFilters: ["category", "search"] },
    { source: "arbeitnow", name: "Arbeitnow", available: true, supportedFilters: [] },
    { source: "remoteok", name: "RemoteOK", available: true, supportedFilters: ["category", "tags"] },
    { source: "jobicy", name: "Jobicy", available: true, supportedFilters: ["industry", "count"] },
    { source: "himalayas", name: "Himalayas", available: true, supportedFilters: ["keywords"] },
    { source: "weworkremotely", name: "We Work Remotely", available: true, supportedFilters: ["feed"] },
    {
      source: "adzuna",
      name: "Adzuna",
      available: false,
      reason: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY",
      supportedFilters: ["what", "where", "salary_min", "contract_type", "max_days_old"],
    },
    { source: "greenhouse", name: "Greenhouse", available: true, supportedFilters: [] },
    { source: "lever", name: "Lever", available: true, supportedFilters: [] },
    {
      source: "jsearch",
      name: "JSearch",
      available: false,
      reason: "Missing RAPIDAPI_KEY",
      supportedFilters: ["query", "page", "num_pages"],
    },
  ],
  isSaving = false,
  isSearching = false,
  onSave,
  onSaveAndFindJobs,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
  onReset,
}: JobPreferencesFormProps) {
  // Collapsible section states (all open by default for clear discovery)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    role: true,
    location: true,
    compensation: true,
    skills: true,
    advanced: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Preset saving state
  const [presetNameInput, setPresetNameInput] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  // Form input helper states for adding chips
  const [titleInput, setTitleInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [preferredCountryInput, setPreferredCountryInput] = useState("");
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [niceToHaveInput, setNiceToHaveInput] = useState("");
  const [industryInput, setIndustryInput] = useState("");
  const [excludedKeywordInput, setExcludedKeywordInput] = useState("");
  const [excludedCompanyInput, setExcludedCompanyInput] = useState("");

  // Inferred defaults from profile
  const inferredExperienceLevels = useMemo(() => inferExperienceLevels(profile), [profile]);

  const profileSuggestedTitles = useMemo(() => {
    const titles = new Set<string>();
    profile?.experience?.forEach((exp) => {
      if (exp.title) titles.add(exp.title);
    });
    return Array.from(titles);
  }, [profile]);

  const profileSuggestedSkills = useMemo(() => {
    if (!profile?.skills) return [];
    return profile.skills
      .map((s) => s.name)
      .filter((s): s is string => Boolean(s));
  }, [profile]);

  // Compute merged initial values
  const defaultValues = useMemo<FormPreferences>(() => {
    return {
      targetTitles:
        initialPreferences?.targetTitles?.length
          ? initialPreferences.targetTitles
          : profileSuggestedTitles.slice(0, 3),
      employmentTypes: initialPreferences?.employmentTypes?.length
        ? initialPreferences.employmentTypes
        : ["full-time"],
      experienceLevels: initialPreferences?.experienceLevels?.length
        ? initialPreferences.experienceLevels
        : inferredExperienceLevels,
      workModes: initialPreferences?.workModes?.length
        ? initialPreferences.workModes
        : ["remote", "hybrid"],
      locations:
        initialPreferences?.locations?.length
          ? initialPreferences.locations
          : profile?.location
            ? [{ country: "", city: profile.location, label: profile.location }]
            : [],
      openToRelocation: initialPreferences?.openToRelocation ?? false,
      remoteWorldwide: initialPreferences?.remoteWorldwide ?? false,
      visaSponsorshipNeeded: initialPreferences?.visaSponsorshipNeeded ?? false,
      preferredCountries: initialPreferences?.preferredCountries || [],
      salary: {
        currency: initialPreferences?.salary?.currency || "USD",
        minimum: initialPreferences?.salary?.minimum,
        period: initialPreferences?.salary?.period || "yearly",
        hideWithoutSalary: initialPreferences?.salary?.hideWithoutSalary ?? false,
      },
      mustHaveSkills:
        initialPreferences?.mustHaveSkills?.length
          ? initialPreferences.mustHaveSkills
          : profileSuggestedSkills.slice(0, 4),
      niceToHaveSkills: initialPreferences?.niceToHaveSkills || [],
      industries: initialPreferences?.industries || [],
      companySizes: initialPreferences?.companySizes || [],
      datePosted: initialPreferences?.datePosted || "all",
      excludedKeywords: initialPreferences?.excludedKeywords || [],
      excludedCompanies: initialPreferences?.excludedCompanies || [],
      roleFamilies: initialPreferences?.roleFamilies?.length
        ? initialPreferences.roleFamilies
        : ["software"],
      alsoShowOtherRoles: initialPreferences?.alsoShowOtherRoles ?? true,
      sources:
        initialPreferences?.sources?.length
          ? initialPreferences.sources
          : ["remotive", "arbeitnow"],
    };
  }, [initialPreferences, profileSuggestedTitles, inferredExperienceLevels, profile, profileSuggestedSkills]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormPreferences>({
    resolver: zodResolver(clientPreferencesSchema) as any,
    defaultValues,
  });

  // Watch form values for live summary line
  const watchedValues = watch();

  // Reset form when external preferences change
  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  // Live summary line generation
  const liveSummary = useMemo(() => {
    const parts: string[] = [];
    if (watchedValues.targetTitles?.length) {
      parts.push(
        watchedValues.targetTitles.slice(0, 2).join(", ") +
          (watchedValues.targetTitles.length > 2 ? ` +${watchedValues.targetTitles.length - 2}` : ""),
      );
    }
    if (watchedValues.employmentTypes?.length) {
      parts.push(watchedValues.employmentTypes.join("/"));
    }
    if (watchedValues.workModes?.length) {
      parts.push(watchedValues.workModes.join("/"));
    }
    if (watchedValues.salary?.minimum) {
      const minK =
        watchedValues.salary.minimum >= 1000
          ? `${Math.round(watchedValues.salary.minimum / 1000)}k`
          : watchedValues.salary.minimum;
      const currSymbol =
        watchedValues.salary.currency === "USD"
          ? "$"
          : watchedValues.salary.currency === "EUR"
            ? "€"
            : watchedValues.salary.currency === "GBP"
              ? "£"
              : `${watchedValues.salary.currency || "$"}`;
      parts.push(
        `${currSymbol}${minK}+/${watchedValues.salary.period === "monthly" ? "mo" : "yr"}`,
      );
    }
    if (watchedValues.datePosted && watchedValues.datePosted !== "all") {
      const label = DATE_POSTED_OPTIONS.find((d) => d.id === watchedValues.datePosted)?.label;
      if (label) parts.push(label);
    }
    if (watchedValues.sources?.length) {
      parts.push(`${watchedValues.sources.length} source${watchedValues.sources.length === 1 ? "" : "s"}`);
    }
    return parts.length ? parts.join(" • ") : "Default preferences applied (no custom filters)";
  }, [watchedValues]);

  // Chip list helpers
  const addTargetTitle = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const current = watchedValues.targetTitles || [];
    if (!current.includes(trimmed)) {
      setValue("targetTitles", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setTitleInput("");
  };

  const removeTargetTitle = (title: string) => {
    setValue(
      "targetTitles",
      (watchedValues.targetTitles || []).filter((t) => t !== title),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addLocation = () => {
    const city = cityInput.trim();
    const country = countryInput.trim();
    if (!city && !country) return;
    const label = city && country ? `${city}, ${country}` : city || country;
    const current = watchedValues.locations || [];
    setValue("locations", [...current, { city, country, label }], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setCityInput("");
    setCountryInput("");
  };

  const removeLocation = (index: number) => {
    setValue(
      "locations",
      (watchedValues.locations || []).filter((_, i) => i !== index),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addPreferredCountry = (country: string) => {
    const trimmed = country.trim();
    if (!trimmed) return;
    const current = watchedValues.preferredCountries || [];
    if (!current.includes(trimmed)) {
      setValue("preferredCountries", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setPreferredCountryInput("");
  };

  const removePreferredCountry = (country: string) => {
    setValue(
      "preferredCountries",
      (watchedValues.preferredCountries || []).filter((c) => c !== country),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addMustHaveSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed) return;
    const current = watchedValues.mustHaveSkills || [];
    if (!current.includes(trimmed)) {
      setValue("mustHaveSkills", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setMustHaveInput("");
  };

  const removeMustHaveSkill = (skill: string) => {
    setValue(
      "mustHaveSkills",
      (watchedValues.mustHaveSkills || []).filter((s) => s !== skill),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addNiceToHaveSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed) return;
    const current = watchedValues.niceToHaveSkills || [];
    if (!current.includes(trimmed)) {
      setValue("niceToHaveSkills", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setNiceToHaveInput("");
  };

  const removeNiceToHaveSkill = (skill: string) => {
    setValue(
      "niceToHaveSkills",
      (watchedValues.niceToHaveSkills || []).filter((s) => s !== skill),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addIndustry = (industry: string) => {
    const trimmed = industry.trim();
    if (!trimmed) return;
    const current = watchedValues.industries || [];
    if (!current.includes(trimmed)) {
      setValue("industries", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setIndustryInput("");
  };

  const removeIndustry = (industry: string) => {
    setValue(
      "industries",
      (watchedValues.industries || []).filter((i) => i !== industry),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addExcludedKeyword = (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    const current = watchedValues.excludedKeywords || [];
    if (!current.includes(trimmed)) {
      setValue("excludedKeywords", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setExcludedKeywordInput("");
  };

  const removeExcludedKeyword = (kw: string) => {
    setValue(
      "excludedKeywords",
      (watchedValues.excludedKeywords || []).filter((k) => k !== kw),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addExcludedCompany = (comp: string) => {
    const trimmed = comp.trim();
    if (!trimmed) return;
    const current = watchedValues.excludedCompanies || [];
    if (!current.includes(trimmed)) {
      setValue("excludedCompanies", [...current, trimmed], { shouldDirty: true, shouldValidate: true });
    }
    setExcludedCompanyInput("");
  };

  const removeExcludedCompany = (comp: string) => {
    setValue(
      "excludedCompanies",
      (watchedValues.excludedCompanies || []).filter((c) => c !== comp),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  // Toggle multi-select items helper
  const toggleArrayItem = <T extends string>(
    fieldName: "employmentTypes" | "experienceLevels" | "workModes" | "companySizes" | "roleFamilies" | "sources",
    item: T,
  ) => {
    const current = (watchedValues[fieldName] as T[]) || [];
    if (current.includes(item)) {
      setValue(
        fieldName,
        current.filter((x) => x !== item) as any,
        { shouldDirty: true, shouldValidate: true },
      );
    } else {
      setValue(fieldName, [...current, item] as any, { shouldDirty: true, shouldValidate: true });
    }
  };

  const handleResetForm = () => {
    reset(DEFAULT_FORM_PREFERENCES);
    onReset?.();
  };

  const handleSavePresetSubmit = async () => {
    if (!presetNameInput.trim()) return;
    if (onSavePreset) {
      await onSavePreset(presetNameInput.trim(), watchedValues);
      setPresetNameInput("");
      setIsSavingPreset(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Filter Live Summary Banner & Presets Bar */}
      <Card className="border-border bg-card/60 backdrop-blur shadow-sm">
        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Filter Summary
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{liveSummary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Presets selector */}
            {presets.length > 0 && (
              <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-1">
                <Bookmark className="h-3.5 w-3.5 text-muted-foreground ml-1.5" />
                <select
                  aria-label="Load search preset"
                  value={activePresetId || ""}
                  onChange={(e) => {
                    const found = presets.find((p) => p.id === e.target.value);
                    if (found) onApplyPreset?.(found);
                  }}
                  className="bg-transparent text-xs text-foreground focus:outline-none pr-2 py-0.5"
                >
                  <option value="" disabled>
                    Saved Presets ({presets.length})
                  </option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                {activePresetId && onDeletePreset && (
                  <button
                    type="button"
                    onClick={() => onDeletePreset(activePresetId)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded"
                    title="Delete active preset"
                    aria-label="Delete active preset"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Save as preset toggle */}
            {!isSavingPreset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSavingPreset(true)}
                className="text-xs h-8 gap-1.5"
              >
                <Bookmark className="h-3.5 w-3.5 text-primary" />
                <span>Save Preset</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder="Preset name..."
                  className="h-8 text-xs w-36"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSavePresetSubmit()}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSavePresetSubmit}
                  className="h-8 text-xs"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSavingPreset(false)}
                  className="h-8 text-xs px-2"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Reset button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetForm}
              className="text-xs h-8 gap-1 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit((data) => onSave?.(data as FormPreferences))} className="space-y-4">
        {/* ==================================================================== */}
        {/* SECTION 1: ROLE */}
        {/* ==================================================================== */}
        <Card className="border-border">
          <CardHeader
            className="p-4 sm:p-5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => toggleSection("role")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">1. Role & Seniority</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Target job titles, employment types, and experience levels
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={openSections.role ? "Collapse Role section" : "Expand Role section"}
              >
                {openSections.role ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>

          {openSections.role && (
            <CardContent className="p-4 sm:p-5 pt-0 space-y-5 border-t">
              {/* Target Titles */}
              <div className="space-y-2 pt-4">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  Target Job Titles
                  <span className="text-[11px] font-normal text-muted-foreground">
                    (Multi-select chips with suggestions or custom titles)
                  </span>
                </Label>

                {/* Profile Autocomplete suggestions */}
                {profileSuggestedTitles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-[11px] flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      From verified profile:
                    </span>
                    {profileSuggestedTitles.map((sug) => {
                      const isAdded = watchedValues.targetTitles?.includes(sug);
                      return (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => (isAdded ? removeTargetTitle(sug) : addTargetTitle(sug))}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                            isAdded
                              ? "bg-primary/15 border-primary/40 text-primary"
                              : "bg-muted/50 border-border hover:bg-muted text-foreground"
                          }`}
                        >
                          {sug}
                          {isAdded ? <X className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Chips */}
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-background">
                  {watchedValues.targetTitles?.map((title) => (
                    <Badge key={title} variant="secondary" className="gap-1 py-1 px-2.5 text-xs">
                      <span>{title}</span>
                      <button
                        type="button"
                        onClick={() => removeTargetTitle(title)}
                        className="rounded hover:opacity-80"
                        aria-label={`Remove title ${title}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTargetTitle(titleInput);
                      }
                    }}
                    placeholder={
                      watchedValues.targetTitles?.length
                        ? "Add another title..."
                        : "e.g. Senior Software Engineer..."
                    }
                    className="flex-1 min-w-[160px] bg-transparent text-xs focus:outline-none px-1 text-foreground"
                  />
                  {titleInput.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addTargetTitle(titleInput)}
                      className="h-6 text-xs px-2"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* Employment Types */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Employment Type (multi-select)</Label>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYMENT_TYPE_OPTIONS.map((opt) => {
                    const isSelected = watchedValues.employmentTypes?.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleArrayItem("employmentTypes", opt.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Experience Levels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Experience Level (multi-select)</Label>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    Inferred from profile experience
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_LEVEL_OPTIONS.map((opt) => {
                    const isSelected = watchedValues.experienceLevels?.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleArrayItem("experienceLevels", opt.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role Families & Also Show Others */}
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-xs font-semibold">Role Families to Include</Label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_ROLE_FAMILIES.map((rf) => {
                    const isSelected = watchedValues.roleFamilies?.includes(rf.id);
                    return (
                      <button
                        key={rf.id}
                        type="button"
                        onClick={() => toggleArrayItem("roleFamilies", rf.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-secondary text-secondary-foreground border-secondary font-semibold"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {rf.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="alsoShowOtherRoles"
                    checked={watchedValues.alsoShowOtherRoles}
                    onChange={(e) =>
                      setValue("alsoShowOtherRoles", e.target.checked, { shouldDirty: true })
                    }
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <Label htmlFor="alsoShowOtherRoles" className="text-xs text-foreground font-normal cursor-pointer">
                    Also show adjacent roles from other disciplines if match score is high
                  </Label>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ==================================================================== */}
        {/* SECTION 2: LOCATION & WORK MODE */}
        {/* ==================================================================== */}
        <Card className="border-border">
          <CardHeader
            className="p-4 sm:p-5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => toggleSection("location")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">2. Location & Work Mode</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Remote, hybrid, cities/countries, and visa sponsorship
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={openSections.location ? "Collapse Location section" : "Expand Location section"}
              >
                {openSections.location ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>

          {openSections.location && (
            <CardContent className="p-4 sm:p-5 pt-0 space-y-5 border-t">
              {/* Work Mode */}
              <div className="space-y-2 pt-4">
                <Label className="text-xs font-semibold">Work Mode (multi-select)</Label>
                <div className="flex flex-wrap gap-2">
                  {WORK_MODE_OPTIONS.map((opt) => {
                    const isSelected = watchedValues.workModes?.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleArrayItem("workModes", opt.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/40 text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Locations Chips */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Preferred Locations (Country & City)</Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-background">
                  {watchedValues.locations?.map((loc, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1 py-1 px-2.5 text-xs">
                      <span>{loc.label || `${loc.city || ""}, ${loc.country || ""}`}</span>
                      <button
                        type="button"
                        onClick={() => removeLocation(idx)}
                        className="rounded hover:opacity-80"
                        aria-label={`Remove location ${loc.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[240px]">
                    <input
                      type="text"
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      placeholder="City (e.g. Berlin)"
                      className="w-28 bg-transparent text-xs focus:outline-none px-1 text-foreground"
                    />
                    <input
                      type="text"
                      value={countryInput}
                      onChange={(e) => setCountryInput(e.target.value)}
                      placeholder="Country (e.g. Germany)"
                      className="w-32 bg-transparent text-xs focus:outline-none px-1 text-foreground"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLocation())}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addLocation}
                      className="h-6 text-xs px-2"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* Toggles: Relocation & Worldwide */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchedValues.openToRelocation}
                    onChange={(e) =>
                      setValue("openToRelocation", e.target.checked, { shouldDirty: true })
                    }
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground">Open to Relocation</div>
                    <div className="text-[11px] text-muted-foreground">
                      Match positions offering relocation assistance
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchedValues.remoteWorldwide}
                    onChange={(e) =>
                      setValue("remoteWorldwide", e.target.checked, { shouldDirty: true })
                    }
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground">Remote Worldwide</div>
                    <div className="text-[11px] text-muted-foreground">
                      Include anywhere-in-the-world remote roles
                    </div>
                  </div>
                </label>
              </div>

              {/* Work Authorization & Preferred Countries */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">Visa Sponsorship Needed</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Do you require employer work visa sponsorship?
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setValue("visaSponsorshipNeeded", false, { shouldDirty: true })
                      }
                      className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                        !watchedValues.visaSponsorshipNeeded
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border"
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setValue("visaSponsorshipNeeded", true, { shouldDirty: true })
                      }
                      className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                        watchedValues.visaSponsorshipNeeded
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border"
                      }`}
                    >
                      Yes
                    </button>
                  </div>
                </div>

                {watchedValues.visaSponsorshipNeeded && (
                  <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/20">
                    <Label className="text-xs font-semibold">Preferred Countries for Sponsorship</Label>
                    <div className="flex flex-wrap gap-1.5 min-h-[30px] p-2 rounded-md border border-border bg-background">
                      {watchedValues.preferredCountries?.map((country) => (
                        <Badge key={country} variant="secondary" className="gap-1 py-0.5 px-2 text-xs">
                          <span>{country}</span>
                          <button
                            type="button"
                            onClick={() => removePreferredCountry(country)}
                            className="rounded hover:opacity-80"
                            aria-label={`Remove country ${country}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <input
                        type="text"
                        value={preferredCountryInput}
                        onChange={(e) => setPreferredCountryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addPreferredCountry(preferredCountryInput);
                          }
                        }}
                        placeholder="Add country (e.g. Germany, UK)..."
                        className="flex-1 min-w-[140px] bg-transparent text-xs focus:outline-none px-1 text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* ==================================================================== */}
        {/* SECTION 3: COMPENSATION */}
        {/* ==================================================================== */}
        <Card className="border-border">
          <CardHeader
            className="p-4 sm:p-5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => toggleSection("compensation")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <DollarSign className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">3. Compensation</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Target minimum salary, currency, period, and salary disclosure preference
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={openSections.compensation ? "Collapse Compensation section" : "Expand Compensation section"}
              >
                {openSections.compensation ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>

          {openSections.compensation && (
            <CardContent className="p-4 sm:p-5 pt-0 space-y-4 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                {/* Currency */}
                <div className="space-y-1.5">
                  <Label htmlFor="salaryCurrency" className="text-xs font-semibold">Currency</Label>
                  <select
                    id="salaryCurrency"
                    value={watchedValues.salary?.currency || "USD"}
                    onChange={(e) =>
                      setValue("salary.currency", e.target.value, { shouldDirty: true })
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD (C$)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="CHF">CHF</option>
                    <option value="SGD">SGD</option>
                  </select>
                </div>

                {/* Minimum Salary */}
                <div className="space-y-1.5">
                  <Label htmlFor="salaryMinimum" className="text-xs font-semibold">Minimum Amount</Label>
                  <Controller
                    name="salary.minimum"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="salaryMinimum"
                        type="number"
                        min={0}
                        step={5000}
                        placeholder="e.g. 120000"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                        }
                        className="text-xs h-9"
                      />
                    )}
                  />
                  {errors.salary?.minimum && (
                    <p className="text-[11px] text-destructive">{errors.salary.minimum.message}</p>
                  )}
                </div>

                {/* Period */}
                <div className="space-y-1.5">
                  <Label htmlFor="salaryPeriod" className="text-xs font-semibold">Period</Label>
                  <select
                    id="salaryPeriod"
                    value={watchedValues.salary?.period || "yearly"}
                    onChange={(e) =>
                      setValue("salary.period", e.target.value as SalaryPeriod, {
                        shouldDirty: true,
                      })
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="yearly">Per Year (Annual)</option>
                    <option value="monthly">Per Month</option>
                  </select>
                </div>
              </div>

              {/* Hide jobs without salary toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchedValues.salary?.hideWithoutSalary ?? false}
                    onChange={(e) =>
                      setValue("salary.hideWithoutSalary", e.target.checked, { shouldDirty: true })
                    }
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="text-xs font-medium text-foreground">
                    Hide job postings that do not specify salary
                  </span>
                </label>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ==================================================================== */}
        {/* SECTION 4: SKILLS & DOMAINS */}
        {/* ==================================================================== */}
        <Card className="border-border">
          <CardHeader
            className="p-4 sm:p-5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => toggleSection("skills")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Wrench className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">4. Skills & Industries</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Must-have and nice-to-have skills, target domains, and company size
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={openSections.skills ? "Collapse Skills section" : "Expand Skills section"}
              >
                {openSections.skills ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>

          {openSections.skills && (
            <CardContent className="p-4 sm:p-5 pt-0 space-y-5 border-t">
              {/* Profile Suggested Skills */}
              {profileSuggestedSkills.length > 0 && (
                <div className="pt-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Quick-add skills from candidate profile:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profileSuggestedSkills.map((skill) => {
                      const isMust = watchedValues.mustHaveSkills?.includes(skill);
                      const isNice = watchedValues.niceToHaveSkills?.includes(skill);
                      return (
                        <div
                          key={skill}
                          className="inline-flex items-center rounded-md border border-border bg-muted/40 text-[11px] overflow-hidden"
                        >
                          <span className="px-2 py-0.5 font-medium">{skill}</span>
                          <button
                            type="button"
                            title="Add as Must-have"
                            onClick={() => (isMust ? removeMustHaveSkill(skill) : addMustHaveSkill(skill))}
                            className={`px-1.5 py-0.5 border-l border-border transition-colors ${
                              isMust ? "bg-emerald-600 text-white font-bold" : "hover:bg-muted text-muted-foreground"
                            }`}
                          >
                            Must
                          </button>
                          <button
                            type="button"
                            title="Add as Nice-to-have"
                            onClick={() => (isNice ? removeNiceToHaveSkill(skill) : addNiceToHaveSkill(skill))}
                            className={`px-1.5 py-0.5 border-l border-border transition-colors ${
                              isNice ? "bg-blue-600 text-white font-bold" : "hover:bg-muted text-muted-foreground"
                            }`}
                          >
                            Nice
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Must-have skills chips */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Must-Have Skills (Jobs without these are filtered)
                </Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-background">
                  {watchedValues.mustHaveSkills?.map((skill) => (
                    <Badge key={skill} variant="success" className="gap-1 py-1 px-2.5 text-xs">
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => removeMustHaveSkill(skill)}
                        className="rounded hover:opacity-80"
                        aria-label={`Remove must-have skill ${skill}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    value={mustHaveInput}
                    onChange={(e) => setMustHaveInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addMustHaveSkill(mustHaveInput);
                      }
                    }}
                    placeholder="Add must-have skill..."
                    className="flex-1 min-w-[140px] bg-transparent text-xs focus:outline-none px-1 text-foreground"
                  />
                  {mustHaveInput.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addMustHaveSkill(mustHaveInput)}
                      className="h-6 text-xs px-2"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* Nice-to-have skills chips */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Nice-to-Have Skills (Boosts candidate match score)
                </Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-background">
                  {watchedValues.niceToHaveSkills?.map((skill) => (
                    <Badge key={skill} variant="secondary" className="gap-1 py-1 px-2.5 text-xs">
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => removeNiceToHaveSkill(skill)}
                        className="rounded hover:opacity-80"
                        aria-label={`Remove nice-to-have skill ${skill}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    value={niceToHaveInput}
                    onChange={(e) => setNiceToHaveInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addNiceToHaveSkill(niceToHaveInput);
                      }
                    }}
                    placeholder="Add nice-to-have skill..."
                    className="flex-1 min-w-[140px] bg-transparent text-xs focus:outline-none px-1 text-foreground"
                  />
                  {niceToHaveInput.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addNiceToHaveSkill(niceToHaveInput)}
                      className="h-6 text-xs px-2"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* Industries / Domains */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Industries & Domains</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_INDUSTRIES.map((ind) => {
                    const isSelected = watchedValues.industries?.includes(ind);
                    return (
                      <button
                        key={ind}
                        type="button"
                        onClick={() => (isSelected ? removeIndustry(ind) : addIndustry(ind))}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary font-medium"
                            : "bg-muted/30 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {ind}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <Input
                    value={industryInput}
                    onChange={(e) => setIndustryInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIndustry(industryInput))}
                    placeholder="Add custom industry (e.g. Cleantech)..."
                    className="h-8 text-xs max-w-xs"
                  />
                  {industryInput.trim() && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addIndustry(industryInput)}
                      className="h-8 text-xs"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* Company Size */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Company Size Preference</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {COMPANY_SIZE_OPTIONS.map((opt) => {
                    const isSelected = watchedValues.companySizes?.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleArrayItem("companySizes", opt.id)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-primary text-foreground"
                            : "bg-muted/20 border-border hover:bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <div className="text-xs font-semibold text-foreground">{opt.label}</div>
                        <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ==================================================================== */}
        {/* SECTION 5: ADVANCED & SOURCES */}
        {/* ==================================================================== */}
        <Card className="border-border">
          <CardHeader
            className="p-4 sm:p-5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => toggleSection("advanced")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">5. Advanced & Sources</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Date posted, negative keywords/companies, and live source credentials status
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={openSections.advanced ? "Collapse Advanced section" : "Expand Advanced section"}
              >
                {openSections.advanced ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>

          {openSections.advanced && (
            <CardContent className="p-4 sm:p-5 pt-0 space-y-5 border-t">
              {/* Date Posted */}
              <div className="space-y-2 pt-4">
                <Label className="text-xs font-semibold">Date Posted</Label>
                <div className="flex flex-wrap gap-2">
                  {DATE_POSTED_OPTIONS.map((opt) => {
                    const isSelected = (watchedValues.datePosted || "all") === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setValue("datePosted", opt.id, { shouldDirty: true, shouldValidate: true })
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/30 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Excluded Keywords */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold text-destructive">
                  Excluded Keywords (Jobs with these terms are discarded)
                </Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-background">
                  {watchedValues.excludedKeywords?.map((kw) => (
                    <Badge key={kw} variant="destructive" className="gap-1 py-1 px-2.5 text-xs">
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => removeExcludedKeyword(kw)}
                        className="rounded hover:opacity-80"
                        aria-label={`Remove excluded keyword ${kw}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    value={excludedKeywordInput}
                    onChange={(e) => setExcludedKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addExcludedKeyword(excludedKeywordInput);
                      }
                    }}
                    placeholder="e.g. PHP, Clearance, Crypto..."
                    className="flex-1 min-w-[140px] bg-transparent text-xs focus:outline-none px-1 text-foreground"
                  />
                  {excludedKeywordInput.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addExcludedKeyword(excludedKeywordInput)}
                      className="h-6 text-xs px-2"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* Excluded Companies */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold text-destructive">
                  Excluded Companies (Disregard postings from these employers)
                </Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-lg border border-border bg-background">
                  {watchedValues.excludedCompanies?.map((comp) => (
                    <Badge key={comp} variant="destructive" className="gap-1 py-1 px-2.5 text-xs">
                      <span>{comp}</span>
                      <button
                        type="button"
                        onClick={() => removeExcludedCompany(comp)}
                        className="rounded hover:opacity-80"
                        aria-label={`Remove excluded company ${comp}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    value={excludedCompanyInput}
                    onChange={(e) => setExcludedCompanyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addExcludedCompany(excludedCompanyInput);
                      }
                    }}
                    placeholder="e.g. BadCorp, SpamInc..."
                    className="flex-1 min-w-[140px] bg-transparent text-xs focus:outline-none px-1 text-foreground"
                  />
                  {excludedCompanyInput.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addExcludedCompany(excludedCompanyInput)}
                      className="h-6 text-xs px-2"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* Sources with live availability status and credential warnings */}
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label className="text-xs font-semibold">Job Sources to Search</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Sources with missing API keys are disabled with explanations below
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableSources.map((source) => {
                    const isSelected = watchedValues.sources?.includes(source.source);
                    const isAvailable = source.available;

                    return (
                      <div
                        key={source.source}
                        className={`p-3 rounded-lg border transition-colors ${
                          !isAvailable
                            ? "border-destructive/30 bg-destructive/5 opacity-70"
                            : isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!isAvailable}
                              checked={isAvailable && isSelected}
                              onChange={() => toggleArrayItem("sources", source.source)}
                              className="rounded border-border text-primary focus:ring-primary h-4 w-4 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs font-semibold text-foreground">
                              {source.name}
                            </span>
                          </label>

                          <Badge
                            variant={isAvailable ? "success" : "destructive"}
                            className="text-[10px] py-0 px-2"
                          >
                            {isAvailable ? "Active" : "Unavailable"}
                          </Badge>
                        </div>

                        {!isAvailable && source.reason && (
                          <div className="mt-2 text-[11px] text-destructive flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{source.reason}</span>
                          </div>
                        )}

                        {isAvailable && source.supportedFilters && source.supportedFilters.length > 0 && (
                          <div className="mt-2 text-[10px] text-muted-foreground">
                            Native filters: {source.supportedFilters.join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ==================================================================== */}
        {/* FOOTER ACTIONS */}
        {/* ==================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleResetForm}
            className="text-xs gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Defaults</span>
          </Button>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="secondary"
              disabled={isSaving || isSearching}
              className="text-xs font-semibold"
            >
              {isSaving ? "Saving..." : "Save Preferences"}
            </Button>

            <Button
              type="button"
              disabled={isSaving || isSearching}
              onClick={handleSubmit((data) => {
                if (onSaveAndFindJobs) {
                  onSaveAndFindJobs(data as FormPreferences);
                } else if (onSave) {
                  onSave(data as FormPreferences);
                }
              })}
              className="text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSearching ? (
                <>Searching...</>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  <span>Save and Find Jobs</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
