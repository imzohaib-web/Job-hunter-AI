import { Worker, type Job as BullJob } from "bullmq";
import { env } from "../config/env.js";
import { Job } from "../models/Job.js";
import { Match } from "../models/Match.js";
import { Resume } from "../models/Resume.js";
import { SearchRun } from "../models/SearchRun.js";
import { aiClient } from "../services/aiClient.js";
import { appEventBus } from "../services/eventBus.js";
import { logger } from "../utils/logger.js";
import {
  DISCOVERY_QUEUE_NAME,
  DISCOVERY_JOB_NAME,
  getDiscoveryDlq,
  type DiscoveryJobData,
} from "./discoveryQueue.js";

interface RawJobPosting {
  source?: string;
  external_id?: string;
  externalId?: string;
  hash?: string;
  title: string;
  company: string;
  location: string;
  remote?: boolean | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary?: unknown;
  currency?: string | null;
  description: string;
  skills?: string[];
  url: string;
  posted_at?: string | Date;
  postedAt?: string | Date;
  embedding?: number[];
  is_demo?: boolean;
  isDemo?: boolean;
}

interface SearchJobsResponseData {
  jobs?: RawJobPosting[];
  total?: number;
  source_statuses?: Array<{
    source: string;
    status: string;
    count: number;
    error?: string | null;
  }>;
}

interface MatchResultData {
  score?: number;
  overall_score?: number;
  breakdown?: Record<string, unknown>;
  matched_skills?: string[];
  missing_skills?: string[];
  explanation?: string;
  hard_filter_failed?: boolean;
}

function buildQueryVariants(
  keywords: string,
  profile?: Record<string, unknown> | null,
): string[] {
  const variants = new Set<string>();

  // 1. Initial user keywords
  const rawKeywords = (keywords || "").trim();
  if (rawKeywords) {
    const parts = rawKeywords.split(/[,/|]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      variants.add(part);
    }
    variants.add(rawKeywords);
  }

  // 2. Profile titles & top skills
  if (profile) {
    const title = typeof profile.title === "string" ? profile.title.trim() : "";
    if (title) variants.add(title);

    const experience = Array.isArray(profile.experience) ? profile.experience : [];
    for (const exp of experience.slice(0, 3)) {
      if (exp && typeof exp.title === "string" && exp.title.trim()) {
        variants.add(exp.title.trim());
      }
    }

    const skills = Array.isArray(profile.skills) ? profile.skills : [];
    const skillNames = skills
      .map((s: unknown) => (typeof s === "string" ? s : (s as { name?: string })?.name || ""))
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());

    const hasMern = skillNames.some((s: string) =>
      ["react", "node", "express", "mongodb", "mern", "javascript", "typescript"].includes(s),
    );
    const hasPython = skillNames.some((s: string) =>
      ["python", "fastapi", "django", "ai", "machine learning"].includes(s),
    );

    if (hasMern) {
      variants.add("full stack developer");
      variants.add("react developer");
      variants.add("node.js developer");
    }
    if (hasPython) {
      variants.add("python developer");
      variants.add("ai engineer intern");
    }
  }

  if (variants.size === 0) {
    variants.add("full stack developer");
    variants.add("software engineer");
  }

  return Array.from(variants).slice(0, 5);
}

interface RankedJobItem {
  job: RawJobPosting | { job: RawJobPosting; embedding?: number[] };
  match: MatchResultData;
  embedding?: number[];
}

interface RankResponseData {
  ranked_jobs?: RankedJobItem[];
  total?: number;
}

