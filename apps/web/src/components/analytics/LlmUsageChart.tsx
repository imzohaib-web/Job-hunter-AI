import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, DollarSign, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/hooks/useApi";

interface LlmUsageChartProps {
  data?: AnalyticsData["llmUsage"];
}

export function LlmUsageChart({ data = [] }: LlmUsageChartProps) {
  const hasData = data && data.length > 0;

  const totalCost = (data || []).reduce((acc, curr) => acc + (curr.totalCostUsd || 0), 0);
  const totalRuns = (data || []).reduce((acc, curr) => acc + (curr.runsCount || 0), 0);

  // Format date display (e.g. "2026-11-14" -> "Nov 14")
  const formattedData = (data || []).map((item) => {
    try {
      const parts = item.date.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return {
          ...item,
          displayDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
      }
    } catch {
      // fallback
    }
    return {
      ...item,
      displayDate: item.date,
    };
  });

  return (
    <Card className="flex flex-col" data-testid="llm-usage-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">LLM Usage & Cost Per Day</CardTitle>
              <CardDescription className="text-xs">
                AI model inference requests and daily API spend
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              {totalRuns} Runs
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-3 w-3" />
              ${totalCost.toFixed(4)} USD
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-center">
        {!hasData ? (
          <div
            className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed text-center p-4 text-muted-foreground"
            aria-label="No LLM usage data available"
          >
            <p className="text-xs font-medium">No LLM activity recorded yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              AI requests for job matching and resume tailoring will track daily spend here
            </p>
          </div>
        ) : (
          <div
            className="h-60 w-full"
            role="region"
            aria-label="Line chart showing daily LLM runs and cost in USD"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <LineChart
                data={formattedData}
                margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val: number) => `$${val.toFixed(2)}`}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const num = typeof value === "number" ? value : Number(value) || 0;
                    if (name === "totalCostUsd") {
                      return [`$${num.toFixed(4)}`, "Cost (USD)"];
                    }
                    return [`${num} requests`, "Runs"];
                  }}
                  labelFormatter={(lbl: unknown) => `Date: ${String(lbl ?? "")}`}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="runsCount"
                  name="Runs"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalCostUsd"
                  name="Cost ($)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
