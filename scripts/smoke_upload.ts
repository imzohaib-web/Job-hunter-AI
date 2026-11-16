/**
 * JobPilot Smoke Test: Resume Upload Flow
 * Usage:
 *   npx tsx scripts/smoke_upload.ts
 *
 * Environment variables:
 *   API_BASE_URL (default: "http://localhost:3000/api")
 *   SMOKE_EMAIL (default: "smoke_tester@example.com")
 *   SMOKE_PASSWORD (default: "password123!")
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPort = process.env.PORT || "3001";
const API_BASE_URL = (process.env.API_BASE_URL || `http://localhost:${defaultPort}/api`).replace(/\/+$/, "");
const EMAIL = process.env.SMOKE_EMAIL || "smoke_tester@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD || "password123!";

async function findFixtureResume(): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const possiblePaths = [
    path.resolve(__dirname, "../tests/local/my_resume.pdf"),
    path.resolve(__dirname, "../apps/api/tests/fixtures/valid_resume.pdf"),
    path.resolve(__dirname, "../apps/ai-service/tests/fixtures/resume_single_column.pdf"),
    path.resolve(__dirname, "../apps/api/tests/fixtures/valid_resume.docx"),
  ];

  for (const p of possiblePaths) {
    try {
      const buffer = await fs.readFile(p);
      const filename = path.basename(p);
      const mimeType = filename.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
      return { buffer, filename, mimeType };
    } catch {
      // Try next
    }
  }

  // Fallback minimal valid PDF buffer
  const fallbackBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Title (Smoke Resume) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
  );
  return { buffer: fallbackBuffer, filename: "smoke_resume.pdf", mimeType: "application/pdf" };
}

async function loginOrRegister(): Promise<string> {
  console.log(`[smoke_upload] Authenticating as ${EMAIL}...`);

  // Attempt login first
  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (loginRes.ok) {
    const data = (await loginRes.json()) as { accessToken: string };
    console.log("[smoke_upload] Logged in successfully.");
    return data.accessToken;
  }

  // If login failed, register user
  console.log("[smoke_upload] User not found or invalid credentials, registering test user...");
  const regRes = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Tester",
      email: EMAIL,
      password: PASSWORD,
    }),
  });

  if (!regRes.ok) {
    const errText = await regRes.text();
    throw new Error(`Failed to authenticate: HTTP ${regRes.status}: ${errText}`);
  }

  const regData = (await regRes.json()) as { accessToken: string };
  console.log("[smoke_upload] Registered successfully.");
  return regData.accessToken;
}

async function uploadResume(
  token: string,
  fixture: { buffer: Buffer; filename: string; mimeType: string },
): Promise<{ resumeId: string; status: string }> {
  console.log(`[smoke_upload] Uploading resume '${fixture.filename}' (${fixture.buffer.length} bytes)...`);

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fixture.buffer)], { type: fixture.mimeType });
  formData.append("file", blob, fixture.filename);

  const res = await fetch(`${API_BASE_URL}/resumes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const responseText = await res.text();
  let json: { resume?: { _id: string; status: string }; error?: { code: string; message: string; details?: unknown } };
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid JSON response (HTTP ${res.status}): ${responseText}`);
  }

  if (!res.ok || json.error) {
    const errCode = json.error?.code || `HTTP_${res.status}`;
    const errMsg = json.error?.message || responseText;
    throw new Error(`Resume upload failed [${errCode}]: ${errMsg}`);
  }

  if (!json.resume?._id) {
    throw new Error(`Missing resume._id in response: ${responseText}`);
  }

  console.log(`[smoke_upload] Resume uploaded! ID: ${json.resume._id}, Initial status: ${json.resume.status}`);
  return { resumeId: json.resume._id, status: json.resume.status };
}

async function pollResumeStatus(token: string, resumeId: string): Promise<void> {
  const maxPolls = 30;
  const pollIntervalMs = 1500;

  console.log(`[smoke_upload] Polling resume status for ID ${resumeId} (max ${maxPolls * (pollIntervalMs / 1000)}s)...`);

  for (let i = 1; i <= maxPolls; i++) {
    const res = await fetch(`${API_BASE_URL}/resumes/${resumeId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[smoke_upload] Poll ${i}/${maxPolls} returned HTTP ${res.status}: ${errText}`);
    } else {
      const json = (await res.json()) as {
        resume: {
          _id: string;
          status: string;
          error?: string | null;
          parsedProfile?: { name?: string; skills?: Array<{ name: string }> };
        };
      };
      const resume = json.resume;
      console.log(`[smoke_upload] Poll ${i}/${maxPolls}: status='${resume.status}'`);

      if (resume.status === "ready") {
        console.log("\n========================================");
        console.log(" SUCCESS: Resume parsed and ready!");
        console.log(` Candidate Name: ${resume.parsedProfile?.name || "(unnamed)"}`);
        console.log(` Extracted Skills: ${resume.parsedProfile?.skills?.length || 0}`);

        // Fetch debug counts from new debug endpoint
        try {
          const debugRes = await fetch(`${API_BASE_URL}/resumes/${resumeId}/debug`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (debugRes.ok) {
            const debugJson = await debugRes.json();
            console.log("\n--- Debug Endpoint Counts (/api/resumes/:id/debug) ---");
            console.log(` Skills count:     ${debugJson.counts?.skillsCount}`);
            console.log(` Experience count: ${debugJson.counts?.experienceCount}`);
            console.log(` Education count:  ${debugJson.counts?.educationCount}`);
            console.log(` Projects count:   ${debugJson.counts?.projectsCount}`);
            console.log(` Warnings:         ${JSON.stringify(debugJson.warnings)}`);
          }
        } catch {
          // ignore
        }

        console.log("========================================\n");
        return;
      }

      if (resume.status === "failed") {
        console.error("\n========================================");
        console.error(" FAILED: Resume processing reported failure.");
        console.error(` Error: ${resume.error || "Unknown error"}`);
        console.error("========================================\n");
        process.exit(1);
      }
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  console.error(`[smoke_upload] Timed out waiting for resume ${resumeId} to finish processing.`);
  process.exit(1);
}

async function main() {
  console.log(`[smoke_upload] Starting smoke test against ${API_BASE_URL}...`);
  try {
    const fixture = await findFixtureResume();
    const token = await loginOrRegister();
    const { resumeId, status } = await uploadResume(token, fixture);

    if (status === "ready") {
      console.log("[smoke_upload] Resume was processed synchronously to 'ready'.");
      return;
    }

    await pollResumeStatus(token, resumeId);
  } catch (err) {
    console.error("[smoke_upload] ERROR:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
