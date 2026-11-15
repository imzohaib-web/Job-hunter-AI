import { Link } from "react-router-dom";
import {
  AlertCircle,
  Award,
  KanbanSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicationsPerWeekChart } from "@/components/analytics/ApplicationsPerWeekChart";
import { FunnelChart } from "@/components/analytics/FunnelChart";
import { LlmUsageChart } from "@/components/analytics/LlmUsageChart";
import { MatchScoreByStatusChart } from "@/components/analytics/MatchScoreByStatusChart";
import { TopMissingSkillsCard } from "@/components/analytics/TopMissingSkillsCard";
import { useAnalyticsSummaryQuery } from "@/hooks/useApi";

export function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useAnalyticsSummaryQuery();

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Aggregating pipeline analytics & AI metrics...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <h3 className="font-semibold text-foreground">Failed to load analytics</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Unable to fetch pipeline and matching metrics.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const totals = data?.totals ?? { applications: 0, matches: 0, resumes: 0 };
  const avgScore = data?.averageMatchScore ?? 0;
  const overallConversion = data?.funnel?.conversionRates?.overallConversion ?? 0;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="analytics-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Pipeline & AI Analytics
            </h1>
            <Badge variant="default" className="text-xs">
              Live Insights
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Track your application conversion rates, weekly application velocity, skill gaps, and LLM costs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/applications">
              <KanbanSquare className="h-3.5 w-3.5" />
              Application Tracker
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Applications
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
                {totals.applications}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <KanbanSquare className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Matches Evaluated
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
                {totals.matches}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Overall Conversion
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
                {overallConversion}%
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Avg Applied Match
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
                {avgScore}%
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Award className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 1: Funnel & Weekly Velocity */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <FunnelChart funnel={data?.funnel} />
        <ApplicationsPerWeekChart data={data?.applicationsPerWeek} />
      </div>

      {/* Row 2: Match Scores by Status & Top Missing Skills */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <MatchScoreByStatusChart data={data?.averageMatchScoreByStatus} />
        <TopMissingSkillsCard skills={data?.topMissingSkills} />
      </div>

      {/* Row 3: LLM Daily Usage & Spend */}
      <div>
        <LlmUsageChart data={data?.llmUsage} />
      </div>
    </div>
  );
}
