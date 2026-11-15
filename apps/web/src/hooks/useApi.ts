import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AuthResponse,
  AuthUser,
  DeepHealthStatus,
  HealthStatus,
  JobEntity,
  LoginPayload,
  LogoutResponse,
  MatchesResponse,
  MatchEntity,
  ParsedProfile,
  RegisterPayload,
  ResumeEntity,
  SearchRunEntity,
} from "@jobpilot/shared";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

// ============================================================================
// Query Keys
// ============================================================================
export const queryKeys = {
  health: ["health"] as const,
  deepHealth: ["health", "deep"] as const,
  currentUser: ["auth", "me"] as const,
  resumes: ["resumes"] as const,
  resume: (id: string) => ["resumes", id] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["jobs", id] as const,
  searches: ["searches"] as const,
  search: (id: string) => ["searches", id] as const,
  matches: (params?: Record<string, unknown>) => ["matches", params] as const,
  match: (id: string) => ["matches", "single", id] as const,
  artifacts: (matchId?: string) => ["artifacts", matchId] as const,
  artifact: (id: string) => ["artifacts", "detail", id] as const,
  run: (id: string) => ["runs", id] as const,
  applications: ["applications"] as const,
  application: (id: string) => ["applications", id] as const,
  analyticsSummary: ["analytics", "summary"] as const,
};

// ============================================================================
// Health Hooks
// ============================================================================
export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async (): Promise<HealthStatus> => {
      const res = await apiClient.get<HealthStatus>("/health");
      return res.data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDeepHealthQuery() {
  return useQuery({
    queryKey: queryKeys.deepHealth,
    queryFn: async (): Promise<DeepHealthStatus> => {
      const res = await apiClient.get<DeepHealthStatus>("/health/deep");
      return res.data;
    },
    staleTime: 30_000,
  });
}

// ============================================================================
// Auth Hooks
// ============================================================================
export function useCurrentUserQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async (): Promise<AuthUser> => {
      const res = await apiClient.get<{ user: AuthUser }>("/auth/me");
      return res.data.user;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useLoginMutation() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LoginPayload): Promise<AuthResponse> => {
      const res = await apiClient.post<AuthResponse>("/auth/login", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      queryClient.setQueryData(queryKeys.currentUser, data.user);
    },
  });
}

export function useRegisterMutation() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload): Promise<AuthResponse> => {
      const res = await apiClient.post<AuthResponse>("/auth/register", payload);
      return res.data;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      queryClient.setQueryData(queryKeys.currentUser, data.user);
    },
  });
}

export function useLogoutMutation() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<LogoutResponse> => {
      const res = await apiClient.post<LogoutResponse>("/auth/logout");
      return res.data;
    },
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
    },
  });
}

// ============================================================================
// Resumes Hooks
// ============================================================================
export function useResumesQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.resumes,
    queryFn: async (): Promise<ResumeEntity[]> => {
      const res = await apiClient.get<{ resumes: ResumeEntity[] }>("/resumes");
      return res.data.resumes;
    },
    enabled: isAuthenticated,
  });
}

export function useResumeQuery(id: string, options?: { refetchInterval?: number | false | ((query: unknown) => number | false) }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.resume(id),
    queryFn: async (): Promise<ResumeEntity> => {
      const res = await apiClient.get<{ resume: ResumeEntity; downloadUrl?: string }>(`/resumes/${id}`);
      return res.data.resume;
    },
    enabled: isAuthenticated && Boolean(id),
    refetchInterval: options?.refetchInterval,
  });
}

export function useUploadResumeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData): Promise<{ resume: ResumeEntity; downloadUrl?: string }> => {
      const res = await apiClient.post<{ resume: ResumeEntity; downloadUrl?: string }>("/resumes", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.resumes });
      queryClient.setQueryData(queryKeys.resume(data.resume._id), data.resume);
    },
  });
}

