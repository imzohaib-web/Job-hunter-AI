import {
  AlertCircle,
  Bookmark,
  Building,
  Check,
  ChevronRight,
  DollarSign,
  Globe,
  MapPin,
  Sparkles,
} from "lucide-react";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MatchScoreBadge } from "./MatchScoreBadge";
import { formatSalaryDisplay } from "./jobUtils";
import type { JobEntity, MatchEntity } from "@jobpilot/shared";
import { toast } from "@/stores/toastStore";

interface JobCardProps {
  match: MatchEntity;
  isSaved?: boolean;
  onSelect: (match: MatchEntity) => void;
  onToggleSave: (jobId: string, currentlySaved: boolean) => Promise<void> | void;
  className?: string;
}

export function JobCard({
  match,
  isSaved = false,
  onSelect,
  onToggleSave,
  className = "",
}: JobCardProps) {
  // Resolve populated job or embedded job object
  const job: JobEntity =
    typeof match.jobId === "object" && match.jobId !== null
      ? (match.jobId as JobEntity)
      : match.job ?? {
          _id: String(match.jobId || ""),
          source: "unknown",
          externalId: "unknown",
          title: "Untitled Role",
          company: "Company",
          location: "Location unspecified",
          remote: false,
          description: "",
          skills: [],
          url: "#",
          postedAt: match.createdAt,
        };

  // Local optimistic state for bookmarking
  const [saved, setSaved] = useState(Boolean(isSaved || match.isSaved));
  const [isSaving, setIsSaving] = useState(false);

  // Sync saved prop
  React.useEffect(() => {
    setSaved(Boolean(isSaved || match.isSaved));
  }, [isSaved, match.isSaved]);

  const handleBookmarkToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent triggering onSelect
    if (isSaving) return;

    const previousState = saved;
    const nextState = !previousState;
    setSaved(nextState);
    setIsSaving(true);

    try {
      await onToggleSave(job._id, previousState);
      toast.success(
        nextState ? "Job saved to your bookmarks" : "Job removed from bookmarks",
        nextState ? "Saved" : "Unsaved",
      );
    } catch {
      // Rollback on error
      setSaved(previousState);
      toast.error("Failed to update bookmark status", "Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(match);
    }
  };

  const formattedSalary = formatSalaryDisplay(job.salary);
  const isDemo = Boolean(job.isDemo ?? (job as unknown as Record<string, unknown>).is_demo);

  // Skills chips
  const topMatchedSkills = (match.matchedSkills || []).slice(0, 3);
  const topMissingSkills = (match.missingSkills || []).slice(0, 2);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(match)}
      onKeyDown={handleKeyDown}
      aria-label={`${job.title} at ${job.company}, Match score ${Math.round(match.score)}%`}
      className={`group relative cursor-pointer border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${className}`}
    >
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Main Info */}
          <div className="space-y-2 flex-1 min-w-0">
            {/* Header badges: Source, Demo, Remote */}
            <div className="flex flex-wrap items-center gap-1.5">
              {isDemo && (
                <Badge
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px] font-semibold"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Demo Data
                </Badge>
              )}

              {job.remote ? (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-medium"
                >
                  <Globe className="mr-1 h-3 w-3" />
                  Remote
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                  <Building className="mr-1 h-3 w-3" />
                  On-site / Hybrid
                </Badge>
              )}

              {job.source && (
                <span className="text-[11px] text-muted-foreground uppercase font-medium tracking-wider">
                  via {job.source}
                </span>
              )}
            </div>

            {/* Title & Company */}
            <div>
              <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {job.title}
              </h3>
              <p className="text-xs font-medium text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                <span className="font-semibold text-foreground/90">{job.company}</span>
                {job.location && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {job.location}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Salary if present */}
            {formattedSalary && (
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                <span>{formattedSalary}</span>
              </div>
            )}

            {/* Top matched & missing skills chips */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5">
              {topMatchedSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                  {skill}
                </span>
              ))}

              {topMissingSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/80"
                >
                  <AlertCircle className="h-3 w-3 shrink-0 text-amber-500/80" />
                  {skill}
                </span>
              ))}

              {topMatchedSkills.length === 0 && topMissingSkills.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  General technical profile match
                </span>
              )}
            </div>
          </div>

          {/* Right side: Score ring & Save action */}
          <div className="flex sm:flex-col items-center justify-between sm:justify-start gap-3 sm:items-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                aria-label={saved ? "Unsave job" : "Save job"}
                onClick={handleBookmarkToggle}
                className={`h-9 w-9 p-0 rounded-full transition-all ${
                  saved
                    ? "text-primary bg-primary/10 hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Bookmark className={`h-4 w-4 ${saved ? "fill-primary" : ""}`} />
              </Button>

              <MatchScoreBadge score={match.score} size="sm" showLabel />
            </div>

            <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-primary transition-colors">
              <span>View details</span>
              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
