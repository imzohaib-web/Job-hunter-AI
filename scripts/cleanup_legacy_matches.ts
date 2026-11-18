/**
 * Cleanup / archive legacy Match documents whose pipelineVersion does not match current PIPELINE_VERSION.
 * Usage: npx tsx scripts/cleanup_legacy_matches.ts [--archive] [--user=<userId>]
 */

import mongoose from "mongoose";
import { PIPELINE_VERSION } from "../packages/shared/src/types.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/jobpilot";

async function runCleanup() {
  console.log(`[cleanup_legacy_matches] Connecting to MongoDB: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Failed to get MongoDB database handle");
  }

  const matchesCollection = db.collection("matches");
  const legacyArchiveCollection = db.collection("matches_legacy_archive");

  const args = process.argv.slice(2);
  const shouldArchive = args.includes("--archive");
  const userArg = args.find((a) => a.startsWith("--user="));
  const targetUserId = userArg ? userArg.split("=")[1] : null;

  const query: Record<string, unknown> = {
    $or: [
      { pipelineVersion: { $ne: PIPELINE_VERSION } },
      { pipelineVersion: { $exists: false } },
    ],
  };

  if (targetUserId) {
    query.userId = new mongoose.Types.ObjectId(targetUserId);
    console.log(`[cleanup_legacy_matches] Scoping to userId: ${targetUserId}`);
  }

  const count = await matchesCollection.countDocuments(query);
  console.log(`[cleanup_legacy_matches] Found ${count} legacy match document(s) (current PIPELINE_VERSION is "${PIPELINE_VERSION}")`);

  if (count === 0) {
    console.log("[cleanup_legacy_matches] No legacy documents found. Nothing to clean.");
    await mongoose.disconnect();
    return;
  }

  if (shouldArchive) {
    console.log(`[cleanup_legacy_matches] Archiving ${count} legacy matches to "matches_legacy_archive"...`);
    const cursor = matchesCollection.find(query);
    const docs = await cursor.toArray();
    if (docs.length > 0) {
      await legacyArchiveCollection.insertMany(docs);
    }
  }

  const deleteRes = await matchesCollection.deleteMany(query);
  console.log(`[cleanup_legacy_matches] Deleted ${deleteRes.deletedCount} legacy match document(s) from "matches" collection.`);

  await mongoose.disconnect();
  console.log("[cleanup_legacy_matches] Done.");
}

runCleanup().catch((err) => {
  console.error("[cleanup_legacy_matches] Fatal error:", err);
  process.exit(1);
});
