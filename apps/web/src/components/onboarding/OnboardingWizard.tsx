import { Check, FileText, Filter, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { JobPreferencesStep } from "@/components/onboarding/JobPreferencesStep";
import { ParsingStatus } from "@/components/onboarding/ParsingStatus";
import { ProfileReviewForm } from "@/components/onboarding/ProfileReviewForm";
import { ResumeUploader } from "@/components/onboarding/ResumeUploader";
import type { ResumeEntity } from "@jobpilot/shared";

export type OnboardingStep = "upload" | "parsing" | "review" | "preferences";

interface OnboardingWizardProps {
  initialResume?: ResumeEntity | null;
  initialStep?: OnboardingStep;
}

export function OnboardingWizard({
  initialResume = null,
  initialStep,
}: OnboardingWizardProps) {
  const navigate = useNavigate();

  const determineInitialStep = (): OnboardingStep => {
    if (initialStep) return initialStep;
    if (!initialResume) return "upload";
    if (initialResume.status === "processing" || initialResume.status === "uploading") {
      return "parsing";
    }
    if (initialResume.verifiedProfile) return "preferences";
    return "review";
  };

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(determineInitialStep);
  const [currentResume, setCurrentResume] = useState<ResumeEntity | null>(initialResume);

  const stepsHeader = [
    { id: "upload", label: "1. Upload Resume", icon: Upload },
    { id: "review", label: "2. Verify Profile", icon: FileText },
    { id: "preferences", label: "3. Job Preferences", icon: Filter },
  ];

  const getStepNumber = (step: OnboardingStep): number => {
    if (step === "upload" || step === "parsing") return 1;
    if (step === "review") return 2;
    return 3;
  };

  const activeStepNum = getStepNumber(currentStep);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Wizard Step Progress Bar */}
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          {stepsHeader.map((s, idx) => {
            const stepNum = idx + 1;
            const isCompleted = activeStepNum > stepNum;
            const isCurrent = activeStepNum === stepNum;

            return (
              <div key={s.id} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                      isCompleted
                        ? "bg-emerald-600 text-white"
                        : isCurrent
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                  </div>
                  <span
                    className={`mt-1.5 text-[11px] font-medium hidden sm:inline-block ${
                      isCurrent
                        ? "text-foreground font-semibold"
                        : isCompleted
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60"
                    }`}
                  >
                    {s.label.split(". ")[1]}
                  </span>
                </div>

                {idx < stepsHeader.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 transition-all ${
                      activeStepNum > stepNum ? "bg-emerald-600" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Views */}
      <div className="transition-all">
        {currentStep === "upload" && (
          <div className="max-w-xl mx-auto">
            <ResumeUploader
              onUploaded={(resume) => {
                setCurrentResume(resume);
                if (resume.status === "ready") {
                  setCurrentStep("review");
                } else {
                  setCurrentStep("parsing");
                }
              }}
            />
          </div>
        )}

        {currentStep === "parsing" && currentResume && (
          <div className="max-w-xl mx-auto">
            <ParsingStatus
              resumeId={currentResume._id}
              initialResume={currentResume}
              onReady={(readyResume) => {
                setCurrentResume(readyResume);
                setCurrentStep("review");
              }}
              onRetry={() => {
                setCurrentResume(null);
                setCurrentStep("upload");
              }}
            />
          </div>
        )}

        {currentStep === "review" && currentResume && (
          <ProfileReviewForm
            resume={currentResume}
            onConfirmed={(confirmedResume) => {
              setCurrentResume(confirmedResume);
              setCurrentStep("preferences");
            }}
            onBack={() => setCurrentStep("upload")}
          />
        )}

        {currentStep === "preferences" && (
          <JobPreferencesStep
            verifiedProfile={
              currentResume?.verifiedProfile ?? currentResume?.parsedProfile ?? undefined
            }
            onSearchStarted={(searchId) => {
              // Seamlessly navigate to job matches with started search
              navigate(`/jobs?searchId=${searchId}`);
            }}
            onBack={() => currentResume && setCurrentStep("review")}
          />
        )}
      </div>
    </div>
  );
}
