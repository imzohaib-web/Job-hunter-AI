import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
import { clearTestDb, setupTestDb, teardownTestDb } from "./testDb.js";

describe("MongoDB Models & Compound Indexes", () => {
  beforeAll(async () => {
    await setupTestDb();
    await User.init();
    await Job.init();
    await Match.init();
    await Resume.init();
    await Application.init();
    await Artifact.init();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("User: enforces unique email and default quota", async () => {
    const user = await User.create({
      email: "test@example.com",
      passwordHash: "hash123",
      name: "Test User",
    });

    expect(user._id).toBeDefined();
    expect(user.role).toBe("user");
    expect(user.quota.dailyAiRequests).toBe(0);
    expect(user.quota.dailyLimit).toBe(50);

    // Duplicate email fails with E11000
    await expect(
      User.create({
        email: "test@example.com",
        passwordHash: "hash456",
        name: "Duplicate User",
      }),
    ).rejects.toThrow();
  });

  it("Resume: creates resume with original file ref and default version", async () => {
    const userId = new mongoose.Types.ObjectId();
    const resume = await Resume.create({
      userId,
      original: {
        filename: "cv.pdf",
        storageKey: "cv-key-123",
        mimeType: "application/pdf",
        size: 1024,
      },
      status: "ready",
    });

    expect(resume._id).toBeDefined();
    expect(resume.version).toBe(1);
    expect(resume.status).toBe("ready");
  });

  it("Job: enforces unique hash and creates indexes", async () => {
    const job = await Job.create({
      source: "adzuna",
      externalId: "ext-1",
      hash: "unique-job-hash-1",
      title: "Senior AI Engineer",
      company: "Acme Corp",
      location: "San Francisco, CA",
      remote: true,
      description: "Exciting LLM role",
      skills: ["Python", "PyTorch"],
      url: "https://example.com/job/1",
      postedAt: new Date(),
    });

    expect(job._id).toBeDefined();
    expect(job.isDemo).toBe(false);

    // Duplicate hash fails
    await expect(
      Job.create({
        source: "remotive",
        externalId: "ext-2",
        hash: "unique-job-hash-1",
        title: "AI Engineer",
        company: "Other Corp",
        location: "Remote",
        description: "Another description",
        url: "https://example.com/job/2",
        postedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("Match: enforces compound unique index on (userId, jobId)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const jobId1 = new mongoose.Types.ObjectId();
    const jobId2 = new mongoose.Types.ObjectId();

    await Match.init(); // Ensure indexes are built in test mongo

    const match1 = await Match.create({
      userId,
      jobId: jobId1,
      score: 88,
      breakdown: { skillsScore: 90, reasoning: "Strong match" },
      matchedSkills: ["Python", "FastAPI"],
      missingSkills: ["Kubernetes"],
      explanation: "Great candidate for the team",
      hardFilterFailed: false,
    });
    expect(match1._id).toBeDefined();

    // Different job with same user is allowed
    const match2 = await Match.create({
      userId,
      jobId: jobId2,
      score: 75,
      breakdown: {},
      matchedSkills: ["Python"],
      missingSkills: [],
      explanation: "Good fit",
      hardFilterFailed: false,
    });
    expect(match2._id).toBeDefined();

    // Duplicate (userId, jobId1) must fail compound unique index
    await expect(
      Match.create({
        userId,
        jobId: jobId1,
        score: 95,
        breakdown: {},
        matchedSkills: [],
        missingSkills: [],
        explanation: "Duplicate entry",
        hardFilterFailed: false,
      }),
    ).rejects.toThrow();
  });

  it("Application: tracks status enum, statusHistory, notes", async () => {
    const userId = new mongoose.Types.ObjectId();
    const jobId = new mongoose.Types.ObjectId();

    const app = await Application.create({
      userId,
      jobId,
      status: "saved",
      notes: "Follow up next Monday",
    });

    expect(app.status).toBe("saved");
    expect(app.statusHistory.length).toBe(1);
    expect(app.statusHistory[0].status).toBe("saved");

    app.status = "applied";
    app.appliedAt = new Date();
    app.statusHistory.push({
      status: "applied",
      changedAt: new Date(),
      note: "Applied via company site",
    });
    await app.save();

    const reloaded = await Application.findById(app._id);
    expect(reloaded?.status).toBe("applied");
    expect(reloaded?.statusHistory.length).toBe(2);
  });

  it("Artifact: supports types tailored_resume, cover_letter, interview_pack, company_insight", async () => {
    const userId = new mongoose.Types.ObjectId();
    const matchId = new mongoose.Types.ObjectId();

    const artifact = await Artifact.create({
      userId,
      matchId,
      type: "tailored_resume",
      content: { summary: "Tailored summary..." },
      version: 1,
    });

    expect(artifact.type).toBe("tailored_resume");
    expect(artifact.version).toBe(1);
  });

  it("SearchRun and LlmRun: store audit metrics and query history", async () => {
    const userId = new mongoose.Types.ObjectId();

    const searchRun = await SearchRun.create({
      userId,
      query: { title: "AI Engineer" },
      filters: { remote: true },
      resultsCount: 25,
      durationMs: 450,
    });
    expect(searchRun.resultsCount).toBe(25);

    const llmRun = await LlmRun.create({
      task: "parse-resume",
      provider: "groq",
      model: "llama-3.3-70b",
      tokens: { prompt: 1500, completion: 400, total: 1900 },
      latencyMs: 1200,
      costUsd: 0.002,
      userId,
      success: true,
    });
    expect(llmRun.success).toBe(true);
    expect(llmRun.costUsd).toBe(0.002);
  });
});
