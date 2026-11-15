import { AlertTriangle, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/hooks/useApi";

interface TopMissingSkillsCardProps {
  skills?: AnalyticsData["topMissingSkills"];
}

export function TopMissingSkillsCard({ skills = [] }: TopMissingSkillsCardProps) {
  const top10 = (skills || []).slice(0, 10);
  const hasData = top10.length > 0;

  return (
    <Card className="flex flex-col" data-testid="top-missing-skills-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Top Missing Skills</CardTitle>
              <CardDescription className="text-xs">
                Most frequent requirements missing from your profile & suggestions
              </CardDescription>
            </div>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            Top {top10.length} Gaps
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {!hasData ? (
          <div
            className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed text-center p-4 text-muted-foreground"
            aria-label="No missing skills found"
          >
            <p className="text-xs font-medium">No skill gaps identified yet</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Search for jobs to see aggregate skill requirements compared against your resume
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {top10.map((item, index) => (
              <div
                key={item.skill}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground mt-0.5">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {item.skill}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {item.count} {item.count === 1 ? "job" : "jobs"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Lightbulb className="h-3 w-3 shrink-0 text-amber-500 mt-0.5" />
                      <span className="line-clamp-2 italic">{item.suggestion}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
