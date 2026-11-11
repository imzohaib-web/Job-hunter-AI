import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const valid = {
  NODE_ENV: "test",
  PORT: "3001",
  LOG_LEVEL: "silent",
  MONGODB_URI: "mongodb://localhost:27017/jobpilot-test",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "test-access-secret-change-me-32chars!",
  JWT_REFRESH_SECRET: "test-refresh-secret-change-me-32chars",
  CORS_ORIGIN: "http://localhost:5173",
  AI_SERVICE_URL: "http://ai-service.test",
  AI_SERVICE_KEY: "test-ai-service-key",
};

describe("parseEnv", () => {
  it("accepts a complete env", () => {
    const env = parseEnv(valid);
    expect(env.AI_SERVICE_KEY).toBe("test-ai-service-key");
    expect(env.PORT).toBe(3001);
  });

  it("lists missing required variables", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "test",
      }),
    ).toThrow(/Missing or invalid environment variables/);
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/MONGODB_URI/);
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/AI_SERVICE_KEY/);
  });
});
