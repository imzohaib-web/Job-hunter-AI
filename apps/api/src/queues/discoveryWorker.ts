import { Worker, type Job as BullJob } from "bullmq";
import { PIPELINE_VERSION } from "@jobpilot/shared";
import { Types } from "mongoose";
import { env } from "../config/env.js";
import { Job } from "../models/Job.js";
import { Match } from "../models/Match.js";
import { Resume } from "../models/Resume.js";
import { SearchRun } from "../models/SearchRun.js";
import { mapPreferencesToJobQuery } from "../services/preferenceMapper.js";
import { aiClient } from "../services/aiClient.js";
import { appEventBus } from "../services/eventBus.js";
import { logger } from "../utils/logger.js";
import {
  DISCOVERY_QUEUE_NAME,
  DISCOVERY_JOB_NAME,
  getDiscoveryDlq,
  type DiscoveryJobData,
} from "./discoveryQueue.js";

interface DiscoverJobItem {
  job: {
    source: string;
    external_id: string;
    title: string;
    company: string;
    location: string;
    location_badge?: string;
    duplicate_locations?: string[];
    remote?: boolean | null;
    salary_min?: number | null;
    salary_max?: number | null;
    currency?: string | null;
    description: string;
    skills_required?: string[];
    url: string;
    posted_at?: string | null;
  };
  match: {
    overall_score: number;
    tier?: "strong" | "good" | "possible" | "stretch";
    breakdown?: Record<string, unknown>;
    matched_skills?: string[];
    missing_skills?: string[];
    explanation?: string;
    hard_filter_failed?: boolean;
    hard_filter_reason?: string | null;
  };
  embedding?: number[] | null;
  fallback_stage?: string;
}

interface DiscoverResponseData {
  ranked_jobs: DiscoverJobItem[];
  total: number;
  unfiltered_count: number;
  hard_filtered_count: number;
  source_statuses: Array<{
    source: string;
    status: string;
    count: number;
    raw_fetched?: number;
    after_dedupe?: number;
    after_local_filters?: number;
    query_sent?: string;
    http_status?: number | null;
    error?: string | null;
    duration_ms?: number;
    local_filters_applied?: string[];
    filter_breakdown?: Record<string, number>;
  }>;
  diagnostics?: Record<string, unknown>;
  tier_counts?: Record<string, number>;
  timings?: Record<string, number>;
  fallback_used?: boolean;
  fallback_stage?: string;
}

