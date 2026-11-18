import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type SseMessageEvent, useSSE } from "@/hooks/useSSE";
import type { SearchProgressEvent, SearchRunEntity, SourceStatusItem } from "@jobpilot/shared";

interface SearchProgressBannerProps {
  searchId?: string | null;
  initialSearch?: SearchRunEntity | null;
  onSearchCompleted?: (resultsCount: number) => void;
  className?: string;
}

export function SearchProgressBanner({
  searchId,
  initialSearch,
  onSearchCompleted,
  className = "",
}: SearchProgressBannerProps) {
  const [status, setStatus] = useState<string>(initialSearch?.status || "pending");
  const [resultsCount, setResultsCount] = useState<number>(initialSearch?.resultsCount || 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialSearch?.error || null);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatusItem[]>(
    initialSearch?.sourceStatuses || [],
  );
  const [perSourceCounts, setPerSourceCounts] = useState<Record<string, number>>(
    (initialSearch?.perSourceCounts as Record<string, number>) || {},
  );
  const [completedSources, setCompletedSources] = useState<Set<string>>(new Set());
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Sync with initialSearch changes
  useEffect(() => {
    if (initialSearch) {
      if (initialSearch.status) setStatus(initialSearch.status);
      if (typeof initialSearch.resultsCount === "number") {
        setResultsCount(initialSearch.resultsCount);
      }
      if (initialSearch.error) {
        setErrorMessage(initialSearch.error);
      }
      if (initialSearch.sourceStatuses && initialSearch.sourceStatuses.length > 0) {
        setSourceStatuses(initialSearch.sourceStatuses);
      }
      if (initialSearch.perSourceCounts) {
        setPerSourceCounts(initialSearch.perSourceCounts as Record<string, number>);
      }
    }
  }, [initialSearch]);

  const streamUrl = searchId ? `/api/searches/${searchId}/events` : null;

  useSSE<string>(streamUrl, {
    enabled: Boolean(searchId && status !== "completed" && status !== "completed_empty" && status !== "failed"),
    onMessage: (event: SseMessageEvent<string>) => {
      try {
        const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
        const data = JSON.parse(raw) as SearchProgressEvent;

        if (data.status) {
          setStatus(data.status);
        }

        if (typeof data.resultsCount === "number") {
          setResultsCount(data.resultsCount);
        }

        if (data.error) {
          setErrorMessage(data.error);
        }

        if (data.sourceStatuses && data.sourceStatuses.length > 0) {
          setSourceStatuses(data.sourceStatuses);
        }

        if (data.perSourceCounts) {
          setPerSourceCounts(data.perSourceCounts);
        }

        if (data.source && typeof data.count === "number") {
          setPerSourceCounts((prev) => ({
            ...prev,
            [data.source as string]: data.count as number,
          }));
        }

        if (data.type === "source_complete" && data.source) {
          setCompletedSources((prev) => new Set([...prev, data.source as string]));
        }

        if (data.type === "completed" || data.status === "completed" || data.status === "completed_empty") {
          const finalSt = data.status || "completed";
          setStatus(finalSt);
          if (typeof data.resultsCount === "number") {
            onSearchCompleted?.(data.resultsCount);
          }
        } else if (data.type === "failed" || data.status === "failed") {
          setStatus("failed");
          if (data.error) {
            setErrorMessage(data.error);
          }
        }
      } catch {
        // Ignored unparsable SSE ping
      }
    },
  });

  if (!searchId || isDismissed) {
    return null;
  }

  const isSearching = status === "pending" || status === "running" || status === "processing";
  const isCompletedEmpty = status === "completed_empty" || (status === "completed" && resultsCount === 0);

  // Derive real active sources strictly from backend source statuses
  const activeSources: SourceStatusItem[] =
    sourceStatuses.length > 0
      ? sourceStatuses
      : Object.entries(perSourceCounts).map(([src, cnt]) => ({
          source: src,
          status: "ok" as const,
          count: cnt,
        }));

  return (
    <div
      role="region"
      aria-label="Job search progress"
      className={`rounded-xl border ${
        status === "failed"
          ? "border-destructive/30 bg-destructive/5"
          : isCompletedEmpty
            ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10"
            : "border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5"
      } p-4 shadow-sm backdrop-blur-sm transition-all ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isSearching
                ? "bg-primary text-primary-foreground animate-pulse"
                : isCompletedEmpty
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : status === "completed"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/15 text-destructive"
            }`}
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isCompletedEmpty ? (
              <AlertTriangle className="h-5 w-5" />
            ) : status === "completed" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : status === "failed" ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                {isSearching
                  ? "AI Discovery In Progress"
                  : isCompletedEmpty
                    ? "Discovery Completed (0 Matches)"
                    : status === "completed"
                      ? "Discovery Run Complete"
                      : status === "failed"
                        ? "Search Run Failed"
                        : "Search Status"}
              </h4>
              <Badge
                variant={
                  isSearching
                    ? "default"
                    : isCompletedEmpty
                      ? "outline"
                      : status === "completed"
                        ? "success"
                        : status === "failed"
                          ? "destructive"
                          : "secondary"
                }
                className={`text-[10px] uppercase font-bold tracking-wider ${
                  isCompletedEmpty ? "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10" : ""
                }`}
              >
                {status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {isSearching
                ? `Scraping, standardizing, and ranking matches across job networks (${resultsCount} found so far)`
                : isCompletedEmpty
                  ? initialSearch?.diagnostics?.mainFilterRemoved ||
                    "All candidate positions were removed by active filter constraints."
                  : status === "failed"
                    ? errorMessage || "Discovery service encountered an error while searching jobs."
                    : `Discovered and scored ${resultsCount} candidate positions matching your verified profile.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Collapse source details" : "Expand source details"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Per-source status chips generated only from real backend source statuses */}
      {isExpanded && activeSources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Per-Source Live Tracking
          </div>
          <div className="flex flex-wrap gap-2">
            {activeSources.map((item) => {
              const count = item.count ?? perSourceCounts[item.source] ?? 0;
              const isMissingKey =
                item.status === "skipped" ||
                item.reason?.toLowerCase().includes("no api key") ||
                item.error?.toLowerCase().includes("no api key");
              const isSkipped = item.status === "skipped" || isMissingKey;
              const isFailed = !isMissingKey && (item.status === "failed" || item.status === "error");

              const rawFetched = item.rawFetched;
              const tooltipReason =
                item.error ||
                item.reason ||
                (isSkipped
                  ? "skipped: no API key"
                  : isFailed
                    ? `Failed: ${item.httpStatus ? `HTTP ${item.httpStatus} ` : ""}${item.error || "Request failed"}`
                    : rawFetched !== undefined
                      ? `Fetched ${rawFetched}, kept ${count} jobs`
                      : `${count} jobs discovered`);

              let chipStyle = "border-border bg-muted/40 text-muted-foreground";
              if (isMissingKey) {
                // Grey chip for missing API key (never red failed)
                chipStyle = "border-border/60 bg-muted/70 text-muted-foreground";
              } else if (isSkipped) {
                chipStyle = "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
              } else if (isFailed) {
                chipStyle = "border-destructive/30 bg-destructive/10 text-destructive";
              } else if (count > 0 || completedSources.has(item.source) || status === "completed" || status === "completed_empty") {
                chipStyle = "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
              } else if (isSearching) {
                chipStyle = "border-primary/30 bg-primary/5 text-primary animate-pulse";
              }

              const countDisplay = isMissingKey
                ? "skipped: no API key"
                : isFailed
                  ? item.httpStatus ? `HTTP ${item.httpStatus}` : "failed"
                  : rawFetched !== undefined
                    ? `${rawFetched} → ${count}`
                    : count > 0
                      ? `${count} kept`
                      : isSearching
                        ? "scanning..."
                        : "0";

              return (
                <div
                  key={item.source}
                  title={tooltipReason}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium cursor-help transition-all ${chipStyle}`}
                >
                  <span className="capitalize">{item.source}</span>
                  <span className="text-[10px] font-semibold opacity-90">
                    {countDisplay}
                  </span>
                  {(isSkipped || isFailed) && (
                    <HelpCircle className="h-3 w-3 opacity-70" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
