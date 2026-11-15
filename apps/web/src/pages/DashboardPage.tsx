import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Bot,
  Briefcase,
  CheckCircle2,
  FileText,
  FileUp,
  KanbanSquare,
  MapPin,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { MatchEntity } from "@jobpilot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAnalyticsSummaryQuery,
  useApplicationsQuery,
  useCurrentUserQuery,
  useMatchesQuery,
  useResumesQuery,
} from "@/hooks/useApi";
import { useAuthStore } from "@/stores/authStore";
import {
  getApplicationsNeedingFollowUp,
  getDaysSinceApplied,
} from "@/utils/followUpRule";

export function DashboardPage() {
  const storeUser = useAuthStore((s) => s.user);
  const { data: userProfile } = useCurrentUserQuery();
  const { data: resumes } = useResumesQuery();
  const { data: applicationsData } = useApplicationsQuery();
  const { data: analyticsData } = useAnalyticsSummaryQuery();
  const { data: matchesData } = useMatchesQuery({ limit: 5 });

  const user = userProfile ?? storeUser;
  const hasResumes = resumes && resumes.length > 0;

  const allApplications = applicationsData?.all ?? [];
  const followUpApps = getApplicationsNeedingFollowUp(allApplications);

  const recentMatches: MatchEntity[] = (matchesData?.data ?? []).slice(0, 4);

  // KPI metrics
  const activePipelineCount =
    (applicationsData?.grouped.applied.length ?? 0) +
    (applicationsData?.grouped.interview.length ?? 0) +
    (applicationsData?.grouped.offer.length ?? 0);

  const interviewRate =
    analyticsData?.funnel?.conversionRates?.appliedToInterview ?? 0;

  const totalMatchesCount =
    analyticsData?.totals?.matches ?? matchesData?.pagination?.total ?? 0;
  const avgMatchScore = analyticsData?.averageMatchScore ?? 0;

  return (
    <div className="space-y-8 animate-fade-in" data-testid="dashboard-page">
      {/* Welcome banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {user?.name?.split(" ")[0] ?? "there"}!
            </h1>
            <Badge variant="success">Active</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            JobPilot is monitoring your pipeline and ready to tailor applications.
          </p>
        </div>

        {user?.quota && (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
            <Bot className="h-5 w-5 text-primary" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">AI Daily Quota</p>
              <p className="text-muted-foreground">
                {user.quota.dailyAiRequests} of {user.quota.dailyLimit} requests used
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Onboarding Callout if no resume uploaded */}
      {!hasResumes && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <FileUp className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Complete Your Onboarding</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Upload your resume, review your verified skills & experience, and set your target job preferences to launch your first job search.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <Link to="/onboarding">
              Start Onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* 1. Three KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* KPI 1: Active Pipeline */}
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Active Pipeline
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <KanbanSquare className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {activePipelineCount}
              </span>
              <span className="text-xs text-muted-foreground">
                {allApplications.length} total tracked
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium">
                {applicationsData?.grouped.applied.length ?? 0} applied
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium">
                {applicationsData?.grouped.interview.length ?? 0} interviews
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 font-medium">
                {applicationsData?.grouped.offer.length ?? 0} offers
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Interview Conversion */}
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Interview Rate
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {interviewRate}%
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                Applied → Interview
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {applicationsData?.grouped.interview.length ?? 0} active interview stages scheduled
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Match Volume & Quality */}
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Opportunities
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {totalMatchesCount}
              </span>
              <span className="text-xs text-muted-foreground">
                {avgMatchScore > 0 ? `${avgMatchScore}% avg fit` : "scored matches"}
              </span>
            </div>
            <div className="mt-3">
              <Link
                to="/jobs"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Explore all job matches
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Applications Needing Follow-up Section */}
      <div className="space-y-4" data-testid="follow-up-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <BellRing className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Applications Needing Follow-up</h2>
              <p className="text-xs text-muted-foreground">
                Positions applied more than 7 days ago with no recorded status update
              </p>
            </div>
          </div>

          {followUpApps.length > 0 && (
            <Badge variant="secondary" className="gap-1 font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {followUpApps.length} Due
            </Badge>
          )}
        </div>

        {followUpApps.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="p-6 flex items-center justify-center gap-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <p className="text-xs text-muted-foreground font-medium">
                All caught up! No applications currently waiting for follow-up.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {followUpApps.map((app) => {
              const job = typeof app.jobId === "object" ? app.jobId : null;
              const daysAgo = getDaysSinceApplied(app);
              const match = typeof app.matchId === "object" ? app.matchId : null;

              return (
                <Card
                  key={app._id}
                  className="border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 hover:border-amber-300 transition-colors"
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {job?.company ?? "Unknown Company"}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 dark:text-amber-400">
                          {daysAgo} days ago
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-sm text-foreground mt-1 line-clamp-1">
                        {job?.title ?? "Position"}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                      {match?.score !== undefined ? (
                        <span className="text-muted-foreground text-[11px]">
                          {match.score}% Match
                        </span>
                      ) : (
                        <span />
                      )}
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link to="/applications">
                          Update Status
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Recent Matches Section */}
      <div className="space-y-4" data-testid="recent-matches-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Recent Job Matches</h2>
              <p className="text-xs text-muted-foreground">
                High-fit roles ranked against your verified skills & experience
              </p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/jobs">
              View All ({totalMatchesCount})
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        {recentMatches.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="p-8 text-center flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-muted-foreground">
                No job matches evaluated yet. Run a search to see matched positions.
              </p>
              <Button asChild size="sm" className="mt-2 text-xs">
                <Link to="/jobs">Launch Job Search</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentMatches.map((m: MatchEntity) => {
              const job = typeof m.jobId === "object" && m.jobId !== null ? m.jobId : null;
              const company = job?.company ?? "Unknown Company";
              const title = job?.title ?? "Position";
              const location = job?.location;
              const scoreVariant = m.score >= 80 ? "success" : "default";

              return (
                <Card
                  key={m._id}
                  className="hover:border-primary/50 transition-colors flex flex-col justify-between"
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                          {company}
                        </p>
                        <h3 className="font-semibold text-sm text-foreground truncate mt-0.5">
                          {title}
                        </h3>
                        {location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 text-muted-foreground/70" />
                            {location}
                          </p>
                        )}
                      </div>
                      <Badge variant={scoreVariant} className="shrink-0 text-xs font-bold">
                        {m.score}%
                      </Badge>
                    </div>

                    {/* Matched skills preview */}
                    {m.matchedSkills && m.matchedSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.matchedSkills.slice(0, 3).map((skill: string) => (
                          <span
                            key={skill}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {skill}
                          </span>
                        ))}
                        {m.matchedSkills.length > 3 && (
                          <span className="text-[10px] text-muted-foreground/70 self-center">
                            +{m.matchedSkills.length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border/40 pt-3">
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                        <Link to="/jobs">View Details</Link>
                      </Button>
                      <Button asChild size="sm" className="h-7 text-xs gap-1">
                        <Link to={`/prepare/${m._id}`}>
                          <Sparkles className="h-3 w-3" />
                          Prepare Application
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation Quick Action Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t pt-6">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <FileText className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Resume & Profile</CardTitle>
            <CardDescription>
              Review your parsed profile, skills, and work history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/profile">
                Go to Profile
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <Briefcase className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Job Discovery</CardTitle>
            <CardDescription>
              Explore ranked job matches with explanations and skill gap analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/jobs">
                Explore Jobs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Application Tracker</CardTitle>
            <CardDescription>
              Track your applications across every stage on a kanban board.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/applications">
                View Kanban Board
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
