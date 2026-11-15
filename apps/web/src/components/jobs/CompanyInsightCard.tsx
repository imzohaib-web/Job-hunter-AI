import { Building2, CheckCircle2, Code2, Globe2, Lightbulb, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyInsight } from "@jobpilot/shared";

interface CompanyInsightCardProps {
  insight?: CompanyInsight | Record<string, unknown> | null;
  companyName?: string;
  className?: string;
}

export function CompanyInsightCard({
  insight,
  companyName = "Company",
  className,
}: CompanyInsightCardProps) {
  if (!insight) return null;

  // Type-safe property extraction
  const raw = insight as Record<string, unknown>;
  const summary = typeof raw.summary === "string" ? raw.summary : null;
  const industry = typeof raw.industry === "string" ? raw.industry : null;
  const sizeEstimate = typeof raw.size_estimate === "string" ? raw.size_estimate : null;
  const techStack = Array.isArray(raw.tech_stack)
    ? (raw.tech_stack.filter((s) => typeof s === "string") as string[])
    : [];
  const cultureSignals = Array.isArray(raw.culture_signals)
    ? (raw.culture_signals.filter((s) => typeof s === "string") as string[])
    : [];
  const applicantNotes = Array.isArray(raw.applicant_notes)
    ? (raw.applicant_notes.filter((s) => typeof s === "string") as string[])
    : [];
  const confidence =
    typeof raw.confidence === "number" ? Math.round(raw.confidence * 100) : null;

  if (!summary && techStack.length === 0 && cultureSignals.length === 0) {
    return null;
  }

  return (
    <Card className={`border shadow-sm bg-card/60 backdrop-blur-sm ${className || ""}`}>
      <CardHeader className="pb-3 pt-4 px-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold">
              Company Intelligence: {typeof raw.company_name === "string" ? raw.company_name : companyName}
            </CardTitle>
          </div>
          {confidence !== null && (
            <Badge variant="secondary" className="text-[10px] font-medium">
              {confidence}% Verified
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4 text-xs">
        {/* Summary */}
        {summary && (
          <p className="text-muted-foreground leading-relaxed italic bg-muted/30 p-2.5 rounded-lg border">
            "{summary}"
          </p>
        )}

        {/* Industry & Headcount Meta */}
        {(industry || sizeEstimate) && (
          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
            {industry && (
              <div className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{industry}</span>
              </div>
            )}
            {sizeEstimate && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{sizeEstimate}</span>
              </div>
            )}
          </div>
        )}

        {/* Tech Stack Chips */}
        {techStack.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
              <Code2 className="h-3.5 w-3.5 text-primary" />
              <span>Verified Tech Stack</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {techStack.slice(0, 8).map((tech) => (
                <span
                  key={tech}
                  className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground border"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Culture Signals */}
        {cultureSignals.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Culture Signals</span>
            </div>
            <ul className="space-y-1 text-muted-foreground">
              {cultureSignals.slice(0, 3).map((sig) => (
                <li key={sig} className="flex items-start gap-1.5">
                  <span className="mt-1 h-1 w-1 rounded-full bg-emerald-500 shrink-0" />
                  <span>{sig}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Applicant Tips */}
        {applicantNotes.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              <span>Applicant Tips</span>
            </div>
            <ul className="space-y-0.5 text-muted-foreground text-[11px]">
              {applicantNotes.slice(0, 2).map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
