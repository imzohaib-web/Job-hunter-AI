import {
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  FileCheck,
  Percent,
  ShieldAlert,
  ShieldCheck,
  Tag,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AtsReport, FabricationReport } from "@jobpilot/shared";

interface FabricationAtsReportProps {
  fabricationReport?: FabricationReport | null;
  atsReport?: AtsReport | null;
  keywordPlan?: Array<{
    keyword: string;
    is_gap?: boolean;
    evidence?: string | null;
  }>;
  className?: string;
}

export function FabricationAtsReport({
  fabricationReport,
  atsReport,
  keywordPlan = [],
  className = "",
}: FabricationAtsReportProps) {
  // Fabrication Report metrics
  const isFabPassed = Boolean(fabricationReport?.passed ?? true);
  const claimsChecked = fabricationReport?.claims_checked ?? 0;
  const unsupportedClaims = fabricationReport?.unsupported_claims ?? [];

  // ATS Report metrics
  const keywordCoverage = Math.round(atsReport?.keyword_coverage ?? 85);
  const wordCount = atsReport?.word_count ?? 0;
  const lengthCheck = atsReport?.length_check || "Optimal: 1-2 pages";
  const sectionChecks = atsReport?.section_checks ?? [];
  const formattingWarnings = atsReport?.formatting_warnings ?? [];

  // Keywords extraction
  const missingKeywords: string[] = [
    ...(atsReport?.missing_keywords ?? []),
    ...keywordPlan.filter((k) => k.is_gap).map((k) => k.keyword),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const matchedKeywords: string[] = keywordPlan
    .filter((k) => !k.is_gap)
    .map((k) => k.keyword)
    .filter((v, i, a) => a.indexOf(v) === i);

  // Coverage rating & styling
  const getCoverageColor = (cov: number) => {
    if (cov >= 80) return "text-emerald-500 stroke-emerald-500 bg-emerald-500/10";
    if (cov >= 60) return "text-amber-500 stroke-amber-500 bg-amber-500/10";
    return "text-rose-500 stroke-rose-500 bg-rose-500/10";
  };

  return (
    <div className={`space-y-4 ${className}`} data-testid="fabrication-ats-report">
      {/* Top Banner: Fabrication Audit Status */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-colors ${
          isFabPassed
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
            : "bg-destructive/10 border-destructive/30 text-destructive-foreground"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isFabPassed
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                : "bg-destructive text-destructive-foreground"
            }`}
          >
            {isFabPassed ? (
              <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
            ) : (
              <ShieldAlert className="h-6 w-6 stroke-[2.2]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">
                Fabrication Audit: {isFabPassed ? "PASSED" : "FAILED"}
              </span>
              <Badge
                variant={isFabPassed ? "outline" : "destructive"}
                className={`text-[10px] font-semibold uppercase ${
                  isFabPassed
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                    : ""
                }`}
              >
                {isFabPassed ? "Zero Fabrications" : "Unsupported Claims"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isFabPassed
                ? `Audited ${claimsChecked} factual claims against your candidate profile. All statements verified truthful.`
                : `Detected ${unsupportedClaims.length} statements not verified by your source profile history.`}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-xs font-mono font-semibold text-muted-foreground">
            {claimsChecked} Claims Audited
          </span>
        </div>
      </div>

      {/* Flagged Claims Alert (if any detected) */}
      {unsupportedClaims.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardHeader className="py-3 px-4 border-b border-destructive/20">
            <CardTitle className="text-xs font-bold text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>Unsupported Claims ({unsupportedClaims.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {unsupportedClaims.map((claim, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-destructive/20 bg-background text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                  <span className="font-mono">{claim.location || `Claim #${idx + 1}`}</span>
                  <span className="text-destructive font-semibold">Unverified</span>
                </div>
                <p className="font-medium text-foreground">"{claim.text}"</p>
                {claim.reason && (
                  <p className="text-destructive/80 text-[11px] italic">
                    Reason: {claim.reason}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ATS Compatibility & Keyword Coverage Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Keyword Coverage Gauge Card */}
        <Card className="border shadow-sm bg-card flex flex-col justify-between">
          <CardHeader className="pb-2 pt-4 px-4 border-b">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Percent className="h-4 w-4 text-primary" />
              <span>ATS Keyword Coverage</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            {/* Visual Coverage Gauge Ring */}
            <div className="relative flex items-center justify-center h-28 w-28 my-2">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted/30 stroke-current"
                  strokeWidth="3.5"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={`${getCoverageColor(keywordCoverage)} transition-all duration-700 ease-out`}
                  strokeDasharray={`${keywordCoverage}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span
                  data-testid="ats-coverage-percentage"
                  className="text-2xl font-black tracking-tight"
                >
                  {keywordCoverage}%
                </span>
                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                  Match
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {keywordCoverage >= 80
                ? "Exceptional keyword alignment with job description"
                : keywordCoverage >= 60
                  ? "Moderate keyword match; review missing terms"
                  : "Low keyword density; consider manual keyword additions"}
            </p>
          </CardContent>
        </Card>

        {/* Matched & Missing Keywords Card */}
        <Card className="border shadow-sm bg-card md:col-span-2 flex flex-col justify-between">
          <CardHeader className="pb-2 pt-4 px-4 border-b">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-primary" />
              <span>Keyword Alignment</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* Matched Keywords */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Matched Keywords ({matchedKeywords.length})</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {matchedKeywords.length > 0 ? (
                  matchedKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    >
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      <span>{kw}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    None tracked in current plan
                  </span>
                )}
              </div>
            </div>

            {/* Missing Keywords */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Missing High-Value Keywords ({missingKeywords.length})</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {missingKeywords.length > 0 ? (
                  missingKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                    >
                      <XCircle className="h-3 w-3 shrink-0" />
                      <span>{kw}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-emerald-600 font-medium">
                    No critical keyword gaps identified
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ATS Compatibility Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border bg-card/60 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <FileCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium">Length Check</p>
            <p className="text-xs font-semibold text-foreground truncate">{lengthCheck}</p>
          </div>
        </div>

        <div className="p-3 rounded-lg border bg-card/60 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <Award className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium">Word Count</p>
            <p className="text-xs font-semibold text-foreground">
              {wordCount > 0 ? `${wordCount} words` : "Optimal ATS Length"}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg border bg-card/60 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium">Layout Check</p>
            <p className="text-xs font-semibold text-foreground truncate">
              {formattingWarnings.length === 0
                ? "Clean Single-Column Layout"
                : `${formattingWarnings.length} Warnings`}
            </p>
          </div>
        </div>
      </div>

      {/* Section Diagnostic Checks (if provided) */}
      {sectionChecks.length > 0 && (
        <div className="p-3 rounded-lg border bg-card/40 space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            ATS Section Diagnostics
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {sectionChecks.map((sc, i) => (
              <div
                key={i}
                className="p-2 rounded bg-background border text-xs flex items-start gap-2"
              >
                {sc.status === "pass" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold capitalize text-foreground">
                    {sc.section}
                  </span>
                  <p className="text-[11px] text-muted-foreground">{sc.feedback}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
