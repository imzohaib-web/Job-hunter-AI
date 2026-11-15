import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Skeleton } from "@/components/ui/skeleton";
import { useResumesQuery } from "@/hooks/useApi";

export function OnboardingPage() {
  const { data: resumes, isLoading } = useResumesQuery();

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto space-y-4 py-8">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const latestResume = resumes && resumes.length > 0 ? resumes[0] : null;

  return (
    <div className="py-4">
      <OnboardingWizard initialResume={latestResume} />
    </div>
  );
}
