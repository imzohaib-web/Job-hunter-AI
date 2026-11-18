export interface JobFilterValues {
  minScore: number;
  remoteOnly: boolean;
  source: string;
  seniority: string;
  savedOnly: boolean;
  sort: "score_desc" | "score_asc" | "date_desc" | "date_asc";
  showLowMatches?: boolean;
}

export const DEFAULT_FILTERS: JobFilterValues = {
  minScore: 30,
  remoteOnly: false,
  source: "all",
  seniority: "all",
  savedOnly: false,
  sort: "score_desc",
  showLowMatches: false,
};

export function formatSalaryDisplay(salary: unknown): string | null {
  if (!salary) return null;
  if (typeof salary === "string") {
    const trimmed = salary.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof salary === "object" && salary !== null) {
    const s = salary as {
      min?: number;
      max?: number;
      currency?: string;
      period?: string;
      text?: string;
    };
    if (s.text) return s.text;

    const curr = s.currency ? `${s.currency} ` : "$";
    const rawPeriod = (s.period || "").toLowerCase();
    const periodStr =
      rawPeriod === "yearly" || rawPeriod === "year" || rawPeriod === "annual"
        ? "/yr"
        : rawPeriod === "monthly" || rawPeriod === "month"
          ? "/mo"
          : rawPeriod === "hourly" || rawPeriod === "hour"
            ? "/hr"
            : rawPeriod
              ? `/${rawPeriod}`
              : "";

    if (typeof s.min === "number" && typeof s.max === "number") {
      if (s.min === s.max) {
        // If min == max < 5000 without period, hide it (bogus/placeholder rate)
        if (s.min < 5000 && !periodStr) {
          return null;
        }
        // Never render "USD 1,000 - 1,000"
        return `${curr}${s.min.toLocaleString()}${periodStr}`;
      }
      return `${curr}${s.min.toLocaleString()} - ${s.max.toLocaleString()}${periodStr}`;
    }
    if (typeof s.min === "number") {
      if (s.min < 5000 && !periodStr) return null;
      return `From ${curr}${s.min.toLocaleString()}${periodStr}`;
    }
    if (typeof s.max === "number") {
      if (s.max < 5000 && !periodStr) return null;
      return `Up to ${curr}${s.max.toLocaleString()}${periodStr}`;
    }
  }
  return null;
}
