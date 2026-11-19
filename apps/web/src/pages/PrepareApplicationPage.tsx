import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PreparationRunStepper } from "@/components/prepare/PreparationRunStepper";
import { ResumeReviewInterface } from "@/components/prepare/ResumeReviewInterface";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useArtifactsQuery,
  usePrepareApplicationMutation,
  useSingleMatchQuery,
} from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";

export function PrepareApplicationPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeRunId, setActiveRunId] = useState<string | null>(
    searchParams.get("runId") || null,
  );
  const [isPreparingRun, setIsPreparingRun] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const matchQuery = useSingleMatchQuery(matchId);
  const artifactsQuery = useArtifactsQuery(matchId);
  const prepareMutation = usePrepareApplicationMutation();

  const artifacts = artifactsQuery.data || [];
  const resumeArtifact = artifacts.find((a) => a.type === "tailored_resume");
  const companyArtifact = artifacts.find((a) => a.type === "company_insight");

  // Determine whether to show Run Screen or Review Interface
  const hasExistingArtifacts = Boolean(resumeArtifact);

  const startPreparation = useCallback(async () => {
    if (!matchId) return;
    try {
      setIsPreparingRun(true);
      setPrepareError(null);
      const res = await prepareMutation.mutateAsync(matchId);
      setActiveRunId(res.runId);
      navigate({ search: `?runId=${res.runId}` }, { replace: true });
      toast.info("Preparation pipeline initiated. Streaming agent steps...", "Preparation Started");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to initiate application preparation. Please verify your profile first.";
      setPrepareError(msg);
      toast.error(msg, "Preparation Error");
    } finally {
      setIsPreparingRun(false);
    }
  }, [matchId, prepareMutation]);

  // Auto-initiate run if no artifacts exist and no run is active
  useEffect(() => {
    if (
      matchId &&
      !hasExistingArtifacts &&
      !activeRunId &&
      !isPreparingRun &&
      !prepareError &&
      !artifactsQuery.isLoading
    ) {
      void startPreparation();
    }
  }, [
    matchId,
    hasExistingArtifacts,
    activeRunId,
    isPreparingRun,
    prepareError,
    artifactsQuery.isLoading,
    startPreparation,
  ]);

  const handleStepperComplete = async () => {
    // Pipeline completed: refetch artifacts to display review screen
    await artifactsQuery.refetch();
    setActiveRunId(null);
    toast.success("Preparation materials ready for review!", "Pipeline Finished");
  };

  const handleRerun = () => {
    void startPreparation();
  };

  // Loading state
  if (matchQuery.isLoading || (artifactsQuery.isLoading && !activeRunId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">
          Loading preparation workspace...
        </p>
      </div>
    );
  }

  // Error state if match not found or preparation blocked
  if (matchQuery.isError && !matchQuery.data) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 rounded-2xl border border-destructive/20 bg-destructive/5 space-y-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-lg font-bold text-foreground">Target Match Not Found</h2>
        <p className="text-xs text-muted-foreground">
          The selected job opportunity was not found or has been removed.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/jobs")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Jobs</span>
        </Button>
      </div>
    );
  }

  const match = matchQuery.data;

  return (
    <div className="space-y-6 pb-16 animate-fade-in" data-testid="prepare-application-page">
      {/* Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/jobs")}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Opportunities</span>
          </Button>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-xs font-semibold text-foreground truncate max-w-xs sm:max-w-md">
            {match?.job?.title || "Application Preparation"}
          </span>
        </div>

        {hasExistingArtifacts && !activeRunId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRerun}
            disabled={isPreparingRun}
            className="gap-1.5 text-xs font-semibold"
          >
            {isPreparingRun ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>Re-run Preparation</span>
          </Button>
        )}
      </div>

      {/* Profile Not Verified / Error Banner */}
      {prepareError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-destructive">
                  Preparation Blocked: Profile Verification Required
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {prepareError}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="default"
                size="sm"
                asChild
                className="text-xs font-semibold gap-1.5"
              >
                <Link to="/onboarding">
                  <span>Verify Profile in Onboarding</span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={startPreparation}
                className="text-xs font-semibold gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Try Again</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Screen 1: Active Run Screen with Stepper */}
      {activeRunId && matchId ? (
        <div className="space-y-6">
          <PreparationRunStepper
            runId={activeRunId}
            matchId={matchId}
            onComplete={handleStepperComplete}
          />
        </div>
      ) : hasExistingArtifacts && resumeArtifact ? (
        /* Screen 2: Dedicated Review & Diff Interface */
        <ResumeReviewInterface
          match={match}
          resumeArtifact={resumeArtifact}
          companyArtifact={companyArtifact}
        />
      ) : (
        /* Standby / Initial State */
        <Card className="border shadow-sm p-8 text-center bg-card">
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
              <Wand2 className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Prepare Tailored Application Materials
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Launch our defensive multi-agent pipeline to gather company intelligence, rewrite your resume bullets to target key ATS keywords, and audit for zero fabrications.
            </p>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={startPreparation}
              disabled={isPreparingRun}
              className="gap-1.5 text-xs font-semibold shadow-sm px-6 h-9"
            >
              {isPreparingRun ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Initiating Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Start Preparation</span>
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
