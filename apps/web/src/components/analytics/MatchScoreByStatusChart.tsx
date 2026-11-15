import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/hooks/useApi";

interface MatchScoreByStatusChartProps {
  data?: AnalyticsData["averageMatchScoreByStatus"];
}

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  saved: "#3b82f6",
  applied: "#f59e0b",
  interview: "#a855f7",
  offer: "#10b981",
  rejected: "#f43f5e",
};

export function MatchScoreByStatusChart({ data = [] }: MatchScoreByStatusChartProps) {
  // Format items
  const formattedData = (data || []).map((item) => ({
    statusKey: item.status,
    displayName: STATUS_LABELS[item.status] || item.status,
    averageScore: item.averageScore,
    count: item.count,
    color: STATUS_COLORS[item.status] || "#64748b",
  }));

  const hasData = formattedData.some((d) => d.count > 0 || d.averageScore > 0);

  return (
    <Card className="flex flex-col" data-testid="match-score-by-status-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Match Score by Status</CardTitle>
              <CardDescription className="text-xs">
                Average ATS & requirements fit score per stage
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Target: 70%+
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-center">
        {!hasData ? (
          <div
            className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed text-center p-4 text-muted-foreground"
            aria-label="No match score data available"
          >
            <p className="text-xs font-medium">No match score data yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Match scores will appear here as you track matched jobs
            </p>
          </div>
        ) : (
          <div
            className="h-56 w-full"
            role="region"
            aria-label="Bar chart showing average match score by application status"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart
                data={formattedData}
                margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="displayName" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: unknown) => [`${val ?? 0}% avg score`, "Match Quality"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                  }}
                />
                <ReferenceLine
                  y={70}
                  stroke="#10b981"
                  strokeDasharray="3 3"
                  label={{ value: "Target (70%)", fill: "#10b981", fontSize: 10 }}
                />
                <Bar dataKey="averageScore" radius={[4, 4, 0, 0]} barSize={32}>
                  {formattedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
