/**
 * Verification script: executes 3 sequential searches against real running docker containers.
 * Usage: npx tsx scripts/verify_docker_searches.ts
 */

import fs from "fs";
import path from "path";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001/api";
const EMAIL = `verify_user_${Date.now()}@example.com`;
const PASSWORD = "Password123!";

async function main() {
  console.log(`[verify] Connecting to API: ${API_BASE_URL}`);

  // 1. Load candidate profile dump
  const dumpPath = path.resolve(process.cwd(), "scripts/candidate_profile_dump.json");
  let profileData: any = {};
  let lastSearchQuery: any = {};
  if (fs.existsSync(dumpPath)) {
    const raw = JSON.parse(fs.readFileSync(dumpPath, "utf-8"));
    profileData = raw.verifiedProfile || {};
    lastSearchQuery = raw.lastSearchQuery || {};
  }

  // 2. Register user
  console.log(`[verify] Registering test user: ${EMAIL}...`);
  const regRes = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: profileData.name || "Zohaib Umer",
      email: EMAIL,
      password: PASSWORD,
    }),
  });

  if (!regRes.ok) {
    throw new Error(`Registration failed: ${regRes.status} ${await regRes.text()}`);
  }

  const regData = (await regRes.json()) as { accessToken: string; user: { id: string } };
  const token = regData.accessToken;
  const userId = regData.user.id;
  console.log(`[verify] User registered: ${userId}`);

  // 3. Save Candidate Preferences
  const prefs = lastSearchQuery.preferences || {
    targetTitles: ["Junior Full Stack Developer", "Frontend Developer", "Backend Engineer"],
    employmentTypes: ["full-time"],
    experienceLevels: ["junior", "entry", "internship"],
    workModes: ["remote"],
    remoteWorldwide: true,
    sources: ["remotive", "arbeitnow", "jobicy", "himalayas", "greenhouse"],
  };

  await fetch(`${API_BASE_URL}/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(prefs),
  });
  console.log("[verify] Saved candidate preferences.");

  // Run 3 searches in a row
  for (let runIdx = 1; runIdx <= 3; runIdx++) {
    const runType = runIdx === 1 ? "Cold Cache" : "Warm Cache";
    console.log(`\n======================================================`);
    console.log(`>>> SEARCH RUN ${runIdx} / 3 (${runType})`);
    console.log(`======================================================`);

    const tStart = Date.now();
    const searchRes = await fetch(`${API_BASE_URL}/searches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        keywords: "Full Stack Developer",
        remoteOnly: true,
        force: true, // Force fresh run
        preferences: prefs,
        sources: prefs.sources,
      }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Search Run ${runIdx} trigger failed: HTTP ${searchRes.status} ${errText}`);
    }

    const searchJson = (await searchRes.json()) as { data: { _id: string; status: string } };
    const searchId = searchJson.data._id;
    console.log(`[verify] Triggered searchId: ${searchId}, status: ${searchJson.data.status}`);

    // Poll until completed or failed
    let finalRun: any = null;
    for (let p = 1; p <= 60; p++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(`${API_BASE_URL}/searches/${searchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pollRes.ok) {
        const body = (await pollRes.json()) as { data: any };
        finalRun = body.data;
        if (finalRun.status === "completed" || finalRun.status === "completed_empty" || finalRun.status === "failed") {
          break;
        }
        if (p % 5 === 0) {
          console.log(`[verify] Polling ${p * 2}s... status='${finalRun.status}'`);
        }
      }
    }

    const totalDurationSec = ((Date.now() - tStart) / 1000).toFixed(2);
    console.log(`[verify] Run ${runIdx} ended in ${totalDurationSec}s with status: ${finalRun?.status}`);

    if (finalRun?.status === "failed") {
      console.error(`[verify] FAILED: ${finalRun?.error}`);
      console.error(`[verify] Error details:`, JSON.stringify(finalRun?.errorDetails));
      throw new Error(`Search Run ${runIdx} failed: ${finalRun?.error}`);
    }

    // Fetch Matches
    const matchesRes = await fetch(`${API_BASE_URL}/matches?searchId=${searchId}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const matchesJson = (await matchesRes.json()) as { data: any[]; pagination: any; hasLegacyMatches?: boolean };
    const matches = matchesJson.data || [];

    // Diagnostics & Counts
    const diag = finalRun?.diagnostics || {};
    const sourceStatuses = finalRun?.sourceStatuses || [];
    console.log(`\n--- Run ${runIdx} Diagnostics & Counts ---`);
    console.log(`Total Matches: ${matches.length}`);
    console.log(`Funnel: raw_fetched=${diag.raw_fetched} -> after_dedupe=${diag.after_dedupe} -> after_filters=${diag.after_local_filters} -> preselected=${diag.preselected} -> ranked=${diag.ranked}`);

    console.log(`Source Statuses:`);
    for (const st of sourceStatuses) {
      console.log(`  - ${st.source}: status=${st.status}, count=${st.count}, raw_fetched=${st.raw_fetched ?? 'N/A'}`);
    }

    // Tier counts
    const tierCounts: Record<string, number> = { strong: 0, good: 0, possible: 0, stretch: 0 };
    for (const m of matches) {
      const t = m.tier || "possible";
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    }
    console.log(`Tier Counts:`, tierCounts);

    // Top 10 Titles
    console.log(`\nTop 10 Ranked Matches:`);
    const top10 = matches.slice(0, 10);
    top10.forEach((m: any, idx: number) => {
      const job = typeof m.jobId === "object" ? m.jobId : m.job || {};
      console.log(`  ${idx + 1}. [${m.tier?.toUpperCase() || 'POSSIBLE'}] (${m.score}%) ${job.title} @ ${job.company} (${job.location || 'Remote'}) [source: ${job.source}]`);
    });

    // Validations:
    // 1. Zero German jobs (m/w/d)
    const germanJobs = matches.filter((m: any) => {
      const job = typeof m.jobId === "object" ? m.jobId : m.job || {};
      return /\(m\/w\/d\)/i.test(job.title) || /\(w\/m\/d\)/i.test(job.title);
    });
    if (germanJobs.length > 0) {
      console.error(`[verify] WARNING: Found ${germanJobs.length} German jobs in matches!`);
    } else {
      console.log(`[verify] ✓ Zero German (m/w/d) jobs.`);
    }

    // 2. Zero non-tech jobs
    const nonTechKeywords = ["patient care", "inside sales", "copywriter", "content creator", "warehouse", "receptionist"];
    const nonTechJobs = matches.filter((m: any) => {
      const job = typeof m.jobId === "object" ? m.jobId : m.job || {};
      const titleLower = (job.title || "").toLowerCase();
      return nonTechKeywords.some((k) => titleLower.includes(k));
    });
    if (nonTechJobs.length > 0) {
      console.error(`[verify] WARNING: Found ${nonTechJobs.length} non-tech jobs!`);
    } else {
      console.log(`[verify] ✓ Zero non-tech roles found.`);
    }

    // 3. Zero generic fallback explanation text
    const genericTextJobs = matches.filter((m: any) => {
      return (m.explanation || "").includes("Relevant opportunity for X matching technical background");
    });
    if (genericTextJobs.length > 0) {
      console.error(`[verify] WARNING: Found generic text in ${genericTextJobs.length} matches!`);
    } else {
      console.log(`[verify] ✓ Zero generic fallback strings.`);
    }
  }

  console.log(`\n[verify] ALL 3 SEARCHES COMPLETED SUCCESSFULLY!`);
}

main().catch((err) => {
  console.error("[verify] Fatal error:", err);
  process.exit(1);
});
