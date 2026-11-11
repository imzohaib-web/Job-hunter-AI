const schema = {
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME ?? "JobPilot",
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "",
} as const;

export const webEnv = schema;
