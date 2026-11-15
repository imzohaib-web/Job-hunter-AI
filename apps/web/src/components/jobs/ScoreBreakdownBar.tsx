import type { ScoreBreakdown } from "@jobpilot/shared";
import { cn } from "@/lib/utils";

interface ScoreBreakdownBarProps {
  breakdown?: ScoreBreakdown | null;
  className?: string;
}

interface DimensionConfig {
  key: string;
  label: string;
  weight: string;
  color: string;
  bgColor: string;
  extractValue: (b: ScoreBreakdown) => number;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key: "semantic",
    label: "Semantic Match",
    weight: "35%",
    color: "bg-blue-500 dark:bg-blue-400",
    bgColor: "bg-blue-500/15",
    extractValue: (b) => {
      const val = b.semantic ?? b.semanticScore;
      return typeof val === "number" ? val : 0;
    },
  },
  {
    key: "skills",
    label: "Skills Overlap",
    weight: "25%",
    color: "bg-emerald-500 dark:bg-emerald-400",
    bgColor: "bg-emerald-500/15",
    extractValue: (b) => {
      const val = b.skills ?? b.skillsScore;
      return typeof val === "number" ? val : 0;
    },
  },
  {
    key: "keyword",
    label: "Keyword Fit",
    weight: "25%",
    color: "bg-amber-500 dark:bg-amber-400",
    bgColor: "bg-amber-500/15",
    extractValue: (b) => {
      const val = b.keyword ?? b.keywordScore;
      return typeof val === "number" ? val : 0;
    },
  },
  {
    key: "experience",
    label: "Experience Level",
    weight: "15%",
    color: "bg-purple-500 dark:bg-purple-400",
    bgColor: "bg-purple-500/15",
    extractValue: (b) => {
      const val = b.experience ?? b.experienceScore;
      return typeof val === "number" ? val : 0;
    },
  },
];

export function ScoreBreakdownBar({ breakdown = {}, className }: ScoreBreakdownBarProps) {
  const safeBreakdown = breakdown || {};

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1 border-b">
        <span>Score Breakdown Dimension</span>
        <span>Alignment (Weight)</span>
      </div>

      <div className="space-y-2.5">
        {DIMENSIONS.map((dim) => {
          const rawScore = dim.extractValue(safeBreakdown);
          const score = Math.max(0, Math.min(100, Math.round(rawScore)));

          return (
            <div key={dim.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{dim.label}</span>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{score}%</span>{" "}
                  <span className="text-[11px] opacity-75">({dim.weight})</span>
                </span>
              </div>

              {/* Progress track */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className={cn("h-full rounded-full transition-all duration-700 ease-out", dim.color)}
                  style={{ width: `${score}%` }}
                  role="progressbar"
                  aria-label={`${dim.label} score: ${score}%`}
                  aria-valuenow={score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
