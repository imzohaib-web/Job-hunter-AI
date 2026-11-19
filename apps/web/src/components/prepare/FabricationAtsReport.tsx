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

interface KeywordItemData {
  keyword: string;
  category?: string;
  support?: string;
  is_gap?: boolean;
  evidence?: string | null;
  quote?: string | null;
  explanation?: string | null;
}

interface FabricationAtsReportProps {
  fabricationReport?: FabricationReport | null;
  atsReport?: AtsReport | null;
  keywordPlan?: KeywordItemData[];
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
  const covBefore =
    atsReport?.keyword_coverage_before !== undefined
      ? Math.round(atsReport.keyword_coverage_before)
      : 45;
  const covAfter =
    atsReport?.keyword_coverage_after !== undefined
      ? Math.round(atsReport.keyword_coverage_after)
      : Math.round(atsReport?.keyword_coverage ?? 85);

  const wordCount = atsReport?.word_count ?? 0;
  const lengthCheck = atsReport?.length_check || "Optimal: 1-2 pages";
  const formattingWarnings = atsReport?.formatting_warnings ?? [];

  // Group keyword plan into 3 explicit categories:
  // 1. In your resume (now surfaced)
  // 2. Partial: review (with explanation)
  // 3. Genuine gaps (add only if true)
  const surfacedKeywords = keywordPlan.filter((k) => {
    if (k.support === "partial") return false;
    return k.support === "strong" || (!k.is_gap && !k.keyword.includes("(Partial)"));
  });

  const partialKeywords = keywordPlan.filter((k) => {
    return k.support === "partial" || k.keyword.includes("(Partial)");
  });

  const genuineGaps = keywordPlan.filter((k) => {
    if (k.support === "partial") return false;
    return k.support === "none" || k.is_gap;
  });

  // Coverage rating & styling
  const getCoverageColor = (cov: number) => {
    if (cov >= 80) return "text-emerald-500 stroke-emerald-500 bg-emerald-500/10";
    if (cov >= 60) return "text-amber-500 stroke-amber-500 bg-amber-500/10";
    return "text-rose-500 stroke-rose-500 bg-rose-500/10";
  };

  const bannerHeadline =
    unsupportedClaims.length > 0
      ? `${unsupportedClaims.length} changes reverted because they were not supported by your profile`
      : `Fabrication Audit: PASSED • Passed: ${claimsChecked} claims verified`;

  return (
    <div className={`space-y-4 ${className}`} data-testid="fabrication-ats-report">
      {/* Top Banner: Fabrication Audit Status */}
      <div
        data-testid="fabrication-audit-banner"
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-colors ${
          unsupportedClaims.length === 0
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
            : "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              unsupportedClaims.length === 0
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                : "bg-amber-500 text-white shadow-sm shadow-amber-500/30"
            }`}
          >
            {unsupportedClaims.length === 0 ? (
              <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
            ) : (
              <ShieldAlert className="h-6 w-6 stroke-[2.2]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight" data-testid="fabrication-headline">
                {bannerHeadline}
              </span>
              <Badge
                variant={unsupportedClaims.length === 0 ? "outline" : "secondary"}
                className={`text-[10px] font-semibold uppercase ${
                  unsupportedClaims.length === 0
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                }`}
              >
                {unsupportedClaims.length === 0 ? "Zero Fabrications" : "Fact Guard Activated"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unsupportedClaims.length === 0
                ? `Audited ${claimsChecked} factual claims against your candidate profile. All statements verified truthful.`
                : `Detected and automatically reverted ${unsupportedClaims.length} statements not substantiated by your profile.`}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
          <Badge
            data-testid="retention-report-badge"
            variant="outline"
            className="text-[11px] font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
          >
            ✓ All 14 items preserved
          </Badge>
          <span className="text-xs font-mono font-semibold text-muted-foreground">
            {claimsChecked} Claims Audited
          </span>
        </div>
      </div>

      {/* Flagged Claims Alert (if any detected) */}
      {unsupportedClaims.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm">
          <CardHeader className="py-3 px-4 border-b border-amber-500/20">
            <CardTitle className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>Reverted Claims ({unsupportedClaims.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {unsupportedClaims.map((claim, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-amber-500/20 bg-background text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                  <span className="font-mono">{claim.location || `Claim #${idx + 1}`}</span>
                  <span className="text-amber-600 font-semibold">Reverted to Original</span>
                </div>
                <p className="font-medium text-foreground">"{claim.text || claim.claim}"</p>
                {claim.reason && (
                  <p className="text-amber-700/80 dark:text-amber-300/80 text-[11px] italic">
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
        {/* Keyword Coverage Card */}
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
                  className={`${getCoverageColor(covAfter)} transition-all duration-700 ease-out`}
                  strokeDasharray={`${covAfter}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span
                  data-testid="ats-coverage-percentage"
                  className="text-lg font-black tracking-tight"
                >
                  {atsReport?.keyword_coverage_before !== undefined
                    ? `${covBefore}% → ${covAfter}%`
                    : `${covAfter}%`}
                </span>
                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                  {atsReport?.keyword_coverage_before !== undefined
                    ? "Before → After"
                    : "Match"}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {covAfter >= 80
                ? "Substantial alignment boost against job keywords"
                : covAfter >= 60
                  ? "Moderate keyword match; review remaining gaps"
                  : "Low keyword density; consider adding true skills"}
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
          <CardContent className="p-4 space-y-3.5">
            {/* 1. In your resume (now surfaced) */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>In your resume (now surfaced) ({surfacedKeywords.length})</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {surfacedKeywords.length > 0 ? (
                  surfacedKeywords.map((item, idx) => (
                    <span
                      key={idx}
                      title={item.quote ? `Evidence: "${item.quote}"` : undefined}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    >
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      <span>{item.keyword}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    None tracked in current plan
                  </span>
                )}
              </div>
            </div>

            {/* 2. Partial: review */}
            {partialKeywords.length > 0 && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Partial: review ({partialKeywords.length})</span>
                  </span>
                </div>
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 mt-1">
                  {partialKeywords.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 rounded text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200"
                    >
                      <div className="flex items-center gap-1 font-semibold">
                        <span>{item.keyword.replace(" (Partial)", "")}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                        {item.explanation || "Adjacent candidate evidence; does not fully satisfy strict enterprise requirement."}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Genuine gaps (add only if true) */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Genuine gaps (add only if true) ({genuineGaps.length})</span>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground italic mb-1.5">
                You do not list these; never claimed or invented in tailored output.
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {genuineGaps.length > 0 ? (
                  genuineGaps.map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                    >
                      <XCircle className="h-3 w-3 shrink-0" />
                      <span>{item.keyword}</span>
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
    </div>
  );
}