export function usePatchResumeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      profile,
    }: {
      id: string;
      profile: ParsedProfile;
    }): Promise<ResumeEntity> => {
      const res = await apiClient.patch<{ resume: ResumeEntity }>(`/resumes/${id}/profile`, profile);
      return res.data.resume;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.resumes });
      queryClient.setQueryData(queryKeys.resume(data._id), data);
    },
  });
}

export function useDeleteResumeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiClient.delete(`/resumes/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.resumes });
    },
  });
}

export function useVerifyResumeCheckQuery(id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ["resumes", id, "tailoring-check"] as const,
    queryFn: async (): Promise<{ verified: boolean; verifiedProfile?: ParsedProfile }> => {
      const res = await apiClient.get<{ verified: boolean; verifiedProfile?: ParsedProfile }>(
        `/resumes/${id}/tailoring-check`,
      );
      return res.data;
    },
    enabled: isAuthenticated && Boolean(id),
    retry: false,
  });
}

// ============================================================================
// Jobs Hooks
// ============================================================================
export function useJobQuery(id: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.job(id),
    queryFn: async () => {
      const res = await apiClient.get(`/jobs/${id}`);
      return res.data;
    },
    enabled: isAuthenticated && Boolean(id),
  });
}

export function useSaveJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post(`/jobs/${id}/save`);
      return res.data;
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.job(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications });
    },
  });
}

export function useUnsaveJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/jobs/${id}/save`);
      return res.data;
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.job(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications });
    },
  });
}

// ============================================================================
// Searches & Matches Hooks
// ============================================================================
export interface MatchesQueryParams {
  searchId?: string;
  minScore?: number;
  remote?: boolean | "true" | "false";
  sort?: "score_desc" | "score_asc" | "date_desc" | "date_asc";
  page?: number;
  limit?: number;
  source?: string;
  seniority?: string;
  savedOnly?: boolean;
}

export interface CreateSearchPayload {
  keywords?: string;
  query?: string;
  location?: string;
  remoteOnly?: boolean;
  seniority?: string;
  sources?: string[];
}

export function useCreateSearchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateSearchPayload) => {
      const keywords = payload.keywords || payload.query || "";
      const body = {
        keywords,
        location: payload.location,
        remoteOnly: payload.remoteOnly ?? false,
        seniority: payload.seniority,
        sources: payload.sources,
      };
      const res = await apiClient.post<{ data?: SearchRunEntity; _id?: string }>("/searches", body);
      return (res.data.data || res.data) as SearchRunEntity;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.searches });
    },
  });
}

export function useSearchQuery(id?: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.search(id || ""),
    queryFn: async (): Promise<SearchRunEntity> => {
      const res = await apiClient.get<{ data: SearchRunEntity }>(`/searches/${id}`);
      return res.data.data;
    },
    enabled: isAuthenticated && Boolean(id),
  });
}

export function useMatchesQuery(params?: MatchesQueryParams) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.matches(params as Record<string, unknown>),
    queryFn: async (): Promise<MatchesResponse> => {
      const queryParams: Record<string, unknown> = { ...params };
      if (typeof params?.remote === "boolean") {
        queryParams.remote = params.remote ? "true" : "false";
      }
      // Note: savedOnly is filtered client-side against savedJobIds set
      delete queryParams.savedOnly;
      delete queryParams.source;
      delete queryParams.seniority;

      const res = await apiClient.get<MatchesResponse>("/matches", { params: queryParams });
      return res.data;
    },
    enabled: isAuthenticated,
    staleTime: 10_000,
  });
}

