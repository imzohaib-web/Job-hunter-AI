import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { clearTestDb, setupTestDb, teardownTestDb } from "./testDb.js";

describe("Daily AI Quota Middleware", () => {
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

  it("Enforces per-user daily AI quota and rejects with 429 when exhausted", async () => {
    // 1. Register a user
    const reg = await request(app).post("/api/auth/register").send({
      name: "Quota Tester",
      email: "quota@example.com",
      password: "password123!",
    });
    const { accessToken, user } = reg.body;

    // 2. Initial request within quota succeeds
    const okRes = await request(app)
      .post("/api/ai/test")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(okRes.status).toBe(200);

    // 3. Set user quota to limit
    const userDoc = await User.findById(user.id);
    expect(userDoc).toBeDefined();
    if (userDoc) {
      userDoc.quota.dailyAiRequests = userDoc.quota.dailyLimit;
      await userDoc.save();
    }

    // 4. Next request must fail with 429
    const exceededRes = await request(app)
      .post("/api/ai/test")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(exceededRes.status).toBe(429);
    expect(exceededRes.body.error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(exceededRes.body.error.details).toBeDefined();

    // 5. Day rollover resets quota
    if (userDoc) {
      userDoc.quota.lastResetDate = "2020-01-01"; // Old date
      await userDoc.save();
    }

    const resetRes = await request(app)
      .post("/api/ai/test")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(resetRes.status).toBe(200);
  });
});
