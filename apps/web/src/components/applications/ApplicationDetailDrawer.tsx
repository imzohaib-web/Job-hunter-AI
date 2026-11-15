import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookmarkCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Loader2,
  MapPin,
  Save,
  Sparkles,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ApplicationColumnStatus,
  type ApplicationDetailItem,
  useArtifactsQuery,
  useUpdateApplicationMutation,
} from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";
import { downloadResumeDocx, downloadResumePdf } from "@/utils/exportResume";

interface ApplicationDetailDrawerProps {
  app: ApplicationDetailItem | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, newStatus: ApplicationColumnStatus) => void;
}

export function ApplicationDetailDrawer({
  app,
  isOpen,
  onClose,
  onStatusChange,
}: ApplicationDetailDrawerProps) {
  const updateMutation = useUpdateApplicationMutation();

  const [notes, setNotes] = useState("");
  const [appliedDate, setAppliedDate] = useState("");
  const [isExporting, setIsExporting] = useState<string | null>(null);

  useEffect(() => {
    if (app) {
      setNotes(app.notes || "");
      if (app.appliedAt) {
        try {
          const d = new Date(app.appliedAt);
          if (!isNaN(d.getTime())) {
            setAppliedDate(d.toISOString().split("T")[0]);
          } else {
            setAppliedDate("");
          }
        } catch {
          setAppliedDate("");
        }
      } else {
        setAppliedDate("");
      }
    }
  }, [app]);

  // Escape key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Determine matchId before any early return to obey Rules of Hooks
  const match = typeof app?.matchId === "object" && app?.matchId !== null ? app.matchId : null;
  const matchId = match?._id ?? (typeof app?.matchId === "string" ? app?.matchId : undefined);

  // Fetch attached artifacts unconditionally
  const { data: artifacts, isLoading: isLoadingArtifacts } = useArtifactsQuery(
    isOpen ? matchId : undefined,
  );

  if (!isOpen || !app) return null;

  const job = typeof app.jobId === "object" && app.jobId !== null ? app.jobId : null;

  const handleSaveNotes = async () => {
    try {
      await updateMutation.mutateAsync({
        id: app._id,
        notes,
      });
      toast.success("Notes saved successfully");
    } catch {
      toast.error("Failed to save notes");
    }
  };

  const handleSaveAppliedDate = async () => {
    try {
      await updateMutation.mutateAsync({
        id: app._id,
        appliedAt: appliedDate ? new Date(appliedDate).toISOString() : null,
      });
      toast.success("Applied date updated");
    } catch {
      toast.error("Failed to update applied date");
    }
  };

  const handleStatusSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as ApplicationColumnStatus;
    if (newStatus === app.status) return;

    if (onStatusChange) {
      onStatusChange(app._id, newStatus);
    } else {
      try {
        await updateMutation.mutateAsync({
          id: app._id,
          status: newStatus,
        });
        toast.success(`Status updated to ${newStatus}`);
      } catch {
        toast.error("Failed to update status");
      }
    }
  };

  const handleDownloadDocx = async (artifactId: string) => {
    setIsExporting("docx");
    try {
      await downloadResumeDocx(artifactId);
      toast.success("Tailored resume downloaded (.docx)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download resume");
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadPdf = async (artifactId: string) => {
    setIsExporting("pdf");
    try {
      await downloadResumePdf(artifactId);
      toast.success("Tailored resume downloaded (.pdf)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setIsExporting(null);
    }
  };

  const getStatusIcon = (status: ApplicationColumnStatus) => {
    switch (status) {
      case "saved":
        return <BookmarkCheck className="h-4 w-4 text-blue-500" />;
      case "applied":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "interview":
        return <Sparkles className="h-4 w-4 text-purple-500" />;
      case "offer":
        return <Trophy className="h-4 w-4 text-emerald-500" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-rose-500" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in"
      data-testid="application-detail-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-role-title"
    >
      {/* Click outside backdrop to close */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />

      {/* Drawer panel */}
      <div className="relative w-full max-w-xl bg-card border-l shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-start justify-between border-b p-6 pb-4">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              <Building2 className="h-3.5 w-3.5" />
              <span>{job?.company ?? "Unknown Company"}</span>
              {job?.location && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-normal lowercase capitalize text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                  </span>
                </>
              )}
            </div>
            <h2
              id="drawer-role-title"
              className="text-xl font-bold tracking-tight text-foreground truncate"
            >
              {job?.title ?? "Application Details"}
            </h2>

            {/* Status change select */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(app.status)}
                <select
                  value={app.status}
                  onChange={handleStatusSelect}
                  aria-label="Application status"
                  className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="saved">Saved</option>
                  <option value="applied">Applied</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {match?.score !== undefined && (
                <Badge variant={match.score >= 80 ? "success" : "default"}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  {match.score}% Match Score
                </Badge>
              )}

              {job?.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
                >
                  Job Posting
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full shrink-0"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Applied Date Picker */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="applied-date-input"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Applied Date
              </label>
              {app.appliedAt && (
                <span className="text-[11px] text-muted-foreground">
                  Current: {new Date(app.appliedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="applied-date-input"
                type="date"
                value={appliedDate}
                onChange={(e) => setAppliedDate(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveAppliedDate}
                disabled={updateMutation.isPending}
                className="shrink-0 h-8 text-xs"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Set Date"
                )}
              </Button>
            </div>
          </div>

          {/* 2. Notes Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Application Notes
              </h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSaveNotes}
                disabled={updateMutation.isPending}
                className="h-7 text-xs gap-1.5"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    Save Notes
                  </>
                )}
              </Button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add interview contacts, salary discussions, referral info, or next steps..."
              rows={4}
              className="w-full rounded-md border bg-background p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* 3. Attached Artifacts (Resume, Cover Letter) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5 text-primary" />
                Attached Artifacts
              </h3>
              {matchId && (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Link to={`/prepare/${matchId}`}>
                    Open Resume Editor
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>

            {isLoadingArtifacts ? (
              <div className="flex items-center justify-center p-6 rounded-lg border bg-muted/20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : artifacts && artifacts.length > 0 ? (
              <div className="space-y-2">
                {artifacts.map((art) => (
                  <div
                    key={art._id}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground capitalize">
                          {art.type.replace("_", " ")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          v{art.version} • {new Date(art.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {art.type === "tailored_resume" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2"
                            disabled={isExporting !== null}
                            onClick={() => handleDownloadDocx(art._id)}
                          >
                            DOCX
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2"
                            disabled={isExporting !== null}
                            onClick={() => handleDownloadPdf(art._id)}
                          >
                            PDF
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-center bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  No tailored documents generated for this application yet.
                </p>
                {matchId && (
                  <Button asChild size="sm" className="mt-3 gap-1.5 text-xs">
                    <Link to={`/prepare/${matchId}`}>
                      <Sparkles className="h-3.5 w-3.5" />
                      Prepare Application & Tailor Resume
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 4. Status Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Status Timeline
            </h3>

            {app.statusHistory && app.statusHistory.length > 0 ? (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {app.statusHistory.map((entry, idx) => (
                  <div key={idx} className="relative group">
                    {/* Bullet */}
                    <div className="absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="capitalize text-[11px] px-2 py-0 font-medium"
                        >
                          {entry.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(entry.changedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {entry.note && (
                        <p className="mt-1 text-xs text-foreground/80 bg-muted/40 rounded px-2.5 py-1 border border-border/40">
                          {entry.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No status transitions recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
