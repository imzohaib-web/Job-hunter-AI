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
