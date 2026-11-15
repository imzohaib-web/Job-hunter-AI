import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/hooks/useApi";

interface ApplicationsPerWeekChartProps {
  data?: AnalyticsData["applicationsPerWeek"];
}

export function ApplicationsPerWeekChart({ data = [] }: ApplicationsPerWeekChartProps) {
  const hasData = data && data.length > 0 && data.some((d) => d.count > 0);

  // Format week label: e.g. "2026-W45" -> "W45"
  const formattedData = (data || []).map((item) => ({
    rawWeek: item.week,
    displayWeek: item.week.includes("-") ? item.week.split("-")[1] : item.week,
    count: item.count,
  }));

  const total = formattedData.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <Card className="flex flex-col" data-testid="applications-per-week-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Applications Per Week</CardTitle>
              <CardDescription className="text-xs">
                Weekly velocity of submitted applications
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            <TrendingUp className="h-3.5 w-3.5" />
            {total} Total Apps
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-center">
        {!hasData ? (
          <div
            className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed text-center p-4 text-muted-foreground"
            aria-label="No weekly applications data available"
          >
            <p className="text-xs font-medium">No weekly application history yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Applications submitted each week will chart your velocity here
            </p>
          </div>
        ) : (
          <div
            className="h-56 w-full"
            role="region"
            aria-label="Bar chart showing applications submitted per week"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart
                data={formattedData}
                margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="displayWeek" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: unknown) => [`${val ?? 0} applications`, "Submitted"]}
                  labelFormatter={(lbl: unknown) => `Week ${String(lbl ?? "")}`}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
