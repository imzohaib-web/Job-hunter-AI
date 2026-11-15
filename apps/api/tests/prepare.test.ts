import MockAdapter from "axios-mock-adapter";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Application } from "../src/models/Application.js";
import { Artifact } from "../src/models/Artifact.js";
import { Job } from "../src/models/Job.js";
import { LlmRun } from "../src/models/LlmRun.js";
import { Match } from "../src/models/Match.js";
import { Resume } from "../src/models/Resume.js";
import { persistGraphArtifacts } from "../src/controllers/prepareController.js";
import { aiClient } from "../src/services/aiClient.js";
import { clearTestDb, setupTestDb, teardownTestDb } from "./testDb.js";

describe("Prompt 14: Application Preparation Flow, Artifacts & Tracker", () => {
  const app = createApp();
  let aiMock: MockAdapter;
  let userToken: string;
  let userId: string;
  let matchId: string;
  let jobId: string;

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

    const regRes = await request(app).post("/api/auth/register").send({
      name: "Job Preparer",
      email: "preparer@example.com",
      password: "password123!",
    });
    userToken = regRes.body.accessToken;
    userId = regRes.body.user.id;

    const job = await Job.create({
      source: "greenhouse",
      externalId: "target-job-1",
      hash: "hash:target-job-1",
      title: "Senior AI Platform Engineer",
      company: "Anthropic",
      location: "San Francisco, CA",
      remote: true,
      description: "Build robust AI agents and infrastructure.",
      skills: ["Python", "FastAPI", "Docker"],
      url: "https://anthropic.com/jobs/1",
      postedAt: new Date(),
    });
    jobId = job._id.toString();

    const match = await Match.create({
      userId,
      jobId: job._id,
      score: 91,
      matchedSkills: ["Python", "FastAPI"],
      missingSkills: ["Docker"],
      explanation: "High alignment with agentic systems.",
      hardFilterFailed: false,
    });
    matchId = match._id.toString();
  });

  it("409 Guard: Refuses prepare application if resume profile is not verified", async () => {
    // Seed unverified resume (only parsedProfile, no verifiedProfile)
    await Resume.create({
      userId,
      original: {
        filename: "unverified.pdf",
        storageKey: "resumes/unverified.pdf",
        mimeType: "application/pdf",
        size: 2048,
        uploadedAt: new Date(),
      },
      status: "ready",
      version: 1,
      parsedProfile: {
        name: "Job Preparer",
        email: "preparer@example.com",
        summary: "Draft summary",
      },
    });

    const res = await request(app)
      .post(`/api/matches/${matchId}/prepare`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PROFILE_NOT_VERIFIED");
  });

  it("Prepare Flow: calls ai-service graph, logs LlmRun without prompt text, and stores artifacts", async () => {
    // Seed verified resume
    await Resume.create({
      userId,
      original: {
        filename: "verified.pdf",
        storageKey: "resumes/verified.pdf",
        mimeType: "application/pdf",
        size: 4096,
        uploadedAt: new Date(),
      },
      status: "ready",
      version: 2,
      verifiedProfile: {
        name: "Job Preparer",
        email: "preparer@example.com",
        summary: "Verified Senior AI Engineer",
        skills: [{ name: "Python", category: "languages" }],
        experience: [
          {
            title: "AI Engineer",
            company: "PrevCo",
            bullets: ["Developed backend microservices"],
          },
        ],
      },
    });

    const mockRunId = "graph-run-123";
    aiMock.onPost("/v1/graphs/prepare-application").reply(202, {
      run_id: mockRunId,
      graph_type: "prepare-application",
      status: "queued",
    });

    const prepareRes = await request(app)
      .post(`/api/matches/${matchId}/prepare`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(prepareRes.status).toBe(202);
    expect(prepareRes.body.data.runId).toBe(mockRunId);

    // Verify LlmRun logged without prompt text
    const llmRuns = await LlmRun.find({ userId });
    expect(llmRuns.length).toBe(1);
    expect(llmRuns[0].task).toBe("prepare-application");
    expect(llmRuns[0].success).toBe(true);
    // Ensure no prompt field leaked
    expect((llmRuns[0] as unknown as Record<string, unknown>).prompt).toBeUndefined();

    // Test persisting artifacts from completed graph state
    const mockGraphState = {
      final_result: {
        tailored_resume: {
          sections: {
            name: "Job Preparer",
            summary: "Tailored Staff AI Specialist",
            experience: [
              {
                title: "AI Engineer",
                company: "PrevCo",
                bullets: ["Engineered low-latency FastAPI pipelines"],
              },
            ],
          },
          changes: [
            {
              section: "summary",
              before: "Verified Senior AI Engineer",
              after: "Tailored Staff AI Specialist",
              reason: "Align with lead position",
              source_fact_ref: "profile.summary",
            },
          ],
          fabrication_report: {
            claims_checked: 1,
            unsupported_claims: [],
            passed: true,
          },
        },
        cover_letter: {
          text: "Dear Hiring Team at Anthropic...",
        },
        interview_pack: {
          questions: ["Explain your experience with FastAPI"],
        },
        company_insight: {
          summary: "Anthropic is an AI safety and research company.",
        },
      },
    };

    await persistGraphArtifacts(userId, matchId, mockGraphState);

    const artifacts = await Artifact.find({ userId, matchId });
    expect(artifacts.length).toBe(4);
    const types = artifacts.map((a) => a.type);
    expect(types).toContain("tailored_resume");
    expect(types).toContain("cover_letter");
    expect(types).toContain("interview_pack");
    expect(types).toContain("company_insight");
  });

  it("Approve Changes: PATCH /api/artifacts/:id/approve-changes updates resume JSON", async () => {
    const resumeArtifact = await Artifact.create({
      userId,
      matchId,
      type: "tailored_resume",
      version: 1,
      content: {
        sections: {
          name: "Candidate",
          summary: "Old summary",
          experience: [
            {
              bullets: ["Old bullet 1", "Old bullet 2"],
            },
          ],
        },
        changes: [
          {
            section: "summary",
            before: "Old summary",
            after: "New tailored summary",
            reason: "Better alignment",
            source_fact_ref: "profile.summary",
          },
          {
            section: "experience",
            before: "Old bullet 1",
            after: "New bullet 1 with quantifiable impact",
            reason: "Better metrics",
            source_fact_ref: "profile.experience[0]",
          },
        ],
      },
    });

    const approveRes = await request(app)
      .patch(`/api/artifacts/${resumeArtifact._id}/approve-changes`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        decisions: [
          { index: 0, accepted: true },
          { index: 1, accepted: true },
        ],
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.version).toBe(2);

    const updatedContent = approveRes.body.data.content;
    expect(updatedContent.sections.summary).toBe("New tailored summary");
    expect(updatedContent.sections.experience[0].bullets[0]).toBe(
      "New bullet 1 with quantifiable impact",
    );
  });

  it("Export DOCX: POST /api/artifacts/:id/export streams binary file", async () => {
    const artifact = await Artifact.create({
      userId,
      matchId,
      type: "tailored_resume",
      version: 1,
      content: {
        sections: {
          name: "Export Candidate",
          summary: "ATS resume export",
        },
      },
    });

    const fakeDocxBuffer = Buffer.from("fake-docx-binary-content");
    aiMock.onPost("/v1/export-resume-docx").reply(200, fakeDocxBuffer, {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": 'attachment; filename="Export_Candidate_ATS_Resume.docx"',
    });

    const exportRes = await request(app)
      .post(`/api/artifacts/${artifact._id}/export?format=docx`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-disposition"]).toContain(".docx");
  });

  it("Applications CRUD & Kanban grouping", async () => {
    // 1. Create application from match
    const createRes = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        matchId,
        notes: "Targeting this role first",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe("saved");
    const appId = createRes.body.data._id;

    // 2. Patch status transition (append to statusHistory)
    const patchRes = await request(app)
      .patch(`/api/applications/${appId}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        status: "applied",
        note: "Submitted application via company website",
        order: 1,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.status).toBe("applied");
    expect(patchRes.body.data.statusHistory.length).toBe(2);
    expect(patchRes.body.data.appliedAt).toBeDefined();

    // Transition to interview
    await request(app)
      .patch(`/api/applications/${appId}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        status: "interview",
        note: "Screening scheduled",
      });

    // 3. GET /api/applications grouped for Kanban
    const kanbanRes = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${userToken}`);

    expect(kanbanRes.status).toBe(200);
    expect(kanbanRes.body.data).toHaveProperty("saved");
    expect(kanbanRes.body.data).toHaveProperty("applied");
    expect(kanbanRes.body.data).toHaveProperty("interview");
    expect(kanbanRes.body.data.interview.length).toBe(1);
    expect(kanbanRes.body.data.interview[0]._id).toBe(appId);
  });

  it("Analytics Aggregation: GET /api/analytics/summary returns correct funnel numbers", async () => {
    // Seed additional applications across funnel
    await Application.create({
      userId,
      jobId,
      status: "saved",
      order: 0,
      createdAt: new Date(),
    });
    await Application.create({
      userId,
      jobId,
      status: "applied",
      order: 1,
      appliedAt: new Date(),
      createdAt: new Date(),
    });
    await Application.create({
      userId,
      jobId,
      status: "interview",
      order: 2,
      appliedAt: new Date(),
      createdAt: new Date(),
    });
    await Application.create({
      userId,
      jobId,
      status: "offer",
      order: 3,
      appliedAt: new Date(),
      createdAt: new Date(),
    });

    // Seed LlmRun
    await LlmRun.create({
      userId,
      task: "prepare-application",
      provider: "ai-service",
      model: "graph-orchestrator",
      tokens: { prompt: 1000, completion: 500, total: 1500 },
      latencyMs: 1200,
      costUsd: 0.005,
      success: true,
    });

    const summaryRes = await request(app)
      .get("/api/analytics/summary")
      .set("Authorization", `Bearer ${userToken}`);

    expect(summaryRes.status).toBe(200);
    const { totals, funnel, averageMatchScore, topMissingSkills, llmUsage } =
      summaryRes.body.data;

    expect(totals.applications).toBe(4);
    expect(totals.matches).toBe(1);

    expect(funnel.counts.saved).toBe(1);
    expect(funnel.counts.applied).toBe(1);
    expect(funnel.counts.interview).toBe(1);
    expect(funnel.counts.offer).toBe(1);

    expect(funnel.conversionRates.savedToApplied).toBe(100);
    expect(funnel.conversionRates.appliedToInterview).toBe(100);
    expect(funnel.conversionRates.interviewToOffer).toBe(100);

    expect(averageMatchScore).toBe(91); // applied/interview/offer job match score
    expect(topMissingSkills).toEqual(
      expect.arrayContaining([expect.objectContaining({ skill: "Docker", count: 1 })]),
    );

    expect(llmUsage.length).toBeGreaterThanOrEqual(1);
    expect(llmUsage[0].totalCostUsd).toBe(0.005);
  });
});