export async function processDiscoveryJob(data: DiscoveryJobData): Promise<void> {
  const { searchId, userId, query } = data;
  const startTime = Date.now();

  logger.info({ searchId, userId }, "Starting unified discovery pipeline execution");

  // 1. Mark SearchRun processing and emit SSE event
  await SearchRun.findByIdAndUpdate(searchId, { status: "processing" });
  appEventBus.emitSearchEvent(searchId, {
    type: "status",
    status: "processing",
    message: "Discovering and ranking positions from sources",
  });

  try {
    // 2. Load user profile for query expansion and ranking
    const userResume = await Resume.findOne({ userId }).sort({ createdAt: -1 });
    const profile = (userResume?.verifiedProfile || userResume?.parsedProfile) as
      | Record<string, unknown>
      | undefined;

    const safeProfile: Record<string, unknown> = {
      ...(profile || {}),
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

    const prefs = query.preferences as Record<string, unknown> | undefined;
    const preferencesPayload = {
      target_titles:
        prefs?.targetTitles || (query.keywords ? [query.keywords] : ["Software Engineer"]),
      employment_types: prefs?.employmentTypes || undefined,
      experience_levels: prefs?.experienceLevels || undefined,
      work_modes: prefs?.workModes || undefined,
      location: query.location || undefined,
      remote_only: Boolean(query.remoteOnly),
      remote_worldwide: Boolean(prefs?.remoteWorldwide ?? true),
      open_to_relocation: Boolean(prefs?.openToRelocation ?? false),
      salary_min: (prefs?.salary as { minimum?: number })?.minimum || undefined,
      excluded_keywords: prefs?.excludedKeywords || undefined,
      excluded_companies: prefs?.excludedCompanies || undefined,
      role_families: prefs?.roleFamilies || undefined,
      also_show_other_roles: Boolean(prefs?.alsoShowOtherRoles ?? false),
    };

    // 3. Call unified /v1/discover endpoint (Single Code Path)
    logger.info({ searchId, userId }, "Dispatching to AI service unified /v1/discover endpoint");
    const discoverRes = await aiClient.post<{ data: DiscoverResponseData }>("/v1/discover", {
      profile: safeProfile,
      preferences: preferencesPayload,
      query: {
        keywords: query.keywords,
        target_titles: preferencesPayload.target_titles,
        employment_types: preferencesPayload.employment_types,
        experience_levels: preferencesPayload.experience_levels,
        work_modes: preferencesPayload.work_modes,
        location: query.location || undefined,
        remote_only: Boolean(query.remoteOnly),
        seniority: query.seniority || undefined,
        sources: query.sources?.length ? query.sources : undefined,
      },
      sources: query.sources?.length ? query.sources : undefined,
      llm_rerank: false,
    });

    const discoverData = discoverRes.data?.data;
    const rankedItems = discoverData?.ranked_jobs || [];

    // 4. Upsert Jobs in Bulk
    const jobBulkOps: any[] = [];
    const jobDocMap = new Map<string, Types.ObjectId>();
    const seenHashes = new Set<string>();
    const perSourceCounts: Record<string, number> = {};

    for (const item of rankedItems) {
      const raw = item.job;
      const source = raw.source || "manual";
      const externalId = raw.external_id || `job-${Date.now()}-${Math.random()}`;
      const hash = `${source}:${externalId}:${raw.title.toLowerCase().trim()}:${raw.company.toLowerCase().trim()}`;

      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      const postedAt = raw.posted_at ? new Date(raw.posted_at) : new Date();
      const embedding = Array.isArray(item.embedding) && item.embedding.length === 384 ? item.embedding : [];

      jobBulkOps.push({
        updateOne: {
          filter: { hash },
          update: {
            $set: {
              source,
              externalId,
              hash,
              title: raw.title,
              company: raw.company,
              location: raw.location,
              locationBadge: raw.location_badge || null,
              duplicateLocations: raw.duplicate_locations || [],
              remote: Boolean(raw.remote),
              salary:
                raw.salary_min
                  ? { min: raw.salary_min, max: raw.salary_max, currency: raw.currency }
                  : null,
              description: raw.description,
              skills: raw.skills_required || [],
              url: raw.url,
              postedAt,
              embedding,
            },
          },
          upsert: true,
        },
      });
      perSourceCounts[source] = (perSourceCounts[source] || 0) + 1;
    }

    if (jobBulkOps.length > 0) {
      await Job.bulkWrite(jobBulkOps, { ordered: false });
      const savedDocs = await Job.find({ hash: { $in: Array.from(seenHashes) } }).select("_id hash").lean();
      for (const d of savedDocs) {
        jobDocMap.set(d.hash, d._id as Types.ObjectId);
      }
    }

    // 5. Upsert Matches in Bulk (deduplicated by jobId to avoid E11000 duplicate key in bulkWrite)
    const matchBulkOps: any[] = [];
    const seenJobIds = new Set<string>();
    let passingMatchesCount = 0;
    let hardFilteredCount = 0;

    for (const item of rankedItems) {
      const raw = item.job;
      const matchRes = item.match;
      const source = raw.source || "manual";
      const externalId = raw.external_id;
      const hash = `${source}:${externalId}:${raw.title.toLowerCase().trim()}:${raw.company.toLowerCase().trim()}`;
      const jobId = jobDocMap.get(hash);

      if (!jobId || !matchRes) continue;

      const jobIdStr = jobId.toString();
      if (seenJobIds.has(jobIdStr)) {
        continue;
      }
      seenJobIds.add(jobIdStr);

      const score = matchRes.overall_score ?? 0;
      const failed = Boolean(matchRes.hard_filter_failed);
      const tier = matchRes.tier || (score >= 70 ? "strong" : score >= 50 ? "good" : score >= 30 ? "possible" : "stretch");

      if (failed) {
        hardFilteredCount++;
      } else {
        passingMatchesCount++;
      }

      matchBulkOps.push({
        updateOne: {
          filter: { userId, jobId },
          update: {
            $set: {
              userId,
              jobId,
              searchId,
              score,
              tier,
              breakdown: matchRes.breakdown || {},
              matchedSkills: matchRes.matched_skills || [],
              missingSkills: matchRes.missing_skills || [],
              explanation: matchRes.explanation || "",
              hardFilterFailed: failed,
              pipelineVersion: PIPELINE_VERSION,
            },
          },
          upsert: true,
        },
      });
    }

    if (matchBulkOps.length > 0) {
      await Match.bulkWrite(matchBulkOps, { ordered: false });
    }

    // 6. Final Status & Telemetry
    const finalResultsCount = passingMatchesCount;
    const finalStatus = finalResultsCount > 0 ? "completed" : "completed_empty";
    const durationMs = Date.now() - startTime;

    const sourceStatuses = discoverData?.source_statuses || [];
    const diagnostics = {
      ...(discoverData?.diagnostics || {}),
      ranked: rankedItems.length,
      passing: passingMatchesCount,
      hardFiltered: hardFilteredCount,
      tierCounts: discoverData?.tier_counts,
      timings: discoverData?.timings,
    };

    await SearchRun.findByIdAndUpdate(searchId, {
      status: finalStatus,
      resultsCount: finalResultsCount,
      perSourceCounts,
      sourceStatuses,
      diagnostics,
      durationMs,
      error: null,
      errorStack: null,
    });

    appEventBus.emitSearchEvent(searchId, {
      type: "completed",
      status: finalStatus,
      resultsCount: finalResultsCount,
      durationMs,
      perSourceCounts,
      sourceStatuses,
      diagnostics,
    });

    logger.info(
      {
        searchId,
        matchesCount: finalResultsCount,
        status: finalStatus,
        durationMs,
        timings: discoverData?.timings,
      },
      "Unified discovery pipeline completed successfully",
    );
  } catch (err: unknown) {
    const axiosData = (err as { response?: { data?: any } })?.response?.data;
    let errorMsg =
      axiosData?.error?.message ||
      (typeof axiosData?.detail === "string" ? axiosData.detail : axiosData?.detail?.message) ||
      axiosData?.message ||
      (err instanceof Error ? err.message : String(err));
    const errorDetails = axiosData?.error || axiosData?.detail || null;
    const errorStack = err instanceof Error ? err.stack : undefined;

    logger.error({ err, searchId, errorMsg, errorDetails, errorStack }, "Discovery pipeline failed");

    await SearchRun.findByIdAndUpdate(searchId, {
      status: "failed",
      error: errorMsg,
      errorDetails,
      errorStack,
      durationMs: Date.now() - startTime,
    });

    appEventBus.emitSearchEvent(searchId, {
      type: "failed",
      status: "failed",
      error: errorMsg,
      errorDetails,
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