export interface ArtifactEntity {
  _id: string;
  userId: string;
  matchId: string;
  type: "tailored_resume" | "company_insight" | "cover_letter" | "interview_pack";
  content: Record<string, unknown>;
  fabricationReport?: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionItem {
  id?: string;
  section?: string;
  index?: number;
  accepted: boolean;
}

export interface ApproveChangesPayload {
  approvedChangeIds?: string[];
  decisions?: DecisionItem[];
}

export interface PrepareApplicationResult {
  runId: string;
  status: string;
  matchId: string;
}

export function useSingleMatchQuery(matchId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.match(matchId || ""),
    queryFn: async (): Promise<MatchEntity> => {
      const res = await apiClient.get<{ data: MatchEntity }>(`/matches/${matchId}`);
      return res.data.data;
    },
    enabled: isAuthenticated && Boolean(matchId),
  });
}

export function usePrepareApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchId: string): Promise<PrepareApplicationResult> => {
      const res = await apiClient.post<{ data: PrepareApplicationResult }>(
        `/matches/${matchId}/prepare`,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications });
    },
  });
}

export function useArtifactsQuery(matchId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.artifacts(matchId),
    queryFn: async (): Promise<ArtifactEntity[]> => {
      const res = await apiClient.get<{ data: ArtifactEntity[] }>("/artifacts", {
        params: matchId ? { matchId } : undefined,
      });
      return res.data.data;
    },
    enabled: isAuthenticated && Boolean(matchId),
    staleTime: 5_000,
  });
}

export function useArtifactQuery(artifactId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.artifact(artifactId || ""),
    queryFn: async (): Promise<ArtifactEntity> => {
      const res = await apiClient.get<{ data: ArtifactEntity }>(`/artifacts/${artifactId}`);
      return res.data.data;
    },
    enabled: isAuthenticated && Boolean(artifactId),
  });
}

export function useApproveChangesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      artifactId,
      payload,
    }: {
      artifactId: string;
      payload: ApproveChangesPayload;
    }): Promise<ArtifactEntity> => {
      const res = await apiClient.patch<{ data: ArtifactEntity }>(
        `/artifacts/${artifactId}/approve-changes`,
        payload,
      );
      return res.data.data;
    },
    onSuccess: (updatedArtifact) => {
      void queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      void queryClient.setQueryData(
        queryKeys.artifact(updatedArtifact._id),
        updatedArtifact,
      );
    },
  });
}

export function useResumeRunMutation() {
  return useMutation({
    mutationFn: async (runId: string): Promise<unknown> => {
      const res = await apiClient.post<{ data: unknown }>(`/runs/${runId}/resume`);
      return res.data.data;
    },
  });
}

export function useRunSnapshotQuery(runId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.run(runId || ""),
    queryFn: async (): Promise<Record<string, unknown>> => {
      const res = await apiClient.get<{ data: Record<string, unknown> }>(`/runs/${runId}`);
      return res.data.data;
    },
    enabled: isAuthenticated && Boolean(runId),
  });
}

// ============================================================================
// ============================================================================
// Applications Hooks
// ============================================================================
export type ApplicationColumnStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

export interface StatusHistoryEntry {
  status: ApplicationColumnStatus;
  changedAt: string;
  note?: string;
}

