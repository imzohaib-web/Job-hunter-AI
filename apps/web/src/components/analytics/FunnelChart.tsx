import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Filter, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/hooks/useApi";

interface FunnelChartProps {
  funnel?: AnalyticsData["funnel"];
}

const STAGE_COLORS = ["#3b82f6", "#f59e0b", "#a855f7", "#10b981"];

export function FunnelChart({ funnel }: FunnelChartProps) {
  const counts = funnel?.counts ?? {
    saved: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  };

  const rates = funnel?.conversionRates ?? {
    savedToApplied: 0,
    appliedToInterview: 0,
    interviewToOffer: 0,
    overallConversion: 0,
  };

  const chartData = [
    { stage: "Saved", count: counts.saved, color: STAGE_COLORS[0] },
    { stage: "Applied", count: counts.applied, color: STAGE_COLORS[1] },
    { stage: "Interview", count: counts.interview, color: STAGE_COLORS[2] },
    { stage: "Offer", count: counts.offer, color: STAGE_COLORS[3] },
  ];

  const totalPipeline = counts.saved + counts.applied + counts.interview + counts.offer;

  return (
    <Card className="flex flex-col" data-testid="funnel-chart-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Filter className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Application Funnel</CardTitle>
              <CardDescription className="text-xs">
                Stage progression and conversion efficiency
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            {rates.overallConversion}% Win Rate
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between space-y-4">
        {totalPipeline === 0 ? (
          <div
            className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed text-center p-4 text-muted-foreground"
            aria-label="No funnel data available"
          >
            <p className="text-xs font-medium">No application funnel data yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Add jobs to your tracker to see conversion progression
            </p>
          </div>
        ) : (
          <div
            className="h-52 w-full"
            role="region"
            aria-label="Application funnel chart showing counts per stage"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  dataKey="stage"
                  type="category"
                  tick={{ fontSize: 12, fontWeight: 500 }}
                  width={65}
                />
                <Tooltip
                  formatter={(val: unknown) => [`${val ?? 0} applications`, "Volume"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Conversion rates strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t pt-3">
          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
              Saved → Applied
            </p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {rates.savedToApplied}%
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
              Applied → Interview
            </p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {rates.appliedToInterview}%
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
              Interview → Offer
            </p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {rates.interviewToOffer}%
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
              Total Conversion
            </p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {rates.overallConversion}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
