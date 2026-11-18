import { cn } from "@/lib/utils";

interface MatchScoreBadgeProps {
  score: number;
  tier?: "strong" | "good" | "possible" | "stretch";
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

export function MatchScoreBadge({
  score,
  tier,
  size = "sm",
  className,
  showLabel = false,
}: MatchScoreBadgeProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Size dimensions
  const dimensions = {
    sm: { size: 44, strokeWidth: 3.5, fontSize: "text-xs font-bold" },
    md: { size: 54, strokeWidth: 4, fontSize: "text-sm font-bold" },
    lg: { size: 68, strokeWidth: 5, fontSize: "text-base font-bold" },
  }[size];

  const radius = (dimensions.size - dimensions.strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Derive tier if not explicitly passed
  const effectiveTier =
    tier ||
    (clampedScore >= 70
      ? "strong"
      : clampedScore >= 50
        ? "good"
        : clampedScore >= 30
          ? "possible"
          : "stretch");

  // Determine color theme based on score tier
  // Strong (>=70) -> Emerald/Green
  // Good (50-69) -> Sky/Blue
  // Possible (30-49) -> Amber
  // Stretch (<30) -> Slate/Grey
  let strokeColor = "stroke-emerald-500";
  let textColor = "text-emerald-600 dark:text-emerald-400";
  let bgColor = "bg-emerald-500/10";

  if (effectiveTier === "stretch") {
    strokeColor = "stroke-slate-400 dark:stroke-slate-500";
    textColor = "text-slate-600 dark:text-slate-400";
    bgColor = "bg-slate-500/10";
  } else if (effectiveTier === "possible") {
    strokeColor = "stroke-amber-500";
    textColor = "text-amber-600 dark:text-amber-400";
    bgColor = "bg-amber-500/10";
  } else if (effectiveTier === "good") {
    strokeColor = "stroke-sky-500";
    textColor = "text-sky-600 dark:text-sky-400";
    bgColor = "bg-sky-500/10";
  }

  return (
    <div
      className={cn("flex flex-col items-center justify-center", className)}
      role="meter"
      aria-valuenow={clampedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Match score: ${clampedScore}%`}
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full transition-transform",
          bgColor,
        )}
        style={{ width: dimensions.size, height: dimensions.size }}
      >
        <svg
          width={dimensions.size}
          height={dimensions.size}
          className="rotate-[-90deg] transition-all duration-500 ease-out"
        >
          {/* Background track circle */}
          <circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            className="stroke-muted/40 fill-transparent"
            strokeWidth={dimensions.strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            className={cn("fill-transparent transition-all duration-700 ease-out", strokeColor)}
            strokeWidth={dimensions.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Center score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className={cn(dimensions.fontSize, textColor)}>
            {clampedScore}
            <span className="text-[9px] font-normal opacity-75">%</span>
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Match
        </span>
      )}
    </div>
  );
}
