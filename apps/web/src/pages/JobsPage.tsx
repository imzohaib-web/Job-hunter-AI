import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FilterX,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailDrawer } from "@/components/jobs/JobDetailDrawer";
import { JobFilters } from "@/components/jobs/JobFilters";
import { DEFAULT_FILTERS, type JobFilterValues } from "@/components/jobs/jobUtils";
import { SearchProgressBanner } from "@/components/jobs/SearchProgressBanner";
import {
  useApplicationsQuery,
  useMatchesQuery,
  usePrepareApplicationMutation,
  useSaveJobMutation,
  useSearchQuery,
  useUnsaveJobMutation,
} from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";
import type { JobEntity, MatchEntity } from "@jobpilot/shared";

export function JobsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read searchId from URL query params or fallback
  const activeSearchId = searchParams.get("searchId");

  // Filters and pagination state
  const [filters, setFilters] = useState<JobFilterValues>(DEFAULT_FILTERS);
  const [page, setPage] = useState<number>(1);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const limit = 10;

  // Selected job for detail drawer
  const [selectedMatch, setSelectedMatch] = useState<MatchEntity | null>(null);

  // Queries & Mutations
  const searchQuery = useSearchQuery(activeSearchId);
  const applicationsQuery = useApplicationsQuery();
  const savedJobIds = useMemo(
    () => applicationsQuery.data?.savedJobIds ?? new Set<string>(),
    [applicationsQuery.data?.savedJobIds],
  );

  const matchesQuery = useMatchesQuery({
    searchId: activeSearchId || undefined,
    minScore: filters.minScore > 0 ? filters.minScore : undefined,
    remote: filters.remoteOnly ? true : undefined,
    sort: filters.sort,
    page,
    limit,
  });

  const saveJobMutation = useSaveJobMutation();
  const unsaveJobMutation = useUnsaveJobMutation();
  const prepareApplicationMutation = usePrepareApplicationMutation();

  // Filter client-side enhancements: source, seniority, and savedOnly
  const filteredMatches = useMemo(() => {
    const rawMatches = matchesQuery.data?.data || [];
    return rawMatches.filter((match) => {
      const job: JobEntity | undefined =
        typeof match.jobId === "object" && match.jobId !== null
          ? (match.jobId as JobEntity)
          : match.job;

      const jobId = job?._id || String(match.jobId || "");

      // Saved only filter
      if (filters.savedOnly && !savedJobIds.has(jobId) && !match.isSaved) {
        return false;
      }

      // Source filter
      if (filters.source !== "all" && job?.source) {
        if (job.source.toLowerCase() !== filters.source.toLowerCase()) {
          return false;
        }
      }

      // Seniority filter
      if (filters.seniority !== "all") {
        const titleLower = (job?.title || "").toLowerCase();
        if (filters.seniority === "junior" && !titleLower.includes("junior") && !titleLower.includes("entry")) {
          return false;
        }
        if (filters.seniority === "mid" && (titleLower.includes("senior") || titleLower.includes("lead") || titleLower.includes("principal"))) {
          return false;
        }
        if (filters.seniority === "senior" && !titleLower.includes("senior")) {
          return false;
        }
        if (filters.seniority === "lead" && !titleLower.includes("lead") && !titleLower.includes("principal") && !titleLower.includes("staff")) {
          return false;
        }
      }

      return true;
    });
  }, [matchesQuery.data?.data, filters.savedOnly, filters.source, filters.seniority, savedJobIds]);

  const totalPages = matchesQuery.data?.pagination?.totalPages || 1;
  const totalCount = matchesQuery.data?.pagination?.total || 0;

  // Extract dynamic sources from actual results and searchRun telemetry
  const presentSources = useMemo(() => {
    const rawMatches = matchesQuery.data?.data || [];
    const set = new Set<string>();
    for (const m of rawMatches) {
      const job: JobEntity | undefined =
        typeof m.jobId === "object" && m.jobId !== null
          ? (m.jobId as JobEntity)
          : m.job;
      if (job?.source) {
        set.add(job.source.toLowerCase());
      }
    }
    const statuses = searchQuery.data?.sourceStatuses || [];
    for (const s of statuses) {
      if (s.count && s.count > 0) {
        set.add(s.source.toLowerCase());
      }
    }
    return ["all", ...Array.from(set)];
  }, [matchesQuery.data?.data, searchQuery.data?.sourceStatuses]);

  // Honest header summary text with exclusion breakdown
  const honestHeaderSubtitle = useMemo(() => {
    const diag = searchQuery.data?.diagnostics;
    if (!diag || !diag.fetched) {
      return "Personalized job postings ranked by semantic similarity and verified skills.";
    }
    const scanned = diag.fetched.toLocaleString();
    const rawMatches = matchesQuery.data?.data || [];
    const strongGood = rawMatches.filter((m) => m.tier === "strong" || m.tier === "good" || m.score >= 50).length;
    const matchCountStr = strongGood > 0 ? `${strongGood} strong/good matches` : `${totalCount} matches`;

    const exclusions: string[] = [];
    if (diag.filterBreakdown?.role_family) {
      exclusions.push(`role family ${diag.filterBreakdown.role_family.toLocaleString()}`);
    }
    if (diag.filterBreakdown?.language) {
      exclusions.push(`language ${diag.filterBreakdown.language.toLocaleString()}`);
    }
    if (diag.filterBreakdown?.onsite_abroad) {
      exclusions.push(`on-site abroad ${diag.filterBreakdown.onsite_abroad.toLocaleString()}`);
    }
    if (diag.filterBreakdown?.remote_region_restricted) {
      exclusions.push(`region-restricted ${diag.filterBreakdown.remote_region_restricted.toLocaleString()}`);
    }
    if (diag.filterBreakdown?.senior) {
      exclusions.push(`senior ${diag.filterBreakdown.senior.toLocaleString()}`);
    }
    if (diag.filterBreakdown?.excluded_keywords) {
      exclusions.push(`keywords ${diag.filterBreakdown.excluded_keywords.toLocaleString()}`);
    }

    const exStr = exclusions.length > 0 ? ` Excluded: ${exclusions.join(", ")}.` : "";
    return `${matchCountStr} from ${scanned} scanned jobs.${exStr}`;
  }, [searchQuery.data?.diagnostics, matchesQuery.data?.data, totalCount]);

  // Handle Save / Unsave bookmark toggle with optimistic updates
  const handleToggleSave = async (jobId: string, currentlySaved: boolean) => {
    if (currentlySaved) {
      await unsaveJobMutation.mutateAsync(jobId);
    } else {
      await saveJobMutation.mutateAsync(jobId);
    }
    void applicationsQuery.refetch();
  };

  // Handle Prepare Application action: navigates to dedicated preparation run screen
  const handlePrepareApplication = (matchId: string) => {
    navigate(`/prepare/${matchId}`);
  };

  const isSearchComplete = (count: number) => {
    void matchesQuery.refetch();
    toast.info(`Discovery run complete with ${count} ranked positions.`, "Matches Ready");
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>Discovered Opportunities</span>
            <Sparkles className="h-5 w-5 text-primary" />
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {honestHeaderSubtitle}{" "}
            {searchQuery.data?.diagnostics && (
              <button
                type="button"
                onClick={() => setShowDiagnostics(true)}
                className="underline text-primary hover:text-primary/80 font-medium inline-block ml-1"
              >
                View diagnostics
              </button>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/preferences")}
            className="text-xs gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Preferences</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void matchesQuery.refetch()}
            disabled={matchesQuery.isFetching}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${matchesQuery.isFetching ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => navigate("/onboarding")}
            className="text-xs gap-1.5 font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Search</span>
          </Button>
        </div>
      </div>

      {/* Live SSE Search Progress Banner */}
      {activeSearchId && (
        <SearchProgressBanner
          searchId={activeSearchId}
          initialSearch={searchQuery.data}
          onSearchCompleted={isSearchComplete}
        />
      )}

      {/* Legacy Matches Notice Banner */}
      {matchesQuery.data?.hasLegacyMatches && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300 font-medium animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Results from an older version were hidden ({matchesQuery.data.legacyCount} legacy jobs). Run a new search to see updated matches and scoring.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 shrink-0 self-start sm:self-auto"
            onClick={() => navigate("/onboarding")}
          >
            Run New Search
          </Button>
        </div>
      )}

      {/* Fallback Broad Results Banner */}
      {searchQuery.data?.diagnostics?.fallbackUsed && (
        <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-primary font-medium animate-fade-in shadow-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span>Showing broader results because few exact matches were found.</span>
        </div>
      )}

      {/* Discovery Filters Toolbar */}
      <JobFilters
        filters={filters}
        availableSources={presentSources}
        onChange={(next) => {
          setFilters(next);
          setPage(1); // reset to page 1 on filter modification
        }}
        totalCount={totalCount}
        filteredCount={filteredMatches.length}
      />

      {/* "Why so few results?" Collapsible Diagnostics Panel */}
      {searchQuery.data?.diagnostics && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between text-left text-xs font-semibold text-foreground hover:text-primary transition-colors"
            aria-expanded={showDiagnostics}
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <span>Why so few results? Search Diagnostics & Stage Breakdown</span>
            </div>
            {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showDiagnostics && (
            <div className="pt-2 border-t border-border/50 text-xs space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Stage 1: Fetched</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {searchQuery.data.diagnostics.fetched ?? 0}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Stage 2: After Dedupe</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {searchQuery.data.diagnostics.afterDedupe ?? 0}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Stage 3: Passing Criteria</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {searchQuery.data.diagnostics.afterHardFilters ?? 0}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Stage 4: Ranked Matches</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    {searchQuery.data.diagnostics.ranked ?? 0}
                  </div>
                </div>
              </div>

              {searchQuery.data.diagnostics.mainFilterRemoved && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-300 text-xs">
                  <span className="font-semibold">Main filter constraint: </span>
                  {searchQuery.data.diagnostics.mainFilterRemoved}
                </div>
              )}

              {/* Per-Filter Breakdown */}
              {searchQuery.data.diagnostics.filterBreakdown && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Per-Filter Jobs Removed
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs">
                    {Object.entries(searchQuery.data.diagnostics.filterBreakdown).map(([fKey, count]) => (
                      <div key={fKey} className="rounded border bg-muted/30 px-2 py-1 flex items-center justify-between">
                        <span className="capitalize text-muted-foreground">{fKey.replace("_", " ")}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-Source Breakdown */}
              {searchQuery.data.sourceStatuses && searchQuery.data.sourceStatuses.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Per-Source Details
                  </div>
                  <div className="space-y-1">
                    {searchQuery.data.sourceStatuses.map((st) => (
                      <div key={st.source} className="flex flex-wrap items-center justify-between text-[11px] rounded bg-muted/20 px-2 py-1">
                        <span className="capitalize font-medium">{st.source}</span>
                        <span className="text-muted-foreground">
                          {st.rawFetched !== undefined ? `Fetched ${st.rawFetched} → kept ${st.count}` : `${st.count} kept`}
                          {st.httpStatus ? ` (HTTP ${st.httpStatus})` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results Content Area */}
      {matchesQuery.isLoading ? (
        // Loading skeleton list
        <div className="space-y-4" role="status" aria-label="Loading job opportunities">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-2 w-2/3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-12 w-12 rounded-full" />
              </div>
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : matchesQuery.isError || searchQuery.data?.status === "failed" ? (
        // 1. Search Failed empty state with real error message + retry button
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-foreground">Discovery Search Failed</h3>
            <p className="text-xs text-destructive max-w-lg mx-auto font-mono bg-destructive/10 p-2.5 rounded-lg border border-destructive/20 text-left overflow-auto max-h-36">
              {searchQuery.data?.error ||
                (matchesQuery.error instanceof Error
                  ? matchesQuery.error.message
                  : "Discovery backend service encountered an error while searching for positions.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate("/onboarding")}
              className="text-xs gap-1.5 font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry Search</span>
            </Button>
          </div>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="space-y-6">
          {matchesQuery.data?.data && matchesQuery.data.data.length > 0 ? (
            // 2. Filters removed all results empty state
            <div
              role="status"
              className="rounded-xl border border-dashed p-10 text-center space-y-4 bg-muted/20"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FilterX className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">Filters removed all candidate positions</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  The search discovered {matchesQuery.data.data.length} candidate jobs, but your active filters (score, remote, seniority, or source) excluded all of them.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs gap-1.5 font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Clear All Filters</span>
                </Button>
              </div>
            </div>
          ) : (
            // 3. Sources returned 0 jobs empty state
            <div
              role="status"
              className="rounded-xl border border-dashed p-10 text-center space-y-4 bg-muted/20"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Briefcase className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">No candidate positions found across sources</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  The enabled public job source adapters returned 0 postings matching your search keywords and remote criteria.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/onboarding")}
                  className="text-xs gap-1.5 font-semibold"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Start New Search</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Job Cards Results List
        <div className="space-y-4">
          <div className="space-y-3">
            {filteredMatches.map((match) => {
              const job: JobEntity | undefined =
                typeof match.jobId === "object" && match.jobId !== null
                  ? (match.jobId as JobEntity)
                  : match.job;
              const jobId = job?._id || String(match.jobId || "");
              const isSaved = savedJobIds.has(jobId) || Boolean(match.isSaved);

              return (
                <JobCard
                  key={match._id}
                  match={match}
                  isSaved={isSaved}
                  onSelect={(m) => setSelectedMatch(m)}
                  onToggleSave={handleToggleSave}
                />
              );
            })}
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-4 px-2">
              <div className="text-xs text-muted-foreground">
                Showing page <span className="font-semibold text-foreground">{page}</span> of{" "}
                <span className="font-semibold text-foreground">{totalPages}</span> ({totalCount}{" "}
                total)
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 text-xs gap-1"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && p - arr[idx - 1] > 1 && (
                          <span className="px-1 text-xs text-muted-foreground">...</span>
                        )}
                        <Button
                          variant={p === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(p)}
                          className={`h-8 w-8 p-0 text-xs ${
                            p === page ? "font-bold shadow-sm" : ""
                          }`}
                        >
                          {p}
                        </Button>
                      </React.Fragment>
                    ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-8 text-xs gap-1"
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slide-over Job Detail Drawer */}
      <JobDetailDrawer
        match={selectedMatch}
        isOpen={Boolean(selectedMatch)}
        onClose={() => setSelectedMatch(null)}
        isSaved={
          selectedMatch
            ? savedJobIds.has(
                typeof selectedMatch.jobId === "object" && selectedMatch.jobId !== null
                  ? (selectedMatch.jobId as JobEntity)._id
                  : String(selectedMatch.jobId || ""),
              ) || Boolean(selectedMatch.isSaved)
            : false
        }
        onToggleSave={handleToggleSave}
        onPrepareApplication={handlePrepareApplication}
        isPreparing={prepareApplicationMutation.isPending}
      />
    </div>
  );
}
