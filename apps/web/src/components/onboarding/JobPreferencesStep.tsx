import type { ParsedProfile, JobPreferences } from "@jobpilot/shared";
import {
  FormPreferences,
  JobPreferencesForm,
} from "@/components/preferences/JobPreferencesForm";
import { Button } from "@/components/ui/button";
import {
  useCreateSearchMutation,
  usePreferencesQuery,
  useSourceStatusesQuery,
  useUpdatePreferencesMutation,
} from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";

interface JobPreferencesStepProps {
  verifiedProfile?: ParsedProfile;
  onSearchStarted: (searchId: string) => void;
  onBack?: () => void;
}

export function JobPreferencesStep({
  verifiedProfile,
  onSearchStarted,
  onBack,
}: JobPreferencesStepProps) {
  const createSearchMutation = useCreateSearchMutation();
  const updatePreferencesMutation = useUpdatePreferencesMutation();
  const { data: prefDoc } = usePreferencesQuery();
  const sourceStatusesQuery = useSourceStatusesQuery();

  const handleSaveAndFindJobs = async (data: FormPreferences) => {
    try {
      await updatePreferencesMutation.mutateAsync({
        preferences: data as JobPreferences,
        activePresetId: prefDoc?.activePresetId,
      });

      const primaryTitle =
        data.targetTitles[0] ||
        (verifiedProfile?.experience?.[0]?.title ?? "Software Engineer");
      const primaryLocation = data.locations[0]?.label || data.locations[0]?.city || "";
      const isRemoteOnly =
        data.workModes.includes("remote") && !data.workModes.includes("on-site");

      toast.info("Starting job discovery with your preferences...", "Discovery Started");

      const searchRun = await createSearchMutation.mutateAsync({
        query: primaryTitle,
        keywords: primaryTitle,
        location: primaryLocation || undefined,
        remoteOnly: isRemoteOnly,
        sources: data.sources,
        preferences: data as JobPreferences,
      });

      const searchId = searchRun._id || "latest";
      onSearchStarted(searchId);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { code?: string; message?: string } } };
      };
      const errCode = axiosErr.response?.data?.error?.code;
      const errMsg = axiosErr.response?.data?.error?.message;
      if (errCode === "AI_SERVICE_UNAVAILABLE" || errMsg?.includes("still starting")) {
        toast.error(
          errMsg || "The AI service is still starting, try again in a moment",
          "AI Service Starting",
        );
      } else {
        toast.error("Failed to start job search. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <div className="flex justify-start">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to Profile Review
          </Button>
        </div>
      )}

      <JobPreferencesForm
        initialPreferences={prefDoc?.preferences}
        profile={verifiedProfile}
        presets={prefDoc?.presets || []}
        activePresetId={prefDoc?.activePresetId}
        availableSources={sourceStatusesQuery.data}
        isSaving={updatePreferencesMutation.isPending}
        isSearching={createSearchMutation.isPending}
        onSave={async (data) => {
          try {
            await updatePreferencesMutation.mutateAsync({
              preferences: data as JobPreferences,
              activePresetId: prefDoc?.activePresetId,
            });
            toast.success("Preferences updated successfully.");
          } catch {
            toast.error("Failed to update preferences.");
          }
        }}
        onSaveAndFindJobs={handleSaveAndFindJobs}
      />
    </div>
  );
}
