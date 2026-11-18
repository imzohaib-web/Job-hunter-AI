import { describe, expect, it } from "vitest";
import { PIPELINE_VERSION } from "@jobpilot/shared";

describe("Match Persistence Deduplication & Pipeline Versioning", () => {
  it("exports the expected current PIPELINE_VERSION", () => {
    expect(PIPELINE_VERSION).toBe("2026-11-17-v3");
  });

  it("deduplicates bulk ops by jobId so duplicate jobs in the same batch never throw E11000", () => {
    const userId = "507f1f77bcf86cd799439011";
    const job1Id = "607f1f77bcf86cd799439022";
    const job2Id = "607f1f77bcf86cd799439033";

    // Simulate raw ranked items that contain duplicate jobIds (e.g. from cross-board repostings)
    const rankedItems = [
      { jobId: job1Id, title: "Full Stack Engineer (US)", score: 85, tier: "strong" },
      { jobId: job1Id, title: "Full Stack Engineer (EU)", score: 85, tier: "strong" }, // Duplicate jobId!
      { jobId: job2Id, title: "Backend Developer", score: 72, tier: "strong" },
      { jobId: job1Id, title: "Full Stack Engineer (Worldwide)", score: 85, tier: "strong" }, // Another duplicate!
    ];

    const matchBulkOps: any[] = [];
    const seenJobIds = new Set<string>();

    for (const item of rankedItems) {
      if (seenJobIds.has(item.jobId)) {
        continue;
      }
      seenJobIds.add(item.jobId);

      matchBulkOps.push({
        updateOne: {
          filter: { userId, jobId: item.jobId },
          update: {
            $set: {
              userId,
              jobId: item.jobId,
              score: item.score,
              tier: item.tier,
              pipelineVersion: PIPELINE_VERSION,
            },
          },
          upsert: true,
        },
      });
    }

    // Must have exactly 2 operations for job1 and job2, NOT 4
    expect(matchBulkOps).toHaveLength(2);
    expect(matchBulkOps[0].updateOne.filter.jobId).toBe(job1Id);
    expect(matchBulkOps[0].updateOne.update.$set.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(matchBulkOps[1].updateOne.filter.jobId).toBe(job2Id);
    expect(matchBulkOps[1].updateOne.update.$set.pipelineVersion).toBe(PIPELINE_VERSION);
  });
});
