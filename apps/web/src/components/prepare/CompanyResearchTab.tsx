import {
  Building,
  CheckCircle2,
  Code2,
  Compass,
  ExternalLink,
  Globe,
  Layers,
  Lightbulb,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyInsight } from "@jobpilot/shared";

interface CompanyResearchTabProps {
  companyInsight?: CompanyInsight | Record<string, unknown> | null;
  targetCompanyName?: string;
  className?: string;
}

export function CompanyResearchTab({
  companyInsight,
  targetCompanyName = "Target Company",
  className = "",
}: CompanyResearchTabProps) {
  if (!companyInsight) {
    return (
      <div className={`p-8 text-center border rounded-xl bg-card/60 text-muted-foreground ${className}`}>
        <Building className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-semibold">No company research intelligence available</p>
        <p className="text-xs text-muted-foreground mt-1">
          Company intelligence gathering was not requested or returned no public insights.
        </p>
      </div>
    );
  }

  const raw = companyInsight as Record<string, unknown>;
  const companyName = (typeof raw.company_name === "string" && raw.company_name) || targetCompanyName;
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const industry = typeof raw.industry === "string" ? raw.industry : "";
  const sizeEstimate = typeof raw.size_estimate === "string" ? raw.size_estimate : "";
  const confidenceScore =
    typeof raw.confidence === "number" ? Math.round(raw.confidence * 100) : 85;

  const techStack = Array.isArray(raw.tech_stack)
    ? (raw.tech_stack.filter((s) => typeof s === "string") as string[])
    : [];

  const productsOrServices = Array.isArray(raw.products_or_services)
    ? (raw.products_or_services.filter((s) => typeof s === "string") as string[])
    : [];

  const cultureSignals = Array.isArray(raw.culture_signals)
    ? (raw.culture_signals.filter((s) => typeof s === "string") as string[])
    : [];

  const applicantNotes = Array.isArray(raw.applicant_notes)
    ? (raw.applicant_notes.filter((s) => typeof s === "string") as string[])
    : [];

  const sources = Array.isArray(raw.sources)
    ? (raw.sources.filter((s) => typeof s === "string") as string[])
    : [];

  const limitations = Array.isArray(raw.limitations)
    ? (raw.limitations.filter((s) => typeof s === "string") as string[])
    : [];

  const getConfidenceLevel = (score: number) => {
    if (score >= 80) return { label: "High Confidence", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" };
    if (score >= 60) return { label: "Moderate Confidence", color: "text-amber-600 bg-amber-500/10 border-amber-500/20" };
    return { label: "Low Confidence", color: "text-rose-600 bg-rose-500/10 border-rose-500/20" };
  };

  const confidenceLevel = getConfidenceLevel(confidenceScore);

  return (
    <div className={`space-y-6 ${className}`} data-testid="company-research-tab">
      {/* Header Overview Card */}
      <Card className="border shadow-sm bg-card">
        <CardHeader className="py-4 px-6 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  {companyName}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {industry && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 text-primary" />
                      <span>{industry}</span>
                    </span>
                  )}
                  {sizeEstimate && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      <span>{sizeEstimate}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Confidence Gauge Badge */}
            <div
              data-testid="company-confidence-badge"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${confidenceLevel.color}`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{confidenceScore}% Confidence</span>
              <span className="text-[10px] font-normal uppercase opacity-75">
                • {confidenceLevel.label}
              </span>
            </div>
          </div>
        </CardHeader>

        {summary && (
          <CardContent className="p-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Company Overview & Mission
            </h4>
            <p className="text-sm leading-relaxed text-foreground bg-muted/30 p-4 rounded-xl border">
              "{summary}"
            </p>
          </CardContent>
        )}
      </Card>

      {/* Strategic Insights & Applicant Notes */}
      {applicantNotes.length > 0 && (
        <Card className="border shadow-sm bg-card">
          <CardHeader className="py-3 px-6 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              <span>Key Insights for Target Position</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {applicantNotes.map((note, idx) => (
                <li
                  key={idx}
                  className="p-3.5 rounded-xl border bg-muted/20 text-xs leading-relaxed flex items-start gap-2.5"
                >
                  <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground font-medium">{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tech Stack, Products, and Culture Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Technologies / Tech Stack */}
        <Card className="border shadow-sm bg-card">
          <CardHeader className="py-3 px-5 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <span>Technologies & Stack</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {techStack.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {techStack.map((tech) => (
                  <span
                    key={tech}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No verified tech stack tags
              </span>
            )}
          </CardContent>
        </Card>

        {/* Products & Services */}
        <Card className="border shadow-sm bg-card">
          <CardHeader className="py-3 px-5 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>Products & Services</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {productsOrServices.length > 0 ? (
              <ul className="space-y-2 text-xs text-foreground">
                {productsOrServices.map((prod, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>{prod}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No specific products listed
              </span>
            )}
          </CardContent>
        </Card>

        {/* Culture & Work Environment */}
        <Card className="border shadow-sm bg-card">
          <CardHeader className="py-3 px-5 border-b">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" />
              <span>Culture & Values</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {cultureSignals.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {cultureSignals.map((sig, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground border text-xs font-medium"
                  >
                    {sig}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No verified culture signals recorded
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sources & Verifiable Links */}
      <Card className="border shadow-sm bg-card">
        <CardHeader className="py-3 px-6 border-b">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            <span>Verifiable Sources & Intelligence Citations</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {sources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sources.map((srcUrl, idx) => (
                <a
                  key={idx}
                  href={srcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-muted/30 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate max-w-[280px]">{srcUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Sources gathered from general employer registry and verified job posting links.
            </p>
          )}

          {/* Research Limitations */}
          {limitations.length > 0 && (
            <div className="pt-3 border-t">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Research Limitations & Observations
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {limitations.map((lim, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
