import type { components, paths } from "./api-types.js";

export type {
  AnalyticsSummary,
  ApiErrorDetail,
  ApiErrorResponse,
  ApplicationItem,
  ApplicationStatus,
  AuthResponse,
  AuthUser,
  CompanySize,
  DatePostedFilter,
  DeepHealthChecks,
  DeepHealthStatus,
  DependencyCheckStatus,
  EmploymentType,
  ExperienceLevel,
  GroupedApplications,
  HealthStatus,
  JobEntity,
  JobPreferences,
  JobSalary,
  LoginPayload,
  LogoutResponse,
  MatchesPagination,
  MatchesResponse,
  MatchEntity,
  OriginalFileRef,
  PreferenceLocation,
  PreferenceSalary,
  ProfileLink,
  RegisterPayload,
  ResumeDetail,
  ResumeEntity,
  ResumeListItem,
  ResumeStatus,
  SalaryPeriod,
  ScholarshipAward,
  ScoreBreakdown,
  SearchDiagnostics,
  SearchPreset,
  SearchProgressEvent,
  SearchRunEntity,
  SkillGroup,
  SourceAvailabilityInfo,
  SourceStatusItem,
  UserPreferencesDocument,
  UserQuotaCounters,
  VersionInfo,
  WorkMode,
} from "./types.js";

import type { ProfileLink, SkillGroup, ScholarshipAward } from "./types.js";

export { PIPELINE_VERSION } from "./types.js";

export type { components, paths };

type RawWorkExperience = components["schemas"]["WorkExperience"];
type RawEducation = components["schemas"]["Education"];
type RawProject = components["schemas"]["Project"];
type RawParsedProfile = components["schemas"]["ParsedProfile"];

// Lossless profile schema type definitions extending OpenAPI components
export type WorkExperience = RawWorkExperience & {
  location?: string | null;
  is_current?: boolean | null;
};

export type Education = RawEducation & {
  expected?: boolean | null;
  gpa_scale?: string | null;
  coursework?: string[];
};

export type Project = RawProject & {
  context_line?: string | null;
  start?: string | null;
  end?: string | null;
  year?: string | null;
  tech_stack?: string[];
  bullets?: string[];
  links?: (string | ProfileLink)[];
};

export type ParsedProfile = Omit<RawParsedProfile, "links" | "experience" | "education" | "projects"> & {
  headline?: string | null;
  links?: (string | ProfileLink)[];
  skill_groups?: SkillGroup[];
  experience?: WorkExperience[];
  education?: Education[];
  projects?: Project[];
  scholarships?: ScholarshipAward[];
  [key: string]: unknown;
};

export type ProfileSkill = components["schemas"]["ProfileSkill"];
export type Certification = components["schemas"]["Certification"];
export type LanguageProficiency = components["schemas"]["LanguageProficiency"];

export type JobPosting = components["schemas"]["JobPosting"];
export type MatchResult = components["schemas"]["MatchResult"];
export type MatchScoreBreakdown = components["schemas"]["MatchScoreBreakdown"];
export type CompanyInsight = components["schemas"]["CompanyInsight"];
export type TailoredResume = components["schemas"]["TailoredResume"];
export type ResumeChange = components["schemas"]["ResumeChange"];
export type AtsReport = components["schemas"]["AtsReport"];
export type AtsSectionCheck = components["schemas"]["AtsSectionCheck"];
export type FabricationReport = components["schemas"]["FabricationReport"];
export type UnsupportedClaim = components["schemas"]["UnsupportedClaim"];

export type ApiMeta = components["schemas"]["ApiMeta"];
export type ParseResumeRequest = components["schemas"]["Body_parse_resume_v1_parse_resume_post"];
export type ParseResumeResponse = components["schemas"]["ParseResumeResponse"];
export type MatchJobRequest = components["schemas"]["MatchJobRequest"];
export type MatchJobResponse = components["schemas"]["MatchJobResponse"];
export type BatchMatchRequest = components["schemas"]["BatchMatchRequest"];
export type BatchMatchResponse = components["schemas"]["BatchMatchResponse"];
export type CompanyResearchRequest = components["schemas"]["CompanyResearchRequest"];
export type CompanyResearchResponse = components["schemas"]["CompanyResearchResponse"];
export type TailorResumeRequest = components["schemas"]["TailorResumeRequest"];
export type TailorResumeResponse = components["schemas"]["TailorResumeResponse"];
export type CheckFabricationRequest = components["schemas"]["CheckFabricationRequest"];
export type CheckFabricationResponse = components["schemas"]["CheckFabricationResponse"];
