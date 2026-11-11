import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

vi.mock("../src/services/healthChecks.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/healthChecks.js")>(
    "../src/services/healthChecks.js",
  );
  return {
    ...actual,
    runDeepHealthChecks: vi.fn(async () => ({
      api: "ok",
      aiService: "ok",
      mongo: "ok",
      redis: "ok",
    })),
  };
});

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "api",
    });
    expect(typeof res.body.timestamp).toBe("string");
  });
});

describe("GET /api/health/deep", () => {
  it("returns dependency checks", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health/deep");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "api",
      checks: {
        api: "ok",
        aiService: "ok",
        mongo: "ok",
        redis: "ok",
      },
    });
  });
});
