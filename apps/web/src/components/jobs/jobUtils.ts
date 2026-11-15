export interface JobFilterValues {
  minScore: number;
  remoteOnly: boolean;
  source: string;
  seniority: string;
  savedOnly: boolean;
  sort: "score_desc" | "score_asc" | "date_desc" | "date_asc";
}

export const DEFAULT_FILTERS: JobFilterValues = {
  minScore: 0,
  remoteOnly: false,
  source: "all",
  seniority: "all",
  savedOnly: false,
  sort: "score_desc",
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
    const period = s.period ? `/${s.period === "yearly" ? "yr" : s.period}` : "";

    if (typeof s.min === "number" && typeof s.max === "number") {
      return `${curr}${s.min.toLocaleString()} - ${s.max.toLocaleString()}${period}`;
    }
    if (typeof s.min === "number") {
      return `From ${curr}${s.min.toLocaleString()}${period}`;
    }
    if (typeof s.max === "number") {
      return `Up to ${curr}${s.max.toLocaleString()}${period}`;
    }
  }
  return null;
}
