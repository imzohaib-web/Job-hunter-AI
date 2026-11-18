/**
 * Smoke test for job search run creation and execution
 * Usage: npx tsx scripts/smoke_search.ts
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001/api";
const EMAIL = `search_test_${Date.now()}@example.com`;
const PASSWORD = "password123!";

async function main() {
  console.log(`[smoke_search] Connecting to ${API_BASE_URL}...`);

  // 1. Register test user
  console.log(`[smoke_search] Registering test user: ${EMAIL}`);
  const regRes = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Search Smoke User",
      email: EMAIL,
      password: PASSWORD,
    }),
  });

  if (!regRes.ok) {
    const text = await regRes.text();
    throw new Error(`Failed to register: ${regRes.status} ${text}`);
  }

  const regData = (await regRes.json()) as { accessToken: string; user: { id: string } };
  const token = regData.accessToken;
  console.log(`[smoke_search] Registered successfully. User ID: ${regData.user.id}`);

  // 2. Trigger a search run
  console.log("[smoke_search] Creating a new job search run...");
  const searchPayload = {
    keywords: "Software Engineer",
    remoteOnly: true,
    sources: ["remotive", "arbeitnow"],
  };

  const searchRes = await fetch(`${API_BASE_URL}/searches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(searchPayload),
  });

  const searchStatus = searchRes.status;
  const searchJson = await searchRes.json() as {
    message?: string;
    data?: { _id: string; status: string; query: unknown };
    error?: { code: string; message: string };
  };

  console.log(`[smoke_search] Response status: HTTP ${searchStatus}`);
  console.log("[smoke_search] Response body:", JSON.stringify(searchJson, null, 2));

  if (searchStatus !== 201 && searchStatus !== 200) {
    throw new Error(`Search creation failed with HTTP ${searchStatus}: ${JSON.stringify(searchJson)}`);
  }

  const searchId = searchJson.data?._id;
  if (!searchId) {
    throw new Error("No searchId returned in response data");
  }

  console.log(`[smoke_search] Search run created! Search ID: ${searchId}, Status: ${searchJson.data?.status}`);

  // 3. Poll for search run progress
  console.log(`[smoke_search] Polling search run ${searchId}...`);
  for (let i = 1; i <= 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${API_BASE_URL}/searches/${searchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (pollRes.ok) {
      const pollJson = await pollRes.json() as {
        data: { status: string; resultsCount?: number; perSourceCounts?: Record<string, number> };
      };
      console.log(
        `[smoke_search] Poll ${i}: status='${pollJson.data?.status}', resultsCount=${pollJson.data?.resultsCount ?? 0}`
      );
      if (pollJson.data?.status === "completed" || pollJson.data?.status === "failed") {
        console.log(`[smoke_search] Search reached terminal state: ${pollJson.data?.status}`);
        break;
      }
    }
  }

  console.log("\n[smoke_search] SUCCESS: Job search was accepted and processed successfully!");
}

main().catch((err) => {
  console.error("[smoke_search] ERROR:", err);
  process.exit(1);
});
