import jwt from "jsonwebtoken";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://mongo:27017/jobpilot");

  const targetEmail = process.env.USER_EMAIL;
  const user = targetEmail
    ? await mongoose.connection.collection("users").findOne({ email: targetEmail })
    : await mongoose.connection.collection("users").findOne({});
  if (!user) {
    console.error("User not found!");
    process.exit(1);
  }

  const token = jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role || "user" },
    process.env.JWT_ACCESS_SECRET || "dev-jwt-access-secret-32-chars-minimum-length-key",
    { expiresIn: "1h" }
  );

  console.log("Starting fresh search for user:", user.email);

  const res = await fetch("http://127.0.0.1:3001/api/searches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      keywords: "Junior MERN Full-Stack Developer, AI, React, Node",
      location: "Remote",
      remoteOnly: true,
      seniority: "junior",
    }),
  });

  const body = await res.json();
  console.log("Create Search Response:", JSON.stringify(body, null, 2));

  const searchId = body.data?._id || body._id;
  if (!searchId) {
    console.error("No searchId returned!");
    process.exit(1);
  }

  console.log(`Polling search status for ID: ${searchId}...`);
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const pollRes = await fetch(`http://127.0.0.1:3001/api/searches/${searchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pollBody = await pollRes.json();
    const searchData = pollBody.data || pollBody;

    console.log(`[${i + 1}] Status: ${searchData.status} | Results: ${searchData.resultsCount} | Duration: ${searchData.durationMs}ms`);

    if (searchData.status === "completed" || searchData.status === "failed") {
      console.log("\n================ SEARCH COMPLETE ================");
      console.log("Status:", searchData.status);
      console.log("Results count:", searchData.resultsCount);
      console.log("Per-source counts:", JSON.stringify(searchData.perSourceCounts, null, 2));
      console.log("Source statuses:", JSON.stringify(searchData.sourceStatuses, null, 2));
      console.log("Diagnostics:", JSON.stringify(searchData.diagnostics, null, 2));
      if (searchData.error) {
        console.error("Error:", searchData.error);
        console.error("Stack:", searchData.errorStack);
      }

      // Check matches collection
      const matches = await mongoose.connection.collection("matches").find({ searchId: new mongoose.Types.ObjectId(searchId) }).toArray();
      console.log(`Total saved matches in DB: ${matches.length}`);
      if (matches.length > 0) {
        console.log("Top 3 matches:");
        for (const m of matches.slice(0, 3)) {
          const job = await mongoose.connection.collection("jobs").findOne({ _id: m.jobId });
          console.log(`  - [Score: ${m.score}%] ${job?.title} at ${job?.company} (${job?.source}, remote: ${job?.isRemote})`);
        }
      }
      break;
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
