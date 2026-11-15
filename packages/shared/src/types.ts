import type { ParsedProfile } from "./index.js";

/** Shared placeholder types — expand as the API and AI service stabilize. */
export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  service: string;
  timestamp: string;
}

export type DependencyCheckStatus = "ok" | "error";

export interface DeepHealthChecks {
  api: DependencyCheckStatus;
  aiService: DependencyCheckStatus;
  mongo: DependencyCheckStatus;
  redis: DependencyCheckStatus;
}

export interface DeepHealthStatus extends HealthStatus {
  checks: DeepHealthChecks;
}

// User & Auth types
export interface UserQuotaCounters {
  dailyAiRequests: number;
  lastResetDate: string; // YYYY-MM-DD
  dailyLimit: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  quota?: UserQuotaCounters;
  createdAt?: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

// Resume & Profile entity types
export type ResumeStatus = "uploading" | "processing" | "ready" | "failed";

export interface OriginalFileRef {
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface ResumeEntity {
  _id: string;
  userId: string;
  original: OriginalFileRef;
  parsedProfile?: ParsedProfile | null;
  verifiedProfile?: ParsedProfile | null;
  version: number;
  status: ResumeStatus;
  warnings?: string[];
  fieldConfidences?: Record<string, number>;
  error?: string | null;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeListItem {
  id: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  status: "pending" | "processing" | "ready" | "failed";
  error?: string;
  hasVerifiedProfile: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDetail extends ResumeListItem {
  profile?: Record<string, unknown>;
  rawTextPreview?: string;
}

// Job preferences
export interface JobPreferences {
  roles: string[];
  locations: string[];
  remoteOnly: boolean;
  seniority: string;
  salaryMin?: number;
  salaryMax?: number;
  excludedKeywords?: string[];
}

// Job discovery & Match entities
export interface JobSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: "hourly" | "weekly" | "monthly" | "yearly";
  text?: string;
}

export interface JobEntity {
  _id: string;
  source: string;
  externalId: string;
  hash?: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary?: JobSalary | string | null;
  description: string;
  skills: string[];
  url: string;
  postedAt: string;
  isDemo?: boolean;
  companyInsight?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScoreBreakdown {
  semantic?: number;
  keyword?: number;
  skills?: number;
  experience?: number;
  location?: number;
  reasoning?: string;
  [key: string]: unknown;
}

export interface MatchEntity {
  _id: string;
  userId: string;
  jobId: JobEntity | string;
  job?: JobEntity;
  searchId?: string;
  score: number;
  breakdown: ScoreBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
  hardFilterFailed?: boolean;
  isSaved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchesPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MatchesResponse {
  data: MatchEntity[];
  pagination: MatchesPagination;
}

export interface SourceStatusItem {
  source: string;
  status: "ok" | "skipped" | "failed" | "error";
  count: number;
  reason?: string | null;
  error?: string | null;
  durationMs?: number;
}

export interface SearchDiagnostics {
  fetched: number;
  afterDedupe: number;
  afterHardFilters: number;
  ranked: number;
  mainFilterRemoved?: string | null;
  sourceStatuses?: SourceStatusItem[];
}

export interface SearchRunEntity {
  _id: string;
  userId: string;
  query: string | Record<string, unknown>;
  filters?: Record<string, unknown>;
  perSourceCounts?: Record<string, number>;
  sourceStatuses?: SourceStatusItem[];
  diagnostics?: SearchDiagnostics | null;
  resultsCount: number;
  status: "pending" | "running" | "completed" | "failed";
  error?: string | null;
  errorStack?: string | null;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchProgressEvent {
  type: "status" | "progress" | "source_complete" | "completed" | "failed";
  status?: string;
  source?: string;
  count?: number;
  resultsCount?: number;
  perSourceCounts?: Record<string, number>;
  sourceStatuses?: SourceStatusItem[];
  diagnostics?: SearchDiagnostics | null;
  durationMs?: number;
  error?: string;
  errorStack?: string;
}

// Application & Analytics types
export type ApplicationStatus = "saved" | "applied" | "interviewing" | "offered" | "rejected";

export interface ApplicationItem {
  id?: string;
  _id?: string;
  jobId: string | JobEntity;
  companyName?: string;
  jobTitle?: string;
  jobLocation?: string;
  status: ApplicationStatus;
  appliedDate?: string;
  notes?: string;
  salary?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupedApplications {
  saved: ApplicationItem[];
  applied: ApplicationItem[];
  interview: ApplicationItem[];
  offer: ApplicationItem[];
  rejected: ApplicationItem[];
}

export interface AnalyticsSummary {
  totalApplications: number;
  statusCounts: Record<string, number>;
  totalMatches: number;
  averageMatchScore: number;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
}