export async function processDiscoveryJob(data: DiscoveryJobData): Promise<void> {
  const { searchId, userId, query } = data;
  const startTime = Date.now();

  logger.info({ searchId, userId }, "Starting discovery pipeline execution");

  // 1. Mark SearchRun processing and emit SSE event
  await SearchRun.findByIdAndUpdate(searchId, { status: "processing" });
  appEventBus.emitSearchEvent(searchId, {
    type: "status",
    status: "processing",
    message: "Discovering jobs from providers",
  });

  try {
    // 2. Load user profile for query expansion and ranking
    const userResume = await Resume.findOne({ userId }).sort({ createdAt: -1 });
    const profile = (userResume?.verifiedProfile || userResume?.parsedProfile) as
      | Record<string, unknown>
      | undefined;

    // Build search query variants from profile titles and top skills
    const queryVariants = buildQueryVariants(query.keywords, profile);
    logger.info(
      {
        searchId,
        userId,
        initialKeywords: query.keywords,
        variantsCount: queryVariants.length,
        variants: queryVariants,
      },
      "Structured log: query built from candidate profile with variants",
    );

    // Run each search query variant concurrently across enabled adapters
    const allRawJobs: RawJobPosting[] = [];
    const aggregatedSourceStatuses: Record<
      string,
      { source: string; status: string; count: number; error?: string | null; duration_ms?: number }
    > = {};

    for (const variant of queryVariants) {
      const variantStartTime = Date.now();
      logger.info(
        { searchId, variant, location: query.location, remoteOnly: query.remoteOnly },
        "Structured log: adapter search start for variant",
      );

      const searchPayload = {
        keywords: variant,
        location: query.location || undefined,
        remote_only: query.remoteOnly ?? false,
        seniority: query.seniority || undefined,
        sources: query.sources || undefined,
      };

      try {
        const searchRes = await aiClient.post<{ data: SearchJobsResponseData }>(
          "/v1/search-jobs",
          searchPayload,
        );
        const variantDuration = Date.now() - variantStartTime;

        const responseData = searchRes.data?.data || {};
        const jobs =
          responseData.jobs || (Array.isArray(searchRes.data) ? searchRes.data : []) || [];
        allRawJobs.push(...jobs);

        logger.info(
          {
            searchId,
            variant,
            returnedCount: jobs.length,
            durationMs: variantDuration,
          },
          "Structured log: adapter search end for variant",
        );

        // Aggregate source statuses
        if (responseData.source_statuses) {
          for (const st of responseData.source_statuses) {
            if (!aggregatedSourceStatuses[st.source]) {
              aggregatedSourceStatuses[st.source] = { ...st };
            } else {
              aggregatedSourceStatuses[st.source].count += st.count || 0;
              if (st.status === "ok") {
                aggregatedSourceStatuses[st.source].status = "ok";
              }
            }
          }
        }
      } catch (variantErr) {
        logger.error(
          { searchId, variant, err: variantErr },
          "Structured log: adapter search error for variant",
        );
      }
    }

    let perSourceCounts: Record<string, number> = {};
    for (const st of Object.values(aggregatedSourceStatuses)) {
      perSourceCounts[st.source] = st.count || 0;
    }

    appEventBus.emitSearchEvent(searchId, {
      type: "status",
      status: "processing",
      message: `Found ${allRawJobs.length} candidate jobs, deduplicating and indexing`,
      counts: perSourceCounts,
      sourceStatuses: Object.values(aggregatedSourceStatuses),
    });

    // 3. Deduplicate and upsert jobs by hash (never duplicates)
    const seenHashes = new Set<string>();
    const savedJobDocs = [];
    perSourceCounts = {};

    for (const raw of allRawJobs) {
      const source = raw.source || "manual";
      const externalId =
        raw.external_id || raw.externalId || `job-${Date.now()}-${Math.random()}`;
      // Standardize or compute deterministic hash if missing
      const hash =
        raw.hash ||
        `${source}:${externalId}:${raw.title.toLowerCase().trim()}:${raw.company.toLowerCase().trim()}`;

      if (seenHashes.has(hash)) {
        continue;
      }
      seenHashes.add(hash);

      const postedAt =
        raw.posted_at || raw.postedAt
          ? new Date(raw.posted_at || raw.postedAt!)
          : new Date();
      const embedding = Array.isArray(raw.embedding) ? raw.embedding : [];

      const jobDoc = await Job.findOneAndUpdate(
        { hash },
        {
          $setOnInsert: {
            source,
            externalId,
            hash,
            title: raw.title,
            company: raw.company,
            location: raw.location,
            remote: Boolean(raw.remote),
            salary:
              raw.salary ||
              (raw.salary_min
                ? { min: raw.salary_min, max: raw.salary_max, currency: raw.currency }
                : null),
            description: raw.description,
            skills: raw.skills || [],
            url: raw.url,
            postedAt,
            embedding,
            isDemo: Boolean(raw.is_demo ?? raw.isDemo),
          },
        },
        { upsert: true, new: true },
      );
      savedJobDocs.push(jobDoc);
      perSourceCounts[source] = (perSourceCounts[source] || 0) + 1;
    }

    // Synchronize unique deduplicated counts back into aggregatedSourceStatuses
    for (const st of Object.values(aggregatedSourceStatuses)) {
      if (st.status === "ok") {
        st.count = perSourceCounts[st.source] || 0;
      }
    }

    logger.info(
      {
        searchId,
        rawCount: allRawJobs.length,
        dedupedCount: savedJobDocs.length,
      },
      "Structured log: aggregator merge/dedupe counts",
    );

    // 4. Retrieval: Atlas Vector Search or direct candidates
    let candidateJobs = savedJobDocs;
    if (env.ATLAS_VECTOR_SEARCH === "true") {
      try {
        const candidateProfile = (userResume?.verifiedProfile || userResume?.parsedProfile) as
          Record<string, unknown> | undefined;
        const candidateEmbedding = candidateProfile?.embedding as number[] | undefined;

        if (candidateEmbedding && candidateEmbedding.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vectorPipeline: any[] = [
            {
              $vectorSearch: {
                index: "job_vector_index",
                path: "embedding",
                queryVector: candidateEmbedding,
                numCandidates: 100,
                limit: 50,
                filter: query.remoteOnly ? { remote: { $eq: true } } : undefined,
              },
            },
          ];
          const vectorMatches = await Job.aggregate(vectorPipeline);
          if (vectorMatches.length > 0) {
            candidateJobs = vectorMatches;
          }
        }
      } catch (err) {
        logger.warn(
          { err },
          "Atlas Vector Search failed or not available; falling back to direct candidates",
        );
      }
    }

    let totalMatches = 0;
    let passingMatchesCount = 0;
    let hardFilteredCount = 0;
    let primaryFilterReason: string | null = null;

    // 5. Call /v1/rank if profile & jobs are present
    if (profile && candidateJobs.length > 0) {
      logger.info(
        { searchId, rankInputCount: candidateJobs.length },
        "Structured log: rank input count",
      );

      appEventBus.emitSearchEvent(searchId, {
        type: "status",
        status: "ranking",
        message: "Ranking jobs against candidate profile",
      });

      const rankStartTime = Date.now();
      const rankJobsPayload = candidateJobs.map((j) => ({
        job: {
          source: j.source,
          external_id: j.externalId,
          title: j.title,
          company: j.company,
          location: j.location,
          remote: j.remote,
          description: j.description,
          skills: j.skills,
          url: j.url,
          posted_at: j.postedAt
            ? new Date(j.postedAt).toISOString()
            : new Date().toISOString(),
        },
        embedding: j.embedding || [],
      }));

      const safeProfile: Record<string, unknown> = {
        ...profile,
        name: (profile?.name as string) || "Candidate",
        email: (profile?.email as string) || undefined,
        location: (profile?.location as string) || undefined,
        summary: (profile?.summary as string) || "",
        skills: Array.isArray(profile?.skills) ? profile.skills : [],
        experience: Array.isArray(profile?.experience) ? profile.experience : [],
        education: Array.isArray(profile?.education) ? profile.education : [],
        projects: Array.isArray(profile?.projects) ? profile.projects : [],
        certifications: Array.isArray(profile?.certifications) ? profile.certifications : [],
        languages: Array.isArray(profile?.languages) ? profile.languages : [],
      };

      const rankRes = await aiClient.post<{ data: RankResponseData }>("/v1/rank", {
        profile: safeProfile,
        jobs: rankJobsPayload,
        preferences: {
          location: query.location || undefined,
          remote_only: Boolean(query.remoteOnly),
        },
        llm_rerank: false,
      });
      const rankDuration = Date.now() - rankStartTime;

      const rankedJobs = rankRes.data?.data?.ranked_jobs || [];

      // Filter breakdown tracking
      const filterReasonsCount: Record<string, number> = {};

      // 6. Store / upsert Match documents
      for (const item of rankedJobs) {
        // Handle both item.job as JobPosting or nested { job: JobPosting }
        const rawJob = item.job as unknown;
        const itemJob: RawJobPosting | undefined =
          rawJob && typeof rawJob === "object" && "job" in rawJob
            ? ((rawJob as { job: RawJobPosting }).job as RawJobPosting)
            : (rawJob as RawJobPosting | undefined);
        const matchResult = item.match;
        if (!itemJob || !matchResult) continue;

        // Find the matching saved job doc
        const matchingDoc = candidateJobs.find(
          (cj) =>
            cj.source === itemJob.source &&
            cj.externalId === (itemJob.external_id || itemJob.externalId),
        );
        if (!matchingDoc) continue;

        const score = matchResult.overall_score ?? matchResult.score ?? 0;
        const failed = Boolean(matchResult.hard_filter_failed);

        if (failed) {
          hardFilteredCount++;
          const reason = matchResult.explanation || "Requirement mismatch";
          filterReasonsCount[reason] = (filterReasonsCount[reason] || 0) + 1;
        } else {
          passingMatchesCount++;
        }

        await Match.findOneAndUpdate(
          { userId, jobId: matchingDoc._id },
          {
            userId,
            jobId: matchingDoc._id,
            searchId,
            score,
            breakdown: matchResult.breakdown || {},
            matchedSkills: matchResult.matched_skills || [],
            missingSkills: matchResult.missing_skills || [],
            explanation: matchResult.explanation || "",
            hardFilterFailed: failed,
          },
          { upsert: true, new: true },
        );
        totalMatches++;
      }

      logger.info(
        {
          searchId,
          rankOutputCount: rankedJobs.length,
          passingMatchesCount,
          hardFilteredCount,
          rankDurationMs: rankDuration,
        },
        "Structured log: rank output and hard-filter counts",
      );

      // Identify the most frequent reason jobs were filtered
      let maxReasonCount = 0;
      for (const [r, count] of Object.entries(filterReasonsCount)) {
        if (count > maxReasonCount) {
          maxReasonCount = count;
          primaryFilterReason = r;
        }
      }
    }

    // 7. Diagnostics Object ("Why 0 results" telemetry)
    const diagnostics = {
      fetched: allRawJobs.length,
      afterDedupe: savedJobDocs.length,
      afterHardFilters: passingMatchesCount,
      ranked: totalMatches,
      mainFilterRemoved: primaryFilterReason,
      sourceStatuses: Object.values(aggregatedSourceStatuses),
    };

    // 8. Update SearchRun status completed
    const durationMs = Date.now() - startTime;
    await SearchRun.findByIdAndUpdate(searchId, {
      status: "completed",
      resultsCount: totalMatches > 0 ? totalMatches : savedJobDocs.length,
      perSourceCounts,
      sourceStatuses: Object.values(aggregatedSourceStatuses),
      diagnostics,
      durationMs,
      error: null,
      errorStack: null,
    });

    appEventBus.emitSearchEvent(searchId, {
      type: "completed",
      status: "completed",
      resultsCount: totalMatches > 0 ? totalMatches : savedJobDocs.length,
      durationMs,
      perSourceCounts,
      sourceStatuses: Object.values(aggregatedSourceStatuses),
      diagnostics,
    });

    logger.info(
      { searchId, matchesCount: totalMatches, durationMs },
      "Discovery pipeline completed successfully",
    );
  } catch (err: unknown) {
    const errorMsg =
      (err as { response?: { data?: { error?: { message?: string }; message?: string } } })
        ?.response?.data?.error?.message ||
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (err instanceof Error ? err.message : String(err));
    const errorStack = err instanceof Error ? err.stack : undefined;

    logger.error({ err, searchId, errorMsg, errorStack }, "Discovery pipeline failed");

    await SearchRun.findByIdAndUpdate(searchId, {
      status: "failed",
      error: errorMsg,
      errorStack,
      durationMs: Date.now() - startTime,
    });

    appEventBus.emitSearchEvent(searchId, {
      type: "failed",
      status: "failed",
      error: errorMsg,
      errorStack,
    });

    throw err;
  }
}

