import type { components, paths } from "./api-types.js";

export type {
  DeepHealthChecks,
  DeepHealthStatus,
  DependencyCheckStatus,
  HealthStatus,
} from "./types.js";

export type { components, paths };

// Convenient direct schema type exports
export type ParsedProfile = components["schemas"]["ParsedProfile"];
export type ProfileSkill = components["schemas"]["ProfileSkill"];
export type WorkExperience = components["schemas"]["WorkExperience"];
export type Education = components["schemas"]["Education"];
export type Project = components["schemas"]["Project"];
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