export interface ApplicationDetailItem {
  _id: string;
  userId?: string;
  jobId: JobEntity | { _id: string; title: string; company: string; location?: string; salary?: string; url?: string };
  matchId?: MatchEntity | { _id: string; score: number; matchedSkills?: string[]; missingSkills?: string[] } | null;
  status: ApplicationColumnStatus;
  statusHistory?: StatusHistoryEntry[];
  notes?: string;
  order?: number;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedApplicationsData {
  saved: ApplicationDetailItem[];
  applied: ApplicationDetailItem[];
  interview: ApplicationDetailItem[];
  offer: ApplicationDetailItem[];
  rejected: ApplicationDetailItem[];
}

export interface ApplicationsData {
  grouped: GroupedApplicationsData;
  all: ApplicationDetailItem[];
  savedJobIds: Set<string>;
}

export function useApplicationsQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.applications,
    queryFn: async (): Promise<ApplicationsData> => {
      const res = await apiClient.get<{
        data?: GroupedApplicationsData | ApplicationDetailItem[];
        applications?: ApplicationDetailItem[];
      }>("/applications");

      const raw = res.data.data ?? res.data.applications ?? [];

      let grouped: GroupedApplicationsData = {
        saved: [],
        applied: [],
        interview: [],
        offer: [],
        rejected: [],
      };
      let all: ApplicationDetailItem[] = [];

      if (raw && !Array.isArray(raw) && typeof raw === "object") {
        grouped = {
          saved: (raw as GroupedApplicationsData).saved || [],
          applied: (raw as GroupedApplicationsData).applied || [],
          interview: (raw as GroupedApplicationsData).interview || [],
          offer: (raw as GroupedApplicationsData).offer || [],
          rejected: (raw as GroupedApplicationsData).rejected || [],
        };
        all = [
          ...grouped.saved,
          ...grouped.applied,
          ...grouped.interview,
          ...grouped.offer,
          ...grouped.rejected,
        ];
      } else if (Array.isArray(raw)) {
        all = raw as ApplicationDetailItem[];
        for (const item of all) {
          const status = (item.status || "saved") as keyof GroupedApplicationsData;
          if (grouped[status]) {
            grouped[status].push(item);
          } else {
            grouped.saved.push(item);
          }
        }
      }

      const savedJobIds = new Set<string>();
      for (const item of grouped.saved) {
        const jId =
          typeof item.jobId === "object" && item.jobId
            ? (item.jobId as JobEntity)._id
            : String(item.jobId || "");
        if (jId) savedJobIds.add(jId);
      }

      return { grouped, all, savedJobIds };
    },
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
}

export function useCreateApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      jobId?: string;
      matchId?: string;
      notes?: string;
    }): Promise<ApplicationDetailItem> => {
      const res = await apiClient.post<{ data: ApplicationDetailItem; application?: ApplicationDetailItem }>(
        "/applications",
        payload,
      );
      return res.data.data ?? (res.data.application as ApplicationDetailItem);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSummary });
    },
  });
}

export function useUpdateApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      status?: ApplicationColumnStatus;
      notes?: string;
      order?: number;
      note?: string;
      appliedAt?: string | null;
    }): Promise<ApplicationDetailItem> => {
      const res = await apiClient.patch<{ data: ApplicationDetailItem; application?: ApplicationDetailItem }>(
        `/applications/${id}`,
        patch,
      );
      return res.data.data ?? (res.data.application as ApplicationDetailItem);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSummary });
    },
  });
}

export function useDeleteApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiClient.delete(`/applications/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSummary });
    },
  });
}

// ============================================================================
// Analytics Hooks
// ============================================================================
export interface AnalyticsData {
  totals: {
    applications: number;
    matches: number;
    resumes: number;
  };
  funnel: {
    counts: {
      saved: number;
      applied: number;
      interview: number;
      offer: number;
      rejected: number;
    };
    conversionRates: {
      savedToApplied: number;
      appliedToInterview: number;
      interviewToOffer: number;
      overallConversion: number;
    };
  };
  applicationsPerWeek: Array<{
    week: string;
    count: number;
  }>;
  averageMatchScore: number;
  averageMatchScoreByStatus: Array<{
    status: ApplicationColumnStatus;
    averageScore: number;
    count: number;
  }>;
  topMissingSkills: Array<{
    skill: string;
    count: number;
    suggestion: string;
  }>;
  llmUsage: Array<{
    date: string;
    runsCount: number;
    totalCostUsd: number;
  }>;
}

export function useAnalyticsSummaryQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.analyticsSummary,
    queryFn: async (): Promise<AnalyticsData> => {
      const res = await apiClient.get<{ data?: AnalyticsData; summary?: AnalyticsData }>(
        "/analytics/summary",
      );
      return res.data.data ?? (res.data.summary as AnalyticsData);
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}
