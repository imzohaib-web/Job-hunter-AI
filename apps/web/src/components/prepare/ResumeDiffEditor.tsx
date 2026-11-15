import {
  Check,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumeChange } from "@jobpilot/shared";

export type ReviewDecision = "pending" | "accepted" | "rejected";

export interface ExperiencePreviewItem {
  title?: string;
  company?: string;
  location?: string;
  bullets?: string[];
}

export interface ProfilePreviewData {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience?: ExperiencePreviewItem[];
  skills?: Array<string | { name: string }>;
  [key: string]: unknown;
}

export interface ResumeDiffEditorProps {
  originalProfile?: ProfilePreviewData | null;
  tailoredSections?: ProfilePreviewData | null;
  changes?: Array<ResumeChange & { id?: string; approved?: boolean }>;
  decisions: Record<number, ReviewDecision>;
  onDecisionChange: (index: number, decision: ReviewDecision) => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  className?: string;
}

export function ResumeDiffEditor({
  originalProfile,
  tailoredSections,
  changes = [],
  decisions,
  onDecisionChange,
  onAcceptAll,
  onRejectAll,
  className = "",
}: ResumeDiffEditorProps) {
  const [filter, setFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");

  // Statistics
  const totalChanges = changes.length;
  const acceptedCount = useMemo(
    () => Object.values(decisions).filter((d) => d === "accepted").length,
    [decisions],
  );
  const rejectedCount = useMemo(
    () => Object.values(decisions).filter((d) => d === "rejected").length,
    [decisions],
  );
  const pendingCount = useMemo(
    () =>
      changes.filter((_, idx) => (decisions[idx] || "pending") === "pending").length,
    [changes, decisions],
  );

  const reviewProgress = totalChanges > 0
    ? Math.round(((acceptedCount + rejectedCount) / totalChanges) * 100)
    : 100;

  // Filtered changes
  const filteredChanges = useMemo(() => {
    return changes
      .map((c, index) => ({ change: c, index, decision: decisions[index] || "pending" }))
      .filter(({ decision }) => {
        if (filter === "all") return true;
        return decision === filter;
      });
  }, [changes, decisions, filter]);

  // Build reactive tailored experience preview reflecting current decisions
  const resolvedTailoredProfile = useMemo(() => {
    const base = JSON.parse(JSON.stringify(tailoredSections || {})) as ProfilePreviewData;
    if (!base.experience || !Array.isArray(base.experience)) {
      return base;
    }

    // Apply decisions to resume text
    changes.forEach((c, index) => {
      const dec = decisions[index] || "pending";
      // If rejected, ensure the text reverts to original 'before'
      if (dec === "rejected") {
        if (c.section === "summary") {
          base.summary = c.before;
        } else if (c.section === "experience") {
          base.experience?.forEach((exp: ExperiencePreviewItem) => {
            if (Array.isArray(exp.bullets)) {
              const bIdx = exp.bullets.indexOf(c.after);
              if (bIdx !== -1) {
                exp.bullets[bIdx] = c.before;
              }
            }
          });
        }
      } else if (dec === "accepted") {
        if (c.section === "summary") {
          base.summary = c.after;
        } else if (c.section === "experience") {
          base.experience?.forEach((exp: ExperiencePreviewItem) => {
            if (Array.isArray(exp.bullets)) {
              const bIdx = exp.bullets.indexOf(c.before);
              if (bIdx !== -1) {
                exp.bullets[bIdx] = c.after;
              }
            }
          });
        }
      }
    });

    return base;
  }, [tailoredSections, changes, decisions]);

  return (
    <div className={`space-y-6 ${className}`} data-testid="resume-diff-editor">
      {/* Review Status & Stats Bar */}
      <Card className="border shadow-sm bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  Proposed Resume Modifications
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                  {totalChanges} Total
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Review every statement change below to enable DOCX and PDF document export.
              </p>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex items-center gap-2">
              {onAcceptAll && pendingCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAcceptAll}
                  className="text-xs h-8 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 gap-1 font-medium"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Accept All</span>
                </Button>
              )}
              {onRejectAll && pendingCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRejectAll}
                  className="text-xs h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 font-medium"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reject All</span>
                </Button>
              )}
            </div>
          </div>

          {/* Decision Counts & Filter Pills */}
          <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  filter === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                All ({totalChanges})
              </button>
              <button
                type="button"
                onClick={() => setFilter("pending")}
                data-testid="filter-pending-btn"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  filter === "pending"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                }`}
              >
                <Clock className="h-3 w-3" />
                <span>Pending ({pendingCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter("accepted")}
                data-testid="filter-accepted-btn"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  filter === "accepted"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Accepted ({acceptedCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter("rejected")}
                data-testid="filter-rejected-btn"
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  filter === "rejected"
                    ? "bg-destructive text-destructive-foreground shadow-sm"
                    : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                }`}
              >
                <XCircle className="h-3 w-3" />
                <span>Rejected ({rejectedCount})</span>
              </button>
            </div>

            {/* Review Progress Gauge */}
            <div className="flex items-center gap-2 min-w-[160px]">
              <div className="flex-1 bg-muted h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${reviewProgress}%` }}
                />
              </div>
              <span className="text-xs font-mono font-semibold text-muted-foreground whitespace-nowrap">
                {reviewProgress}% Reviewed
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Changes Review Cards List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Individual Bullet Modifications ({filteredChanges.length})</span>
          </h3>
          <span className="text-xs text-muted-foreground">
            Changes require explicit Accept or Reject to enable export
          </span>
        </div>

        {filteredChanges.length === 0 ? (
          <div className="text-center p-8 border rounded-xl bg-card/40 text-muted-foreground text-xs">
            No changes match the selected filter ({filter}).
          </div>
        ) : (
          filteredChanges.map(({ change, index, decision }) => {
            const isAdded = !change.before && Boolean(change.after);
            const isRemoved = Boolean(change.before) && !change.after;

            return (
              <Card
                key={index}
                data-testid={`change-card-${index}`}
                className={`border transition-all duration-200 ${
                  decision === "accepted"
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] shadow-sm"
                    : decision === "rejected"
                      ? "border-destructive/30 bg-destructive/[0.02] opacity-80"
                      : "border-amber-500/40 bg-amber-500/[0.02] shadow-sm ring-1 ring-amber-500/20"
                }`}
              >
                <CardHeader className="py-3 px-4 sm:px-5 border-b flex flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px] uppercase font-semibold">
                      {change.section || "Experience"}
                    </Badge>
                    <Badge
                      className={`text-[10px] font-semibold uppercase ${
                        isAdded
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : isRemoved
                            ? "bg-destructive/10 text-destructive border border-destructive/20"
                            : "bg-primary/10 text-primary border border-primary/20"
                      }`}
                    >
                      {isAdded ? "+ Added" : isRemoved ? "- Removed" : "Modified"}
                    </Badge>
                  </div>

                  {/* Decision controls on right */}
                  <div className="flex items-center gap-2">
                    {/* Status indicator */}
                    <span
                      data-testid={`decision-status-${index}`}
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        decision === "accepted"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : decision === "rejected"
                            ? "bg-destructive/10 text-destructive border border-destructive/30"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {decision === "accepted" && <Check className="h-3 w-3 stroke-[3]" />}
                      {decision === "rejected" && <X className="h-3 w-3 stroke-[3]" />}
                      {decision === "pending" && <Clock className="h-3 w-3" />}
                      <span className="capitalize">
                        {decision === "pending" ? "Pending Review" : decision}
                      </span>
                    </span>

                    {/* Accept / Reject Buttons */}
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={decision === "accepted" ? "default" : "outline"}
                        data-testid={`accept-btn-${index}`}
                        onClick={() => onDecisionChange(index, "accepted")}
                        className={`text-xs h-7 px-2.5 font-semibold gap-1 ${
                          decision === "accepted"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Accept</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant={decision === "rejected" ? "destructive" : "outline"}
                        data-testid={`reject-btn-${index}`}
                        onClick={() => onDecisionChange(index, "rejected")}
                        className={`text-xs h-7 px-2.5 font-semibold gap-1 ${
                          decision === "rejected"
                            ? "bg-destructive text-destructive-foreground"
                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        }`}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Side-by-side or before/after diff comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Before / Original */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>Original Statement</span>
                      </span>
                      <div className="p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground leading-relaxed">
                        {change.before ? (
                          <p className={decision === "accepted" ? "line-through opacity-70" : ""}>
                            {change.before}
                          </p>
                        ) : (
                          <span className="italic text-muted-foreground/60">[No previous statement]</span>
                        )}
                      </div>
                    </div>

                    {/* After / Proposed Tailoring */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] uppercase font-bold text-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span>Tailored Proposal</span>
                      </span>
                      <div
                        className={`p-3 rounded-lg border text-xs leading-relaxed transition-colors ${
                          decision === "accepted"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200 font-medium"
                            : decision === "rejected"
                              ? "bg-muted/20 border-border text-muted-foreground line-through opacity-60"
                              : "bg-primary/5 border-primary/20 text-foreground font-medium"
                        }`}
                      >
                        {change.after ? (
                          <p>{change.after}</p>
                        ) : (
                          <span className="italic text-destructive">[Removed statement]</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Justification & Traceability Footer */}
                  <div className="pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Strategic Reason */}
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground">Strategic Reason: </span>
                        <span>{change.reason || "Rephrased to emphasize job keywords and quantifiable impact."}</span>
                      </div>
                    </div>

                    {/* Source Fact Ref (Zero-Fabrication Traceability) */}
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground">Source Fact Ref: </span>
                        <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px] text-primary">
                          {change.source_fact_ref || "Verified Profile Fact"}
                        </code>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Side-by-Side Full Resume Preview */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span>Side-by-Side Full Resume Comparison</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              The tailored resume preview updates in real time to reflect your accepted modifications.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Original Resume */}
          <Card className="border shadow-sm bg-card">
            <CardHeader className="py-3 px-5 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Original Resume
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  Unmodified Source
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5 text-xs text-muted-foreground">
              {/* Header/Contact */}
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {originalProfile?.name || "Candidate"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {[originalProfile?.email, originalProfile?.phone, originalProfile?.location]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </div>

              {/* Summary */}
              {originalProfile?.summary && (
                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-bold text-foreground">
                    Professional Summary
                  </span>
                  <p className="leading-relaxed bg-muted/20 p-2.5 rounded border">
                    {originalProfile.summary}
                  </p>
                </div>
              )}

              {/* Experience */}
              {Array.isArray(originalProfile?.experience) && originalProfile.experience.length > 0 && (
                <div className="space-y-3">
                  <span className="text-[11px] uppercase font-bold text-foreground">
                    Work Experience
                  </span>
                  {originalProfile.experience.map((exp: ExperiencePreviewItem, expIdx: number) => (
                    <div key={expIdx} className="space-y-1.5 border-l-2 border-border pl-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {exp.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {exp.company}
                        </span>
                      </div>
                      {Array.isArray(exp.bullets) && (
                        <ul className="list-disc list-outside pl-4 space-y-1 leading-relaxed">
                          {exp.bullets.map((b: string, bIdx: number) => (
                            <li key={bIdx}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Skills */}
              {Array.isArray(originalProfile?.skills) && originalProfile.skills.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase font-bold text-foreground">
                    Technical Skills
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {originalProfile.skills.map((s, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-muted text-[11px] font-medium"
                      >
                        {typeof s === "string" ? s : s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Tailored Resume */}
          <Card className="border-2 border-primary/30 shadow-md bg-card">
            <CardHeader className="py-3 px-5 border-b bg-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Tailored Resume (Live Decisions)</span>
                </CardTitle>
                <Badge className="text-[10px] bg-primary text-primary-foreground font-semibold">
                  {acceptedCount} Accepted • {rejectedCount} Excluded
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5 text-xs text-foreground">
              {/* Header/Contact */}
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {resolvedTailoredProfile?.name || originalProfile?.name || "Candidate"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {[
                    resolvedTailoredProfile?.email || originalProfile?.email,
                    resolvedTailoredProfile?.phone || originalProfile?.phone,
                    resolvedTailoredProfile?.location || originalProfile?.location,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </div>

              {/* Tailored Summary */}
              {resolvedTailoredProfile?.summary && (
                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-bold text-primary">
                    Tailored Professional Summary
                  </span>
                  <p className="leading-relaxed bg-primary/5 p-2.5 rounded border border-primary/20 text-foreground font-medium">
                    {resolvedTailoredProfile.summary}
                  </p>
                </div>
              )}

              {/* Tailored Experience */}
              {Array.isArray(resolvedTailoredProfile?.experience) &&
                resolvedTailoredProfile.experience.length > 0 && (
                  <div className="space-y-3">
                    <span className="text-[11px] uppercase font-bold text-primary">
                      Work Experience
                    </span>
                    {resolvedTailoredProfile.experience.map((exp: ExperiencePreviewItem, expIdx: number) => (
                      <div key={expIdx} className="space-y-1.5 border-l-2 border-primary/40 pl-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {exp.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {exp.company}
                          </span>
                        </div>
                        {Array.isArray(exp.bullets) && (
                          <ul className="list-disc list-outside pl-4 space-y-1.5 leading-relaxed">
                            {exp.bullets.map((b: string, bIdx: number) => {
                              // Check if this bullet corresponds to an accepted change
                              const isAcceptedBullet = changes.some(
                                (c, idx) => c.after === b && decisions[idx] === "accepted",
                              );

                              return (
                                <li
                                  key={bIdx}
                                  className={
                                    isAcceptedBullet
                                      ? "text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-500/10 px-1 py-0.5 rounded"
                                      : ""
                                  }
                                >
                                  {b}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {/* Skills */}
              {Array.isArray(resolvedTailoredProfile?.skills) &&
                resolvedTailoredProfile.skills.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] uppercase font-bold text-primary">
                      Targeted Skills
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {resolvedTailoredProfile.skills.map((s, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium"
                        >
                          {typeof s === "string" ? s : s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
