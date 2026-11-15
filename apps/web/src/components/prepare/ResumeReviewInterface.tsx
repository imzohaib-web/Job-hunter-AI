import {
  Building,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  Loader2,
  Lock,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompanyResearchTab } from "./CompanyResearchTab";
import { FabricationAtsReport } from "./FabricationAtsReport";
import { ResumeDiffEditor, type ReviewDecision } from "./ResumeDiffEditor";
import { useApproveChangesMutation, type ArtifactEntity } from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";
import { downloadResumeDocx, downloadResumePdf, type ResumeSectionContent } from "@/utils/exportResume";
import type { AtsReport, CompanyInsight, FabricationReport, JobEntity, MatchEntity, ResumeChange } from "@jobpilot/shared";

interface ResumeReviewInterfaceProps {
  match?: MatchEntity | null;
  resumeArtifact: ArtifactEntity;
  companyArtifact?: ArtifactEntity | null;
  className?: string;
}

export function ResumeReviewInterface({
  match,
  resumeArtifact,
  companyArtifact,
  className = "",
}: ResumeReviewInterfaceProps) {
  // Only two tabs allowed: "resume" and "company"
  const [activeTab, setActiveTab] = useState<"resume" | "company">("resume");
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Content extraction from resume artifact
  const resumeContent = resumeArtifact.content || {};
  const sections = (resumeContent.sections as ResumeSectionContent) || {};
  const changes = useMemo(() => {
    return Array.isArray(resumeContent.changes)
      ? (resumeContent.changes as Array<ResumeChange & { id?: string; approved?: boolean }>)
      : [];
  }, [resumeContent.changes]);
  const keywordPlan = Array.isArray(resumeContent.keyword_plan)
    ? (resumeContent.keyword_plan as Array<{ keyword: string; is_gap?: boolean; evidence?: string | null }>)
    : [];
  const atsReport: AtsReport | undefined = resumeContent.ats_report as AtsReport | undefined;
  const fabricationReport: FabricationReport | undefined =
    (resumeArtifact.fabricationReport as unknown as FabricationReport) ||
    (resumeContent.fabrication_report as unknown as FabricationReport);

  // Company insight content
  const companyInsight: CompanyInsight | undefined = companyArtifact?.content as unknown as CompanyInsight | undefined;

  // Track review decisions per change index
  const [decisions, setDecisions] = useState<Record<number, ReviewDecision>>(() => {
    const initial: Record<number, ReviewDecision> = {};
    changes.forEach((c, idx: number) => {
      if (c.approved === true) {
        initial[idx] = "accepted";
      } else if (c.approved === false) {
        initial[idx] = "rejected";
      } else {
        initial[idx] = "pending";
      }
    });
    return initial;
  });

  const approveChangesMutation = useApproveChangesMutation();

  // Statistics
  const totalChanges = changes.length;
  const pendingCount = useMemo(() => {
    return changes.filter((_: unknown, idx: number) => (decisions[idx] || "pending") === "pending").length;
  }, [changes, decisions]);

  const acceptedCount = useMemo(() => {
    return Object.values(decisions).filter((d) => d === "accepted").length;
  }, [decisions]);

  const rejectedCount = useMemo(() => {
    return Object.values(decisions).filter((d) => d === "rejected").length;
  }, [decisions]);

  // Export is enabled ONLY when every proposed change has been explicitly reviewed (0 pending)
  const isExportEnabled = totalChanges === 0 || pendingCount === 0;

  // Handle individual decision changes
  const handleDecisionChange = (index: number, decision: ReviewDecision) => {
    setDecisions((prev) => ({
      ...prev,
      [index]: decision,
    }));
  };

  // Bulk actions
  const handleAcceptAll = () => {
    const next: Record<number, ReviewDecision> = {};
    changes.forEach((_: unknown, idx: number) => {
      next[idx] = "accepted";
    });
    setDecisions(next);
    toast.success(`Accepted all ${changes.length} proposed modifications.`);
  };

  const handleRejectAll = () => {
    const next: Record<number, ReviewDecision> = {};
    changes.forEach((_: unknown, idx: number) => {
      next[idx] = "rejected";
    });
    setDecisions(next);
    toast.info(`Rejected all ${changes.length} modifications; original phrasing preserved.`);
  };

  // Persist decisions and trigger export
  const handleExport = async (format: "docx" | "pdf") => {
    if (!isExportEnabled) {
      toast.info(
        `Please review all changes before exporting (${pendingCount} pending).`,
        "Review Incomplete",
      );
      return;
    }

    try {
      if (format === "docx") setIsExportingDocx(true);
      if (format === "pdf") setIsExportingPdf(true);

      // 1. Commit decisions to backend artifact
      const decisionPayload = changes.map((c, index: number) => ({
        id: c.id,
        section: c.section,
        index,
        accepted: decisions[index] === "accepted",
      }));

      await approveChangesMutation.mutateAsync({
        artifactId: resumeArtifact._id,
        payload: { decisions: decisionPayload },
      });

      // 2. Download file
      if (format === "docx") {
        await downloadResumeDocx(resumeArtifact._id);
        toast.success("Tailored resume DOCX downloaded successfully!", "Export Complete");
      } else {
        await downloadResumePdf(resumeArtifact._id, sections);
        toast.success("Tailored resume PDF downloaded successfully!", "Export Complete");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      toast.error(message, "Export Error");
    } finally {
      setIsExportingDocx(false);
      setIsExportingPdf(false);
    }
  };

  // Job details
  const job = match?.job || (typeof match?.jobId === "object" ? (match?.jobId as JobEntity) : null);
  const jobTitle = job?.title || "Target Role";
  const companyName = job?.company || companyInsight?.company_name || "Target Company";
  const jobLocation = job?.location || "Location";

  return (
    <div className={`space-y-6 animate-fade-in ${className}`} data-testid="resume-review-interface">
      {/* Top Header & Export Toolbar Card */}
      <Card className="border shadow-md bg-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Target Role & Match Info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Application Preparation Complete
              </span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="text-xs text-muted-foreground">Tailored Resume Ready</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              {jobTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground flex items-center gap-1">
                <Building className="h-3.5 w-3.5 text-primary" />
                <span>{companyName}</span>
              </span>
              <span>•</span>
              <span>{jobLocation}</span>
              {match?.score !== undefined && (
                <>
                  <span>•</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {match.score}% Match Score
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Export Actions & Review Guard Status */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Review Status Guard Badge */}
            <div
              data-testid="export-review-guard-status"
              className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
                isExportEnabled
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-medium"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300 font-medium"
              }`}
            >
              {isExportEnabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>All changes reviewed ({acceptedCount} accepted, {rejectedCount} rejected)</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Review all changes to export ({pendingCount} pending)</span>
                </>
              )}
            </div>

            {/* Functional Export Buttons */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                data-testid="export-docx-btn"
                onClick={() => handleExport("docx")}
                disabled={!isExportEnabled || isExportingDocx || isExportingPdf}
                className="gap-1.5 text-xs font-semibold shadow-sm"
              >
                {isExportingDocx ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Exporting DOCX...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="h-3.5 w-3.5" />
                    <span>Download DOCX</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="export-pdf-btn"
                onClick={() => handleExport("pdf")}
                disabled={!isExportEnabled || isExportingDocx || isExportingPdf}
                className="gap-1.5 text-xs font-semibold"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Exporting PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>Download PDF</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Navigation Header (Strictly ONLY Resume and Company) */}
        <div className="mt-6 pt-4 border-t flex items-center gap-3" data-testid="review-tabs">
          <button
            type="button"
            data-testid="tab-resume"
            onClick={() => setActiveTab("resume")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "resume"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Resume</span>
            <Badge
              variant="outline"
              className={`text-[10px] ml-1 ${
                activeTab === "resume"
                  ? "border-primary-foreground/30 text-primary-foreground"
                  : ""
              }`}
            >
              {totalChanges} changes
            </Badge>
          </button>

          <button
            type="button"
            data-testid="tab-company"
            onClick={() => setActiveTab("company")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "company"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Building className="h-4 w-4" />
            <span>Company</span>
            {companyInsight?.confidence && (
              <Badge
                variant="outline"
                className={`text-[10px] ml-1 ${
                  activeTab === "company"
                    ? "border-primary-foreground/30 text-primary-foreground"
                    : ""
                }`}
              >
                {Math.round(companyInsight.confidence * 100)}%
              </Badge>
            )}
          </button>
        </div>
      </Card>

      {/* Tab Panels */}
      {activeTab === "resume" && (
        <div className="space-y-6">
          {/* Prominent Fabrication & ATS Report */}
          <FabricationAtsReport
            fabricationReport={fabricationReport}
            atsReport={atsReport}
            keywordPlan={keywordPlan}
          />

          {/* Professional Side-by-Side Diff Editor */}
          <ResumeDiffEditor
            originalProfile={sections}
            tailoredSections={sections}
            changes={changes}
            decisions={decisions}
            onDecisionChange={handleDecisionChange}
            onAcceptAll={handleAcceptAll}
            onRejectAll={handleRejectAll}
          />
        </div>
      )}

      {activeTab === "company" && (
        <div>
          <CompanyResearchTab
            companyInsight={companyInsight}
            targetCompanyName={companyName}
          />
        </div>
      )}
    </div>
  );
}
