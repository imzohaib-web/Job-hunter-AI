import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import {
  FormPreferences,
  JobPreferencesForm,
} from "@/components/preferences/JobPreferencesForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateSearchMutation,
  useDeletePresetMutation,
  usePreferencesQuery,
  useResumeQuery,
  useResumesQuery,
  useSavePresetMutation,
  useSourceStatusesQuery,
  useUpdatePreferencesMutation,
} from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";
import type { JobPreferences, SearchPreset } from "@jobpilot/shared";

export function JobPreferencesPage() {
  const navigate = useNavigate();

  // Load preferences from API
  const { data: prefDoc, isLoading: isPrefsLoading } = usePreferencesQuery();
  const updatePreferencesMutation = useUpdatePreferencesMutation();
  const savePresetMutation = useSavePresetMutation();
  const deletePresetMutation = useDeletePresetMutation();
  const sourceStatusesQuery = useSourceStatusesQuery();
  const createSearchMutation = useCreateSearchMutation();

  // Load latest verified profile from resumes
  const resumesQuery = useResumesQuery();
  const latestResumeId = useMemo(() => {
    const list = resumesQuery.data || [];
    return list.length ? list[0]._id : null;
  }, [resumesQuery.data]);

  const latestResumeQuery = useResumeQuery(latestResumeId);
  const candidateProfile = latestResumeQuery.data?.parsedProfile || null;

  // Handlers
  const handleSavePreferences = async (data: FormPreferences) => {
    try {
      await updatePreferencesMutation.mutateAsync({
        preferences: data as JobPreferences,
        activePresetId: prefDoc?.activePresetId,
      });
      toast.success("Job preferences saved successfully.");
    } catch {
      toast.error("Failed to save preferences. Please check your network and try again.");
    }
  };

  const handleSaveAndFindJobs = async (data: FormPreferences) => {
    try {
      // 1. Save preferences first
      await updatePreferencesMutation.mutateAsync({
        preferences: data as JobPreferences,
        activePresetId: prefDoc?.activePresetId,
      });

      // 2. Determine initial search query keywords and params
      const primaryTitle =
        data.targetTitles[0] ||
        (candidateProfile?.experience?.[0]?.title ?? "Software Engineer");
      const primaryLocation = data.locations[0]?.label || data.locations[0]?.city || "";
      const isRemoteOnly =
        data.workModes.includes("remote") && !data.workModes.includes("on-site");

      toast.info("Preferences saved. Launching multi-source job discovery...", "Discovery Started");

      // 3. Trigger discovery search run
      const searchRun = await createSearchMutation.mutateAsync({
        query: primaryTitle,
        keywords: primaryTitle,
        location: primaryLocation || undefined,
        remoteOnly: isRemoteOnly,
        sources: data.sources,
        preferences: data as JobPreferences,
      });

      // 4. Navigate to Jobs page with the new searchId
      const searchId = searchRun._id;
      if (searchId) {
        navigate(`/jobs?searchId=${searchId}`);
      } else {
        navigate("/jobs");
      }
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

  const handleSavePreset = async (name: string, data: FormPreferences) => {
    try {
      await savePresetMutation.mutateAsync({
        name,
        preferences: data as JobPreferences,
      });
      toast.success(`Search preset "${name}" saved.`);
    } catch {
      toast.error("Failed to save search preset.");
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      await deletePresetMutation.mutateAsync(presetId);
      toast.info("Search preset removed.");
    } catch {
      toast.error("Failed to remove preset.");
    }
  };

  const handleApplyPreset = (preset: SearchPreset) => {
    toast.info(`Loaded preset: ${preset.name}`);
  };

  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Job Preferences & Criteria
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Configure your target titles, compensation thresholds, work modes, and search sources.
            These settings drive multi-source job scraping, local filtering, and AI matching.
          </p>
        </div>

        {candidateProfile && (
          <div className="flex items-center gap-2 self-start md:self-auto bg-muted/40 border border-border px-3 py-1.5 rounded-lg text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span>Profile pre-filled for {candidateProfile.name || "verified candidate"}</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isPrefsLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : (
        <JobPreferencesForm
          initialPreferences={prefDoc?.preferences}
          profile={candidateProfile}
          presets={prefDoc?.presets || []}
          activePresetId={prefDoc?.activePresetId}
          availableSources={sourceStatusesQuery.data}
          isSaving={updatePreferencesMutation.isPending}
          isSearching={createSearchMutation.isPending}
          onSave={handleSavePreferences}
          onSaveAndFindJobs={handleSaveAndFindJobs}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
          onApplyPreset={handleApplyPreset}
        />
      )}
    </div>
  );
}
