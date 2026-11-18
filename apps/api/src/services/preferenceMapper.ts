import type { JobPreferences } from "@jobpilot/shared";

export interface QueryBase {
  location?: string;
  remoteOnly?: boolean;
  seniority?: string;
  sources?: string[];
}

export function mapPreferencesToJobQuery(
  title: string,
  query: QueryBase,
  preferences?: Partial<JobPreferences> | null,
): Record<string, unknown> {
  const prefs = preferences;
  return {
    query: title,
    target_titles: prefs?.targetTitles?.length ? prefs.targetTitles : undefined,
    employment_types: prefs?.employmentTypes || undefined,
    experience_levels: prefs?.experienceLevels || undefined,
    work_modes: prefs?.workModes || undefined,
    locations: prefs?.locations?.length
      ? prefs.locations
      : query.location
        ? [query.location]
        : undefined,
    open_to_relocation: prefs?.openToRelocation ?? false,
    remote_worldwide: prefs?.remoteWorldwide ?? false,
    visa_sponsorship_needed: prefs?.visaSponsorshipNeeded ?? false,
    preferred_countries: prefs?.preferredCountries || undefined,
    salary_currency: prefs?.salary?.currency || "USD",
    salary_min: prefs?.salary?.minimum || undefined,
    salary_period: prefs?.salary?.period || "yearly",
    hide_without_salary: prefs?.salary?.hideWithoutSalary ?? false,
    must_have_skills: prefs?.mustHaveSkills || undefined,
    nice_to_have_skills: prefs?.niceToHaveSkills || undefined,
    industries: prefs?.industries || undefined,
    company_sizes: prefs?.companySizes || undefined,
    date_posted: prefs?.datePosted || undefined,
    excluded_keywords: prefs?.excludedKeywords || undefined,
    excluded_companies: prefs?.excludedCompanies || undefined,
    role_families: prefs?.roleFamilies || undefined,
    also_show_other_roles: prefs?.alsoShowOtherRoles ?? false,
    location: query.location || undefined,
    remote_only: query.remoteOnly ?? false,
    seniority: query.seniority || undefined,
    sources: prefs?.sources?.length ? prefs.sources : query.sources || undefined,
  };
}
