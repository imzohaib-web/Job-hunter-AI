import fs from "node:fs/promises";
import path from "node:path";
import MockAdapter from "axios-mock-adapter";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { Resume } from "../src/models/Resume.js";
import * as resumeQueueModule from "../src/queues/resumeQueue.js";
import { processParseResumeJob } from "../src/queues/resumeWorker.js";
import { aiClient } from "../src/services/aiClient.js";
import { getStorageService } from "../src/services/storage/index.js";
import { AppError } from "../src/types/errors.js";
import { clearTestDb, setupTestDb, teardownTestDb } from "./testDb.js";

describe("Resume Upload, Worker, Review and Verification Flow", () => {
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

    // Create authenticated user for test cases
    const regRes = await request(app).post("/api/auth/register").send({
      name: "Resume Tester",
      email: "resume.tester@example.com",
      password: "password123!",
    });
    userToken = regRes.body.accessToken;
    userId = regRes.body.user.id;
  });

  it("Upload Validation: rejects missing file, invalid extension, renamed .exe, and oversized file", async () => {
    // 1. Missing file
    const noFile = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`);
    expect(noFile.status).toBe(400);
    expect(noFile.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(noFile.body.error.requestId).toBeDefined();

    // 2. Invalid extension (.txt)
    const txtFile = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", Buffer.from("plain text resume"), "resume.txt");
    expect(txtFile.status).toBe(400);
    expect(txtFile.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(txtFile.body.error.message).toContain("Unsupported file type");

    // 3. Renamed executable (.exe renamed to .pdf with 'MZ' magic bytes)
    const mzExeBuffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff,
      0x00, 0x00, 0xb8, 0x00, 0x00, 0x00,
    ]);
    const spoofedFile = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", mzExeBuffer, "resume.pdf");
    expect(spoofedFile.status).toBe(400);
    expect(spoofedFile.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(spoofedFile.body.error.message).toContain("does not match allowed types");

    // 4. Oversized file (> 5 MB)
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, "%PDF-1.4");
    const oversizedFile = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", largeBuffer, "large_resume.pdf");
    expect(oversizedFile.status).toBe(413);
    expect(oversizedFile.body.error.code).toBe("FILE_TOO_LARGE");
    expect(oversizedFile.body.error.message).toContain("5 MB");
    expect(oversizedFile.body.error.requestId).toBeDefined();
  });

  it("uploads a valid fixture PDF through real route with mocked ai-service", async () => {
    const fixturePdf = await fs.readFile(
      path.resolve(__dirname, "fixtures/valid_resume.pdf"),
    );

    const mockProfile = {
      name: "Alex Morgan",
      email: "alex.morgan@example.com",
      summary: "Senior AI Engineer",
      skills: [
        { name: "TypeScript", category: "Languages" },
        { name: "Python", category: "Languages" },
      ],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
      field_confidence: { name: 0.99, email: 0.99 },
    };

    aiMock.onPost("/v1/parse-resume").reply(200, {
      data: mockProfile,
      warnings: [],
      meta: { duration_ms: 120 },
    });

    const res = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", fixturePdf, "valid_resume.pdf");

    expect(res.status).toBe(201);
    expect(res.body.resume).toBeDefined();
    expect(res.body.resume.status).toBe("ready");
    expect(res.body.resume.parsedProfile.name).toBe("Alex Morgan");
    expect(res.body.downloadUrl).toBeDefined();
  });

  it("uploads a valid fixture DOCX through real route with mocked ai-service", async () => {
    const fixtureDocx = await fs.readFile(
      path.resolve(__dirname, "fixtures/valid_resume.docx"),
    );

    const mockProfile = {
      name: "Taylor Swift",
      email: "taylor.swift@example.com",
      summary: "Full Stack Engineer",
      skills: [{ name: "React", category: "Frameworks" }],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
      field_confidence: { name: 0.95 },
    };

    aiMock.onPost("/v1/parse-resume").reply(200, {
      data: mockProfile,
      warnings: [],
      meta: { duration_ms: 150 },
    });

    const res = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", fixtureDocx, "valid_resume.docx");

    expect(res.status).toBe(201);
    expect(res.body.resume).toBeDefined();
    expect(res.body.resume.status).toBe("ready");
    expect(res.body.resume.parsedProfile.name).toBe("Taylor Swift");
  });

  it("Error Code STORAGE_FAILED: returns 500 when file storage upload fails", async () => {
    const storage = getStorageService();
    const originalUpload = storage.upload.bind(storage);
    storage.upload = vi
      .fn()
      .mockRejectedValue(new Error("Disk write error: EACCES permission denied"));

    try {
      const validPdf = Buffer.from("%PDF-1.4 dummy valid header");
      const res = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${userToken}`)
        .attach("file", validPdf, "storage_test.pdf");

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("STORAGE_FAILED");
      expect(res.body.error.message).toContain("Failed to store resume file");
      expect(res.body.error.requestId).toBeDefined();
    } finally {
      storage.upload = originalUpload;
    }
  });

  it("Error Code QUEUE_UNAVAILABLE: returns 503 when queue enqueue fails", async () => {
    const enqueueSpy = vi
      .spyOn(resumeQueueModule, "enqueueResumeParse")
      .mockRejectedValue(
        new AppError(
          "QUEUE_UNAVAILABLE",
          "Resume processing queue is currently unavailable. Please try again later.",
          503,
        ),
      );

    try {
      const validPdf = Buffer.from("%PDF-1.4 dummy valid header");
      const res = await request(app)
        .post("/api/resumes")
        .set("Authorization", `Bearer ${userToken}`)
        .attach("file", validPdf, "queue_test.pdf");

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("QUEUE_UNAVAILABLE");
      expect(res.body.error.message).toContain("queue is currently unavailable");
      expect(res.body.error.requestId).toBeDefined();
    } finally {
      enqueueSpy.mockRestore();
    }
  });

  it("Error Code PARSER_UNAVAILABLE: handles parser service down / network error", async () => {
    aiMock.onPost("/v1/parse-resume").networkError();

    // 1. Synchronous route returns 503 PARSER_UNAVAILABLE
    const validPdf = Buffer.from("%PDF-1.4 dummy valid header");
    const res = await request(app)
      .post("/api/resumes?sync=true")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", validPdf, "parser_unavail.pdf");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PARSER_UNAVAILABLE");
    expect(res.body.error.message).toContain("unavailable");

    // 2. Direct worker execution updates resume status to failed with code
    const storage = getStorageService();
    const stored = await storage.upload(
      validPdf,
      "parser_unavail_worker.pdf",
      "application/pdf",
    );
    const resume = await Resume.create({
      userId,
      original: {
        filename: stored.filename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedAt: new Date(),
      },
      status: "uploading",
    });

    await expect(
      processParseResumeJob({
        resumeId: resume._id.toString(),
        userId,
        storageKey: stored.storageKey,
        filename: stored.filename,
        mimeType: stored.mimeType,
      }),
    ).rejects.toMatchObject({ code: "PARSER_UNAVAILABLE" });

    const failedResume = await Resume.findById(resume._id);
    expect(failedResume?.status).toBe("failed");
    expect(failedResume?.error).toContain("PARSER_UNAVAILABLE");
  });

  it("Error Code PARSER_FAILED: handles parser 500 / unparseable output", async () => {
    aiMock
      .onPost("/v1/parse-resume")
      .reply(500, { detail: "Model token limit exceeded" });

    // 1. Synchronous route returns 502 PARSER_FAILED
    const validPdf = Buffer.from("%PDF-1.4 dummy valid header");
    const res = await request(app)
      .post("/api/resumes?sync=true")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", validPdf, "parser_failed.pdf");

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("PARSER_FAILED");
    expect(res.body.error.message).toContain("Resume parsing failed");

    // 2. Direct worker execution updates resume status to failed with code
    const storage = getStorageService();
    const stored = await storage.upload(
      validPdf,
      "parser_failed_worker.pdf",
      "application/pdf",
    );
    const resume = await Resume.create({
      userId,
      original: {
        filename: stored.filename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedAt: new Date(),
      },
      status: "uploading",
    });

    await expect(
      processParseResumeJob({
        resumeId: resume._id.toString(),
        userId,
        storageKey: stored.storageKey,
        filename: stored.filename,
        mimeType: stored.mimeType,
      }),
    ).rejects.toMatchObject({ code: "PARSER_FAILED" });

    const failedResume = await Resume.findById(resume._id);
    expect(failedResume?.status).toBe("failed");
    expect(failedResume?.error).toContain("PARSER_FAILED");
  });

  it("Upload + Worker Success Path: uploads PDF, worker parses and saves ready profile", async () => {
    const mockProfile = {
      name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+1-555-0199",
      location: "San Francisco, CA",
      links: ["https://linkedin.com/in/janedoe"],
      summary: "Experienced AI Engineer specializing in LLMs",
      skills: [
        {
          name: "Python",
          category: "Languages",
          years: 5,
          evidence: "5 years building apps",
        },
        { name: "FastAPI", category: "Frameworks", years: 3 },
      ],
      experience: [
        {
          company: "TechCorp",
          title: "Senior AI Engineer",
          start: "2022-01",
          end: "Present",
          bullets: ["Built production LLM pipelines"],
        },
      ],
      education: [
        {
          institution: "Stanford University",
          degree: "B.S. Computer Science",
          year: 2020,
        },
      ],
      projects: [
        {
          name: "JobPilot",
          description: "AI job hunt assistant",
          technologies: ["Node.js", "Python"],
        },
      ],
      certifications: [],
      languages: [{ language: "English", proficiency: "native" }],
      field_confidence: { name: 0.99, email: 0.98, skills: 0.92 },
    };

    aiMock.onPost("/v1/parse-resume").reply(200, {
      data: mockProfile,
      warnings: ["Minor: phone number format normalized"],
      meta: { duration_ms: 250 },
    });

    const validPdfBuffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Title (Resume) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
    );

    // 1. Upload valid PDF
    const uploadRes = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", validPdfBuffer, "jane_doe_resume.pdf");

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.resume).toBeDefined();
    expect(uploadRes.body.downloadUrl).toBeDefined();

    const resumeId = uploadRes.body.resume._id;
    const storageKey = uploadRes.body.resume.original.storageKey;

    // 2. Run worker job
    await processParseResumeJob({
      resumeId,
      userId,
      storageKey,
      filename: "jane_doe_resume.pdf",
      mimeType: "application/pdf",
    });

    // 3. Verify ready state in database
    const updated = await Resume.findById(resumeId);
    expect(updated?.status).toBe("ready");
    expect(updated?.parsedProfile).toMatchObject({
      name: "Jane Doe",
      email: "jane.doe@example.com",
    });
    expect(updated?.warnings).toContain("Minor: phone number format normalized");
    expect(updated?.fieldConfidences).toMatchObject({
      name: 0.99,
      email: 0.98,
    });
  });

  it("Worker Failure Path: sets status failed and captures error", async () => {
    aiMock.onPost("/v1/parse-resume").networkError();

    const storage = getStorageService();
    const stored = await storage.upload(
      Buffer.from("%PDF-1.4 unreadable resume bytes"),
      "broken.pdf",
      "application/pdf",
    );

    const resume = await Resume.create({
      userId,
      original: {
        filename: stored.filename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedAt: new Date(),
      },
      status: "uploading",
    });

    await expect(
      processParseResumeJob({
        resumeId: resume._id.toString(),
        userId,
        storageKey: stored.storageKey,
        filename: stored.filename,
        mimeType: stored.mimeType,
      }),
    ).rejects.toThrow();

    const failed = await Resume.findById(resume._id);
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBeDefined();
  });

  it("Profile Review & Verification: PATCH profile bumps version, saves verifiedProfile, and unlocks tailoring (409 guard)", async () => {
    // 1. Create a resume with parsedProfile but NO verifiedProfile yet
    const storage = getStorageService();
    const stored = await storage.upload(
      Buffer.from("%PDF-1.4 initial resume"),
      "candidate.pdf",
      "application/pdf",
    );

    const initialParsedProfile = {
      name: "Bob Smith",
      email: "bob@example.com",
      summary: "Software Developer",
      skills: [{ name: "Java", category: "Languages" }],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };

    const resume = await Resume.create({
      userId,
      original: {
        filename: stored.filename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedAt: new Date(),
      },
      parsedProfile: initialParsedProfile,
      verifiedProfile: null,
      version: 1,
      status: "ready",
    });

    // 2. GET /api/resumes and GET /api/resumes/:id
    const listRes = await request(app)
      .get("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.resumes.length).toBeGreaterThan(0);

    const getRes = await request(app)
      .get(`/api/resumes/${resume._id}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.resume.version).toBe(1);

    // 3. Tailoring check before verification returns 409 Conflict
    const unverifiedCheck = await request(app)
      .get(`/api/resumes/${resume._id}/tailoring-check`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(unverifiedCheck.status).toBe(409);
    expect(unverifiedCheck.body.error.code).toBe("CONFLICT");

    // 4. PATCH /api/resumes/:id/profile: user reviews and edits profile
    const verifiedData = {
      ...initialParsedProfile,
      name: "Robert Smith",
      summary: "Senior Full Stack AI Engineer with 6+ years experience",
      skills: [
        { name: "Java", category: "Languages", years: 6 },
        { name: "TypeScript", category: "Languages", years: 4 },
        { name: "Python", category: "Languages", years: 4 },
      ],
      experience: [
        {
          company: "Alpha Innovations",
          title: "Lead AI Engineer",
          start: "2021-03",
          end: "Present",
          bullets: ["Engineered scalable RAG pipelines"],
        },
      ],
      education: [
        {
          institution: "MIT",
          degree: "B.S. in Computer Science",
          year: 2019,
        },
      ],
    };

    const patchRes = await request(app)
      .patch(`/api/resumes/${resume._id}/profile`)
      .set("Authorization", `Bearer ${userToken}`)
      .send(verifiedData);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.resume.version).toBe(2);
    expect(patchRes.body.resume.verifiedProfile).toMatchObject({
      name: "Robert Smith",
      summary: "Senior Full Stack AI Engineer with 6+ years experience",
    });

    // 5. Tailoring check after verification now returns 200
    const verifiedCheck = await request(app)
      .get(`/api/resumes/${resume._id}/tailoring-check`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(verifiedCheck.status).toBe(200);
    expect(verifiedCheck.body.verified).toBe(true);

    // 6. DELETE /api/resumes/:id deletes document and stored file
    const filePath = path.resolve(
      env.STORAGE_LOCAL_DIR ?? "./uploads",
      stored.storageKey,
    );
    const fileExistsBefore = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExistsBefore).toBe(true);

    const deleteRes = await request(app)
      .delete(`/api/resumes/${resume._id}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(deleteRes.status).toBe(200);

    const fileExistsAfter = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExistsAfter).toBe(false);

    const deletedDoc = await Resume.findById(resume._id);
    expect(deletedDoc).toBeNull();
  });

  it("Central Error Handler: unknown error returns standard shape with requestId and development details", async () => {
    const spy = vi
      .spyOn(Resume, "findOne")
      .mockRejectedValueOnce(new Error("Unexpected low-level DB driver failure"));

    const res = await request(app)
      .get(`/api/resumes/507f1f77bcf86cd799439011`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.message).toBe("An unexpected error occurred");
    expect(res.body.error.requestId).toBeDefined();
    expect(res.body.error.details).toBeDefined();
    expect(res.body.error.details.message).toContain(
      "Unexpected low-level DB driver failure",
    );

    spy.mockRestore();
  });

  it("End-to-End: fixture upload stores non-empty skills and experience, and debug endpoint returns counts", async () => {
    const fixturePdf = await fs.readFile(
      path.resolve(__dirname, "fixtures/valid_resume.pdf"),
    );

    const populatedProfile = {
      name: "Taylor Swift",
      email: "taylor@example.com",
      summary: "Lead Software Architect",
      skills: [
        { name: "Python", category: "Languages", years: 6 },
        { name: "TypeScript", category: "Languages", years: 5 },
      ],
      experience: [
        {
          company: "Global Tech Inc.",
          title: "Principal Engineer",
          start: "2020-01",
          end: "Present",
          bullets: ["Architected multi-agent LLM systems"],
          technologies: ["Python", "FastAPI"],
        },
      ],
      education: [
        {
          institution: "University of Washington",
          degree: "B.S. in Computer Science",
          field_of_study: "Computer Science",
          start: "2016",
          end: "2020",
        },
      ],
      projects: [
        {
          name: "JobPilot Assistant",
          description: "Full-stack job hunt automation",
          technologies: ["React", "FastAPI"],
        },
      ],
      certifications: [],
      languages: [],
      field_confidence: { name: 0.99, skills: 0.95, experience: 0.98 },
    };

    aiMock.onPost("/v1/parse-resume").reply(200, {
      data: populatedProfile,
      warnings: ["Minor warning: phone omitted"],
      meta: { duration_ms: 300 },
    });

    const uploadRes = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", fixturePdf, "taylor_resume.pdf");

    expect(uploadRes.status).toBe(201);
    const resumeId = uploadRes.body.resume._id;
    const storageKey = uploadRes.body.resume.original.storageKey;

    await processParseResumeJob({
      resumeId,
      userId,
      storageKey,
      filename: "taylor_resume.pdf",
      mimeType: "application/pdf",
    });

    const readyDoc = await Resume.findById(resumeId);
    expect(readyDoc?.status).toBe("ready");
    expect(readyDoc?.parsedProfile?.skills.length).toBeGreaterThan(0);
    expect(readyDoc?.parsedProfile?.experience.length).toBeGreaterThan(0);
    expect(readyDoc?.parsedProfile?.education.length).toBeGreaterThan(0);

    // Verify debug endpoint returns counts and warnings
    const debugRes = await request(app)
      .get(`/api/resumes/${resumeId}/debug`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(debugRes.status).toBe(200);
    expect(debugRes.body.status).toBe("ready");
    expect(debugRes.body.counts.skillsCount).toBe(2);
    expect(debugRes.body.counts.experienceCount).toBe(1);
    expect(debugRes.body.counts.educationCount).toBe(1);
    expect(debugRes.body.counts.projectsCount).toBe(1);
    expect(debugRes.body.warnings).toContain("Minor warning: phone omitted");
  });

  it("Empty Profile Guard: when LLM returns empty output with no skills or experience, status must be failed, not blank", async () => {
    aiMock.onPost("/v1/parse-resume").reply(200, {
      data: {
        name: "Empty Candidate",
        email: "empty@example.com",
        summary: "",
        skills: [],
        experience: [],
        education: [],
        projects: [],
      },
      warnings: ["Parser produced no sections"],
      meta: { duration_ms: 100 },
    });

    const validPdf = Buffer.from("%PDF-1.4 empty resume test bytes");
    const storage = getStorageService();
    const stored = await storage.upload(
      validPdf,
      "blank_candidate.pdf",
      "application/pdf",
    );

    const resume = await Resume.create({
      userId,
      original: {
        filename: stored.filename,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedAt: new Date(),
      },
      status: "uploading",
    });

    await expect(
      processParseResumeJob({
        resumeId: resume._id.toString(),
        userId,
        storageKey: stored.storageKey,
        filename: stored.filename,
        mimeType: stored.mimeType,
      }),
    ).rejects.toMatchObject({ code: "PARSER_FAILED" });

    const failedDoc = await Resume.findById(resume._id);
    expect(failedDoc?.status).toBe("failed");
    expect(failedDoc?.error).toContain("PARSER_FAILED");
    expect(failedDoc?.error).toContain("empty profile");
  });
});
