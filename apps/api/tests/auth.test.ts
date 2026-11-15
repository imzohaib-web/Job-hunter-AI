import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  Application,
  Artifact,
  Job,
  LlmRun,
  Match,
  Resume,
  SearchRun,
  User,
} from "../src/models/index.js";
import { getStorageService } from "../src/services/storage/index.js";
import { clearTestDb, setupTestDb, teardownTestDb } from "./testDb.js";

describe("Auth Lifecycle & Security Middleware", () => {
  const app = createApp();

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("Full Auth Lifecycle: register -> login -> refresh -> me -> logout", async () => {
    // 1. Register
    const regRes = await request(app).post("/api/auth/register").send({
      name: "Alice Engineer",
      email: "alice@example.com",
      password: "securePassword123!",
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.user).toMatchObject({
      name: "Alice Engineer",
      email: "alice@example.com",
      role: "user",
    });
    expect(typeof regRes.body.accessToken).toBe("string");
    expect(regRes.headers["x-request-id"]).toBeDefined();

    const cookies = regRes.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/jobpilot_refresh_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);

    // 2. Duplicate registration fails with 409
    const dupRes = await request(app).post("/api/auth/register").send({
      name: "Alice Clone",
      email: "alice@example.com",
      password: "securePassword123!",
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe("CONFLICT");

    // 3. Login
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "securePassword123!",
    });
    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.accessToken;
    const loginCookie = loginRes.headers["set-cookie"][0];

    // Wrong password fails
    const badLogin = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "wrongPassword!",
    });
    expect(badLogin.status).toBe(401);
    expect(badLogin.body.error.code).toBe("UNAUTHORIZED");

    // 4. GET /api/auth/me (authenticated)
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe("alice@example.com");

    // GET /api/auth/me (unauthenticated)
    const unauthRes = await request(app).get("/api/auth/me");
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error.code).toBe("UNAUTHORIZED");

    // 5. POST /api/auth/refresh (token rotation)
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", loginCookie);
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.accessToken).toBe("string");
    const rotatedCookie = refreshRes.headers["set-cookie"][0];
    expect(rotatedCookie).toBeDefined();

    // Reusing the old rotated refresh token fails (revoked)
    const reuseRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", loginCookie);
    expect(reuseRes.status).toBe(401);

    // 6. POST /api/auth/logout
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", rotatedCookie);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Refresh after logout fails
    const postLogoutRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", rotatedCookie);
    expect(postLogoutRefresh.status).toBe(401);
  });

  it("Validation Errors: returns standard VALIDATION_ERROR shape", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "",
      email: "not-an-email",
      password: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
      },
    });
    expect(res.body.error.details).toBeDefined();
  });

  it("DELETE /api/me: cascade delete removes user and all associated documents & files", async () => {
    // 1. Register a user
    const reg = await request(app).post("/api/auth/register").send({
      name: "Delete Me",
      email: "deleteme@example.com",
      password: "password123!",
    });
    const { accessToken, user } = reg.body;
    const userId = user.id;

    // 2. Upload and store a test file in object storage
    const storage = getStorageService();
    const storedFile = await storage.upload(
      Buffer.from("%PDF-1.4 test document content"),
      "test_resume.pdf",
      "application/pdf",
    );

    // 3. Create associated documents across all collections
    const job = await Job.create({
      source: "adzuna",
      externalId: "ext-del-1",
      hash: "hash-delete-cascade-test",
      title: "ML Engineer",
      company: "Data Corp",
      location: "Remote",
      description: "Build models",
      url: "https://example.com",
      postedAt: new Date(),
    });

    await Resume.create({
      userId,
      original: {
        filename: storedFile.filename,
        storageKey: storedFile.storageKey,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        uploadedAt: new Date(),
      },
      status: "ready",
    });

    const match = await Match.create({
      userId,
      jobId: job._id,
      score: 90,
      breakdown: {},
      matchedSkills: [],
      missingSkills: [],
      explanation: "Good",
      hardFilterFailed: false,
    });

    await Application.create({
      userId,
      jobId: job._id,
      status: "saved",
    });

    await Artifact.create({
      userId,
      matchId: match._id,
      type: "tailored_resume",
      content: { text: "test" },
    });

    await SearchRun.create({
      userId,
      query: "AI",
      resultsCount: 5,
    });

    await LlmRun.create({
      task: "test-task",
      provider: "groq",
      model: "test-model",
      tokens: 100,
      latencyMs: 200,
      costUsd: 0.0001,
      userId,
      success: true,
    });

    // 4. Verify file exists on disk
    const filePath = path.resolve(
      env.STORAGE_LOCAL_DIR ?? "./uploads",
      storedFile.storageKey,
    );
    const fileExistsBefore = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExistsBefore).toBe(true);

    // 5. Perform account deletion
    const delRes = await request(app)
      .delete("/api/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // 6. Assert ALL documents across all collections are deleted
    expect(await User.findById(userId)).toBeNull();
    expect(await Resume.find({ userId })).toHaveLength(0);
    expect(await Match.find({ userId })).toHaveLength(0);
    expect(await Application.find({ userId })).toHaveLength(0);
    expect(await Artifact.find({ userId })).toHaveLength(0);
    expect(await SearchRun.find({ userId })).toHaveLength(0);
    expect(await LlmRun.find({ userId })).toHaveLength(0);

    // 7. Assert underlying storage file was deleted
    const fileExistsAfter = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExistsAfter).toBe(false);
  });
});