let discoveryWorker: Worker<DiscoveryJobData> | null = null;

export function startDiscoveryWorker(): Worker<DiscoveryJobData> {
  if (!discoveryWorker && env.NODE_ENV !== "test") {
    discoveryWorker = new Worker<DiscoveryJobData>(
      DISCOVERY_QUEUE_NAME,
      async (job: BullJob<DiscoveryJobData>) => {
        await processDiscoveryJob(job.data);
      },
      {
        connection: {
          url: env.REDIS_URL,
        },
        concurrency: 2, // Concurrency limit
      },
    );

    discoveryWorker.on("completed", (job) => {
      logger.info(
        { jobId: job.id, searchId: job.data.searchId },
        "Discovery job completed",
      );
    });

    discoveryWorker.on("failed", async (job, err) => {
      logger.error(
        { jobId: job?.id, searchId: job?.data.searchId, err },
        "Discovery job failed",
      );
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        logger.warn(
          { searchId: job.data.searchId },
          "Job reached max attempts, moving to DLQ",
        );
        try {
          const dlq = getDiscoveryDlq();
          await dlq.add(DISCOVERY_JOB_NAME, job.data);
        } catch (dlqErr) {
          logger.error({ dlqErr }, "Failed to move job to DLQ");
        }
      }
    });

    discoveryWorker.on("error", (err) => {
      logger.error({ err }, "BullMQ Discovery Worker error");
    });
  }

  return discoveryWorker!;
}

export async function closeDiscoveryWorker(): Promise<void> {
  if (discoveryWorker) {
    await discoveryWorker.close();
    discoveryWorker = null;
  }
}
