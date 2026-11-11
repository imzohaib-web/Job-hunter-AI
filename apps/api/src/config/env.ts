import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
  AI_SERVICE_URL: z.string().url("AI_SERVICE_URL must be a valid URL"),
  AI_SERVICE_KEY: z.string().min(1, "AI_SERVICE_KEY is required"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof envSchema>;

function formatEnvErrors(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  return `Missing or invalid environment variables:\n${lines
    .map((line) => `  - ${line}`)
    .join("\n")}`;
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(formatEnvErrors(parsed.error));
  }
  return parsed.data;
}

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid environment";
    console.error(message);
    process.exit(1);
  }
}

export const env: Env = loadEnv();
