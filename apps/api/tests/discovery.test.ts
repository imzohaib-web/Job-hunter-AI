import MockAdapter from "axios-mock-adapter";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Job } from "../src/models/Job.js";
import { Match } from "../src/models/Match.js";
import { Resume } from "../src/models/Resume.js";
import { SearchRun } from "../src/models/SearchRun.js";
import { processDiscoveryJob } from "../src/queues/discoveryWorker.js";
import { aiClient } from "../src/services/aiClient.js";
import { appEventBus } from "../src/services/eventBus.js";
import { clearTestDb, setupTestDb, teardownTestDb } from "./testDb.js";

describe("Prompt 13: Job Discovery, Ranking, Queue Pipeline & Matches", () => {
  const app = createApp();
  let aiMock: MockAdapter;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    await setupTestDb();
    aiMock = new MockAdapter(aiClient);
  });

  afterAll(async () => {
    aiMock.restore();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    aiMock.reset();

    // Register a standard user
    const regRes = await request(app).post("/api/auth/register").send({
      name: "Discovery Candidate",
      email: "candidate@example.com",
      password: "password123!",
    });
    userToken = regRes.body.accessToken;
    userId = regRes.body.user.id;

    // Seed a verified resume profile for candidate
    await Resume.create({
      userId,
      original: {
        filename: "candidate.pdf",
        storageKey: "resumes/candidate.pdf",
        mimeType: "application/pdf",
        size: 1024,
        uploadedAt: new Date(),
      },
      version: 1,
      status: "ready",
      verifiedProfile: {
        name: "Discovery Candidate",
        email: "candidate@example.com",
        summary: "Staff AI Engineer with Python and PyTorch experience.",
        skills: [
          { name: "Python", category: "languages" },
          { name: "PyTorch", category: "frameworks" },
          { name: "FastAPI", category: "frameworks" },
        ],
        experience: [
          {
            title: "Senior AI Engineer",
            company: "Tech AI",
            bullets: ["Built search and ranking systems."],
          },
        ],
        embedding: [0.12, 0.34, 0.56],
      },
    });
  });

  it("10-minute Idempotency: submitting the identical search within 10 minutes reuses existing SearchRun", async () => {
    const searchPayload = {
      keywords: "AI Engineer",
      location: "San Francisco",
      remoteOnly: true,
      seniority: "senior",
      sources: ["greenhouse", "lever"],
    };

    // First search creates new run (201 Created)
    const firstRes = await request(app)
      .post("/api/searches")
      .set("Authorization", `Bearer ${userToken}`)
      .send(searchPayload);

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.data._id).toBeDefined();
    const firstId = firstRes.body.data._id;

    // Second search within 10 minutes returns existing run (200 OK)
    const secondRes = await request(app)
      .post("/api/searches")
      .set("Authorization", `Bearer ${userToken}`)
      .send(searchPayload);

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data._id).toBe(firstId);
    expect(secondRes.body.message).toMatch(/Reusing active search run/);

    const runCount = await SearchRun.countDocuments({ userId });
    expect(runCount).toBe(1);
  });

  it("Worker pipeline with mocked aiClient & Deduplication on upsert", async () => {
    const mockJobsResponse = {
      data: {
        jobs: [
          {
            source: "greenhouse",
            external_id: "gh-101",
            hash: "greenhouse:gh-101:ai-lead:openai",
            title: "AI Lead",
            company: "OpenAI",
            location: "San Francisco, CA",
            remote: true,
            description: "Lead cutting edge LLM projects with Python and PyTorch",
            skills: ["Python", "PyTorch", "Kubernetes"],
            url: "https://example.com/gh-101",
            posted_at: new Date().toISOString(),
            embedding: [0.1, 0.2, 0.3],
          },
          {
            source: "lever",
            external_id: "lev-202",
            hash: "lever:lev-202:ml-dev:anthropic",
            title: "ML Developer",
            company: "Anthropic",
            location: "Remote",
            remote: false,
            description: "Work on safety models",
            skills: ["Python", "Rust"],
            url: "https://example.com/lev-202",
            posted_at: new Date().toISOString(),
            embedding: [0.4, 0.5, 0.6],
          },
        ],
        total: 2,
        source_statuses: [
          { source: "greenhouse", status: "ok", count: 1 },
          { source: "lever", status: "ok", count: 1 },
        ],
      },
    };

    const mockRankResponse = {
      data: {
        ranked_jobs: [
          {
            job: {
              job: mockJobsResponse.data.jobs[0],
            },
            match: {
              score: 94,
              breakdown: { skillsScore: 95, semanticScore: 92 },
              matched_skills: ["Python", "PyTorch"],
              missing_skills: ["Kubernetes"],
              explanation: "Strong background in Python and PyTorch.",
              hard_filter_failed: false,
            },
          },
          {
            job: {
              job: mockJobsResponse.data.jobs[1],
            },
            match: {
              score: 72,
              breakdown: { skillsScore: 70, semanticScore: 74 },
              matched_skills: ["Python"],
              missing_skills: ["Rust"],
              explanation: "Candidate lacks Rust proficiency.",
              hard_filter_failed: false,
            },
          },
        ],
        total: 2,
      },
    };

    aiMock.onPost("/v1/search-jobs").reply(200, mockJobsResponse);
    aiMock.onPost("/v1/rank").reply(200, mockRankResponse);

    const searchRun = await SearchRun.create({
      userId,
      query: { keywords: "AI Lead" },
      status: "pending",
    });

    // Run discovery worker
    await processDiscoveryJob({
      searchId: searchRun._id.toString(),
      userId,
      query: { keywords: "AI Lead" },
    });

    // Check jobs were inserted
    const jobs = await Job.find({ source: { $in: ["greenhouse", "lever"] } });
    expect(jobs.length).toBe(2);

    // Verify embedding was stored
    const ghJob = jobs.find((j) => j.externalId === "gh-101");
    expect(ghJob?.embedding).toHaveLength(3);

    // Verify Match records were created
    const matches = await Match.find({ userId });
    expect(matches.length).toBe(2);
    const topMatch = matches.find((m) => m.score === 94);
    expect(topMatch).toBeDefined();
    expect(topMatch?.matchedSkills).toContain("Python");
    expect(topMatch?.missingSkills).toContain("Kubernetes");

    // Check SearchRun was updated to completed with counts and durationMs
    const updatedRun = await SearchRun.findById(searchRun._id);
    expect(updatedRun?.status).toBe("completed");
    expect(updatedRun?.resultsCount).toBe(2);
    expect(updatedRun?.perSourceCounts).toHaveProperty("greenhouse", 1);
    expect(updatedRun?.durationMs).toBeGreaterThanOrEqual(0);

    // DEDUPE ON UPSERT: Run the same worker execution again
    await processDiscoveryJob({
      searchId: searchRun._id.toString(),
      userId,
      query: { keywords: "AI Lead" },
    });

    // Job count must STILL be 2 (zero duplicates)
    const jobsAfterRerun = await Job.find({ source: { $in: ["greenhouse", "lever"] } });
    expect(jobsAfterRerun.length).toBe(2);
  });

  it("GET /api/matches: pagination, filters and sorting", async () => {
    // Seed candidate jobs and matches
    const job1 = await Job.create({
      source: "greenhouse",
      externalId: "j1",
      hash: "hash:j1",
      title: "Senior AI Engineer",
      company: "Company A",
      location: "San Francisco",
      remote: true,
      description: "AI job",
      skills: ["Python"],
      url: "https://example.com/j1",
      postedAt: new Date(),
    });

    const job2 = await Job.create({
      source: "lever",
      externalId: "j2",
      hash: "hash:j2",
      title: "Data Analyst",
      company: "Company B",
      location: "Austin",
      remote: false,
      description: "Data job",
      skills: ["SQL"],
      url: "https://example.com/j2",
      postedAt: new Date(),
    });

    await Match.create({
      userId,
      jobId: job1._id,
      score: 92,
      matchedSkills: ["Python"],
      missingSkills: [],
      explanation: "Great match",
      hardFilterFailed: false,
    });

    await Match.create({
      userId,
      jobId: job2._id,
      score: 55,
      matchedSkills: [],
      missingSkills: ["SQL"],
      explanation: "Weak match",
      hardFilterFailed: false,
    });

    // 1. Pagination default
    const allRes = await request(app)
      .get("/api/matches")
      .set("Authorization", `Bearer ${userToken}`);
    expect(allRes.status).toBe(200);
    expect(allRes.body.data.length).toBe(2);
    expect(allRes.body.pagination.total).toBe(2);

    // 2. Filter minScore=80
    const filterScoreRes = await request(app)
      .get("/api/matches?minScore=80")
      .set("Authorization", `Bearer ${userToken}`);
    expect(filterScoreRes.status).toBe(200);
    expect(filterScoreRes.body.data.length).toBe(1);
    expect(filterScoreRes.body.data[0].score).toBe(92);

    // 3. Filter remote=true
    const filterRemoteRes = await request(app)
      .get("/api/matches?remote=true")
      .set("Authorization", `Bearer ${userToken}`);
    expect(filterRemoteRes.status).toBe(200);
    expect(filterRemoteRes.body.data.length).toBe(1);
    expect(filterRemoteRes.body.data[0].jobId.remote).toBe(true);

    // 4. Job Details, Save & Unsave
    const getJobRes = await request(app)
      .get(`/api/jobs/${job1._id}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(getJobRes.status).toBe(200);
    expect(getJobRes.body.data.title).toBe("Senior AI Engineer");

    const saveRes = await request(app)
      .post(`/api/jobs/${job1._id}/save`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.data.status).toBe("saved");

    const unsaveRes = await request(app)
      .delete(`/api/jobs/${job1._id}/save`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(unsaveRes.status).toBe(200);
    expect(unsaveRes.body.ok).toBe(true);
  });

  it("SSE Progress Stream: GET /api/searches/:id/events emits ordered events", async () => {
    const searchRun = await SearchRun.create({
      userId,
      query: { keywords: "ML Ops" },
      status: "processing",
    });

    // Emit completed event after connection opens
    setTimeout(() => {
      appEventBus.emitSearchEvent(searchRun._id.toString(), {
        type: "status",
        status: "ranking",
        message: "Ranking candidates",
      });
      appEventBus.emitSearchEvent(searchRun._id.toString(), {
        type: "completed",
        status: "completed",
        resultsCount: 5,
      });
    }, 100);

    const sseRes = await request(app)
      .get(`/api/searches/${searchRun._id}/events`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(sseRes.status).toBe(200);
    expect(sseRes.headers["content-type"]).toContain("text/event-stream");
    expect(sseRes.text).toContain('"status":"processing"');
    expect(sseRes.text).toContain('"ranking"');
    expect(sseRes.text).toContain('"completed"');
    expect(sseRes.text).toContain('"resultsCount":5');
  });

  it("Bull Board dashboard at /admin/queues: blocks non-admin with 403", async () => {
    const res = await request(app)
      .get("/admin/queues")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
