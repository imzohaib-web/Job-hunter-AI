import { AlertCircle, CheckCircle2, FileSearch, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useResumeQuery } from "@/hooks/useApi";
import type { ResumeEntity } from "@jobpilot/shared";

interface ParsingStatusProps {
  resumeId: string;
  initialResume?: ResumeEntity;
  onReady: (resume: ResumeEntity) => void;
  onRetry: () => void;
}

const PARSING_STEPS = [
  { id: "upload", label: "File uploaded successfully" },
  { id: "ocr", label: "Extracting text and scanning layout" },
  { id: "llm", label: "AI extracting work history, education & skills" },
  { id: "ready", label: "Structuring verified profile fields" },
];

export function ParsingStatus({
  resumeId,
  initialResume,
  onReady,
  onRetry,
}: ParsingStatusProps) {
  const [activeStep, setActiveStep] = useState(1);

  const { data: resume, isError, error } = useResumeQuery(resumeId, {
    refetchInterval: (query: unknown) => {
      const q = query as { state?: { data?: ResumeEntity } };
      const currentStatus = q?.state?.data?.status;
      if (currentStatus === "ready" || currentStatus === "failed") {
        return false;
      }
      return 1500;
    },
  });

  const currentResume = resume ?? initialResume;
  const status = currentResume?.status ?? "processing";

  // Simulate step progression visually during processing
  useEffect(() => {
    if (status === "ready") {
      setActiveStep(4);
      const timer = setTimeout(() => {
        if (currentResume) {
          onReady(currentResume);
        }
      }, 600);
      return () => clearTimeout(timer);
    }

    if (status === "processing") {
      const stepTimer = setInterval(() => {
        setActiveStep((prev) => (prev < 3 ? prev + 1 : prev));
      }, 2000);
      return () => clearInterval(stepTimer);
    }
  }, [status, currentResume, onReady]);

  if (status === "failed" || isError) {
    return (
      <Card className="border-destructive/30 shadow-lg text-center p-6">
        <CardHeader className="flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-2">
            <AlertCircle className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">Parsing Failed</CardTitle>
          <CardDescription>
            {currentResume?.error ||
              (error instanceof Error ? error.message : "We could not parse this resume file.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pt-4">
          <Button onClick={onRetry} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Upload Another Resume
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border">
      <CardHeader className="text-center pb-2">
        <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3 animate-pulse">
          <FileSearch className="h-7 w-7" />
        </div>
        <CardTitle className="text-xl">Analyzing Your Resume</CardTitle>
        <CardDescription>
          Our AI parser is extracting and standardizing your experience and skills.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <div className="space-y-3">
          {PARSING_STEPS.map((step, idx) => {
            const isCompleted = status === "ready" || idx < activeStep;
            const isCurrent = status !== "ready" && idx === activeStep;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3.5 rounded-lg p-3 transition-colors ${
                  isCurrent
                    ? "bg-primary/5 border border-primary/20"
                    : isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground opacity-60"
                }`}
              >
                <div className="shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border border-muted-foreground/30 flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="text-sm font-medium">{step.label}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
