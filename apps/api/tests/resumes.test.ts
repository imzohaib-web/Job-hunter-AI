import fs from "node:fs/promises";
import path from "node:path";
import MockAdapter from "axios-mock-adapter";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { Resume } from "../src/models/Resume.js";
import { processParseResumeJob } from "../src/queues/resumeWorker.js";
import { aiClient } from "../src/services/aiClient.js";
import { getStorageService } from "../src/services/storage/index.js";
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

    // 2. Invalid extension (.txt)
    const txtFile = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", Buffer.from("plain text resume"), "resume.txt");
    expect(txtFile.status).toBe(400);

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

    // 4. Oversized file (> 5 MB)
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, "%PDF-1.4");
    const oversizedFile = await request(app)
      .post("/api/resumes")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", largeBuffer, "large_resume.pdf");
    expect([400, 413]).toContain(oversizedFile.status);
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
});
