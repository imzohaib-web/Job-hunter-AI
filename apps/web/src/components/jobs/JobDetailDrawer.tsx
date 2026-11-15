import DOMPurify from "dompurify";
import {
  AlertCircle,
  Bookmark,
  Building,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyInsightCard } from "./CompanyInsightCard";
import { formatSalaryDisplay } from "./jobUtils";
import { MatchScoreBadge } from "./MatchScoreBadge";
import { ScoreBreakdownBar } from "./ScoreBreakdownBar";
import { toast } from "@/stores/toastStore";
import type { CompanyInsight, JobEntity, MatchEntity } from "@jobpilot/shared";

interface JobDetailDrawerProps {
  match: MatchEntity | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved?: boolean;
  onToggleSave: (jobId: string, currentlySaved: boolean) => Promise<void> | void;
  onPrepareApplication: (matchId: string) => Promise<void> | void;
  isPreparing?: boolean;
}

export function JobDetailDrawer({
  match,
  isOpen,
  onClose,
  isSaved = false,
  onToggleSave,
  onPrepareApplication,
  isPreparing = false,
}: JobDetailDrawerProps) {
  // Local optimistic bookmark state
  const [saved, setSaved] = useState(Boolean(isSaved || match?.isSaved));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (match) {
      setSaved(Boolean(isSaved || match.isSaved));
    }
  }, [match, isSaved]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !match) {
    return null;
  }

  // Resolve job object
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

  // Sanitise description with DOMPurify
  const rawDescription = job.description || "No description provided.";
  const sanitizedDescription = DOMPurify.sanitize(rawDescription, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "b",
      "i",
      "em",
      "strong",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "span",
      "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });

  const formattedSalary = formatSalaryDisplay(job.salary);
  const isDemo = Boolean(job.isDemo ?? (job as unknown as Record<string, unknown>).is_demo);

  // Extract Company Insight if present
  const insight =
    (job.companyInsight as CompanyInsight | undefined) ??
    ((match as unknown as Record<string, unknown>).companyInsight as CompanyInsight | undefined);

  const handleBookmarkToggle = async () => {
    if (isSaving) return;
    const previousState = saved;
    const nextState = !previousState;
    setSaved(nextState);
    setIsSaving(true);

    try {
      await onToggleSave(job._id, previousState);
      toast.success(
        nextState ? "Job saved to bookmarks" : "Job removed from bookmarks",
        nextState ? "Saved" : "Unsaved",
      );
    } catch {
      setSaved(previousState);
      toast.error("Failed to update bookmark status", "Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrepareClick = async () => {
    try {
      await onPrepareApplication(match._id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to trigger preparation";
      toast.error(msg, "Application Prep Failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`${job.title} at ${job.company}`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative z-50 flex h-full w-full max-w-2xl flex-col bg-card shadow-2xl border-l animate-slide-left">
        {/* Top Header */}
        <div className="flex items-start justify-between border-b p-5 pb-4 bg-muted/20">
          <div className="space-y-1.5 flex-1 pr-4">
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
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]"
                >
                  <Globe className="mr-1 h-3 w-3" />
                  Remote
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
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

            <h2 className="text-xl font-bold text-foreground leading-snug">{job.title}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{job.company}</span>
              {job.location && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {job.location}
                  </span>
                </>
              )}
              {formattedSalary && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formattedSalary}
                  </span>
                </>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Match Score & Breakdown Card */}
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Match Evaluation
                </h3>
                <p className="text-xs text-muted-foreground">
                  AI scoring based on your verified skills, experience, and profile
                </p>
              </div>
              <MatchScoreBadge score={match.score} size="md" showLabel />
            </div>

            {/* Score Breakdown Bar Chart */}
            <div className="pt-2">
              <ScoreBreakdownBar breakdown={match.breakdown} />
            </div>

            {/* Explanation narrative */}
            {match.explanation && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                <span className="font-semibold text-primary block mb-1">AI Match Summary:</span>
                <p>{match.explanation}</p>
              </div>
            )}
          </div>

          {/* Matched vs Missing Skills Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Matched skills */}
            <div className="rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                <span>Matched Skills ({match.matchedSkills?.length || 0})</span>
              </div>
              {match.matchedSkills && match.matchedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {match.matchedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                    >
                      <Check className="h-3 w-3 shrink-0" />
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No direct skill overlaps identified.</p>
              )}
            </div>

            {/* Missing skills */}
            <div className="rounded-xl border bg-amber-500/5 border-amber-500/20 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <span>Missing Skills ({match.missingSkills?.length || 0})</span>
              </div>
              {match.missingSkills && match.missingSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {match.missingSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-amber-500/30"
                    >
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  You possess all primary required skills!
                </p>
              )}
            </div>
          </div>

          {/* Company Insight Card if available */}
          {insight && (
            <div className="space-y-2">
              <CompanyInsightCard insight={insight} companyName={job.company} />
            </div>
          )}

          {/* Full Job Description Sanitised with DOMPurify */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" />
              Job Description
            </h3>

            <div
              className="prose prose-sm dark:prose-invert max-w-none rounded-xl border bg-card p-4 text-xs leading-relaxed text-foreground/90 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
            />
          </div>
        </div>

        {/* Bottom Actions Toolbar */}
        <div className="border-t bg-card p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBookmarkToggle}
            disabled={isSaving}
            className={`gap-1.5 text-xs font-medium ${
              saved ? "text-primary border-primary/40 bg-primary/5" : ""
            }`}
          >
            <Bookmark className={`h-4 w-4 ${saved ? "fill-primary" : ""}`} />
            <span>{saved ? "Saved in Bookmarks" : "Save Job"}</span>
          </Button>

          <div className="flex items-center gap-2">
            {job.url && job.url !== "#" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 text-xs font-medium"
              >
                <a href={job.url} target="_blank" rel="noopener noreferrer">
                  <span>Open Original Posting</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handlePrepareClick}
              disabled={isPreparing}
              className="gap-1.5 text-xs font-semibold shadow-sm"
            >
              {isPreparing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Preparing Materials...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Prepare Application</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
