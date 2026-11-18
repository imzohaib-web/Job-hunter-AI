import {
  ArrowUpDown,
  Bookmark,
  Filter,
  Globe,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_FILTERS, type JobFilterValues } from "./jobUtils";

interface JobFiltersProps {
  filters: JobFilterValues;
  onChange: (next: JobFilterValues) => void;
  availableSources?: string[];
  totalCount?: number;
  filteredCount?: number;
  className?: string;
}

const SENIORITY_OPTIONS = [
  { value: "all", label: "All Seniorities" },
  { value: "junior", label: "Junior / Entry" },
  { value: "mid", label: "Mid-Level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead / Principal" },
];

export function JobFilters({
  filters,
  onChange,
  availableSources = ["all"],
  totalCount,
  filteredCount,
  className = "",
}: JobFiltersProps) {
  const isDirty =
    filters.minScore !== DEFAULT_FILTERS.minScore ||
    filters.remoteOnly ||
    filters.source !== "all" ||
    filters.seniority !== "all" ||
    filters.savedOnly ||
    Boolean(filters.showLowMatches) ||
    filters.sort !== "score_desc";

  const handleReset = () => {
    onChange(DEFAULT_FILTERS);
  };

  return (
    <div
      className={`space-y-4 rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm ${className}`}
      role="search"
      aria-label="Job search filters"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>Filter Matches</span>
              {typeof filteredCount === "number" && (
                <Badge variant="secondary" className="text-xs">
                  {filteredCount} {filteredCount === 1 ? "match" : "matches"}
                  {typeof totalCount === "number" && totalCount !== filteredCount
                    ? ` (of ${totalCount})`
                    : ""}
                </Badge>
              )}
            </h3>
          </div>
        </div>

        {/* Reset button */}
        {isDirty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset Filters
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
        {/* Min Score Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <label htmlFor="min-score-slider" className="text-muted-foreground flex items-center gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Min Score</span>
            </label>
            <span
              className={`font-semibold ${
                filters.minScore >= 80
                  ? "text-emerald-600 dark:text-emerald-400"
                  : filters.minScore >= 60
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground"
              }`}
            >
              {filters.minScore}%
            </span>
          </div>
          <input
            id="min-score-slider"
            type="range"
            min="0"
            max="100"
            step="5"
            value={filters.minScore}
            onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            aria-label="Minimum match score"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/70">
            <span>0%</span>
            <span>30% (Default)</span>
            <span>70%+</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={Boolean(filters.showLowMatches || filters.minScore < 30)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onChange({
                    ...filters,
                    showLowMatches: checked,
                    minScore: checked ? 0 : 30,
                  });
                }}
                className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary"
              />
              <span>Show low matches (&lt;30%)</span>
            </label>
          </div>
        </div>

        {/* Source Dropdown */}
        <div className="space-y-1.5">
          <label htmlFor="source-select" className="block text-xs font-medium text-muted-foreground">
            Source Platform
          </label>
          <select
            id="source-select"
            value={filters.source}
            onChange={(e) => onChange({ ...filters, source: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring capitalize"
          >
            {availableSources.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All Platforms" : s}
              </option>
            ))}
          </select>
        </div>

        {/* Seniority Dropdown */}
        <div className="space-y-1.5">
          <label htmlFor="seniority-select" className="block text-xs font-medium text-muted-foreground">
            Seniority
          </label>
          <select
            id="seniority-select"
            value={filters.seniority}
            onChange={(e) => onChange({ ...filters, seniority: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {SENIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Order */}
        <div className="space-y-1.5">
          <label htmlFor="sort-select" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>Sort By</span>
          </label>
          <select
            id="sort-select"
            value={filters.sort}
            onChange={(e) =>
              onChange({
                ...filters,
                sort: e.target.value as JobFilterValues["sort"],
              })
            }
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="score_desc">Highest Match Score</option>
            <option value="score_asc">Lowest Match Score</option>
            <option value="date_desc">Most Recent Date</option>
            <option value="date_asc">Oldest Date</option>
          </select>
        </div>
      </div>

      {/* Toggle chips: Remote only & Saved only */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
        <Button
          type="button"
          variant={filters.remoteOnly ? "default" : "outline"}
          size="sm"
          onClick={() => onChange({ ...filters, remoteOnly: !filters.remoteOnly })}
          className={`h-8 text-xs font-medium ${
            filters.remoteOnly
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={filters.remoteOnly}
        >
          <Globe className="mr-1.5 h-3.5 w-3.5" />
          Remote Only
        </Button>

        <Button
          type="button"
          variant={filters.savedOnly ? "default" : "outline"}
          size="sm"
          onClick={() => onChange({ ...filters, savedOnly: !filters.savedOnly })}
          className={`h-8 text-xs font-medium ${
            filters.savedOnly
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={filters.savedOnly}
        >
          <Bookmark className={`mr-1.5 h-3.5 w-3.5 ${filters.savedOnly ? "fill-current" : ""}`} />
          Saved Jobs Only
        </Button>
      </div>
    </div>
  );
}
