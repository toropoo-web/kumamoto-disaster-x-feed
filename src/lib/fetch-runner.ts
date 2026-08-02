import path from "path";
import type { OfficialPost, FetchState } from "@/types/post";
import type { Source } from "@/types/source";
import type { SourceRuntimeState } from "@/types/source-runtime";
import type { PostProcessingBreakdown } from "@/types/post-processing";
import {
  createEmptyBreakdown,
  isCountReconciled,
  mergeBreakdowns,
  sumOtherRejected,
} from "@/types/post-processing";
import { loadXApiConfigFromEnv } from "@/types/x-api";
import { XApiError } from "@/types/x-api";
import { getFetchEnabledSources } from "@/lib/sources";
import {
  applyContentFilterBreakdown,
  countNewPosts,
  mergePosts,
} from "@/lib/fetch-pipeline";
import { buildFetchState, createEmptyFetchState } from "@/lib/fetch-state";
import { buildMonitoringFields } from "@/lib/fetch-monitoring";
import { removeSeedPlaceholderPosts } from "@/lib/seed-posts";
import { readJsonFile, writeJsonAtomically } from "@/lib/json-io";
import { XApiPostFetcher } from "@/lib/fetchers/x-api";
import type { XPostFetcher } from "@/lib/fetchers/types";
import {
  createDefaultRuntime,
  getAllSourceRuntime,
  replaceSourceRuntimeStore,
} from "@/lib/source-runtime";
import { recordApiUsage } from "@/lib/api-usage";
import {
  feedStatusFromFetchResult,
  readFeedStatus,
  writeFeedStatus,
} from "@/lib/feed-status";

const DATA_DIR = () => path.join(process.cwd(), "data");
const POSTS_FILE = () => path.join(DATA_DIR(), "posts.json");
const FETCH_STATE_FILE = () => path.join(DATA_DIR(), "fetch-state.json");

export type SourceFetchSummary = {
  sourceId: string;
  sourceName: string;
  accountHandle: string | null;
  userIdResolution: "CACHED" | "LOOKUP" | "FAILED" | "SKIPPED";
  apiPostCount: number;
  accepted: number;
  rejected: number;
  rejectedByContentFilter: number;
  rejectedReply: number;
  rejectedRepost: number;
  rejectedInvalidPost: number;
  rejectedDuplicate: number;
  rejectedMissingHandle: number;
  rejectedMissingId: number;
  processingError: number;
  newPostCount: number;
  lastSeenPostId: string | null;
  wouldUpdateLastSeenId: string | null;
  status: "SUCCESS" | "NO_NEW_POSTS" | "FAILED";
  paginationPartial: boolean;
  countReconciled: boolean;
  errorCode?: string;
  failureStage?: string;
  httpStatus?: number;
  apiErrorTitle?: string;
};

export type FetchRunResult = {
  status: FetchState["status"];
  dryRun: boolean;
  tokenConfigured: boolean;
  sourceSummaries: SourceFetchSummary[];
  totals: PostProcessingBreakdown;
  mergedPosts?: OfficialPost[];
  fetchState: FetchState;
};

export type FetchRunOptions = {
  dryRun?: boolean;
  fetcher?: XPostFetcher;
};

export async function runFetch(
  options: FetchRunOptions = {}
): Promise<FetchRunResult> {
  const dryRun = options.dryRun ?? false;
  const config = loadXApiConfigFromEnv();
  const now = new Date().toISOString();
  const sources = getFetchEnabledSources();
  const existing = removeSeedPlaceholderPosts(
    readJsonFile<OfficialPost[]>(POSTS_FILE(), [])
  );
  const previousState = readJsonFile<FetchState>(
    FETCH_STATE_FILE(),
    createEmptyFetchState()
  );

  const emptyTotals = createEmptyBreakdown();

  if (!config) {
    return {
      status: "NOT_RUN",
      dryRun,
      tokenConfigured: false,
      sourceSummaries: [],
      totals: emptyTotals,
      fetchState: {
        ...previousState,
        sourceCount: sources.length,
        status: "NOT_RUN",
      },
    };
  }

  const fetcher = options.fetcher ?? new XApiPostFetcher(config);

  const runtimeStore = getAllSourceRuntime();
  const incoming: OfficialPost[] = [];
  const sourceSummaries: SourceFetchSummary[] = [];
  const runtimeUpdates: Record<string, SourceRuntimeState> = {
    ...runtimeStore.sources,
  };

  let successfulSourceCount = 0;
  let failedSourceCount = 0;
  let anyPartial = false;
  const totals = createEmptyBreakdown();

  let usageLookup = 0;
  let usageTimeline = 0;

  for (const source of sources) {
    const runtime =
      runtimeStore.sources[source.sourceId] ??
      createDefaultRuntime(source.sourceId);

    try {
      let xUserId = runtime.xUserId ?? source.xUserId ?? null;
      let userIdResolution: SourceFetchSummary["userIdResolution"] = "CACHED";

      if (!xUserId) {
        userIdResolution = "LOOKUP";
        if (fetcher.resolveUserId) {
          xUserId = await fetcher.resolveUserId(source, runtime);
        } else if (fetcher instanceof XApiPostFetcher) {
          xUserId = await fetcher.resolveUserId(source, runtime);
        } else {
          throw new XApiError(
            "INVALID_RESPONSE",
            "User ID resolution is not available",
            { failureStage: "user_lookup" }
          );
        }
        runtimeUpdates[source.sourceId] = {
          ...(runtimeUpdates[source.sourceId] ??
            createDefaultRuntime(source.sourceId)),
          xUserId,
        };
      }

      const currentRuntime = {
        ...(runtimeUpdates[source.sourceId] ?? runtime),
        xUserId,
      };

      const result = await fetcher.fetchLatestPosts(source, currentRuntime);
      if (result.paginationPartial) anyPartial = true;

      const filtered = applyContentFilterBreakdown(
        result.posts,
        source,
        now,
        result.breakdown
      );
      const breakdown = filtered.breakdown;

      incoming.push(...filtered.posts);
      totals.apiPostCount += breakdown.apiPostCount;
      totals.accepted += breakdown.accepted;
      totals.rejectedByContentFilter += breakdown.rejectedByContentFilter;
      totals.rejectedReply += breakdown.rejectedReply;
      totals.rejectedRepost += breakdown.rejectedRepost;
      totals.rejectedInvalidPost += breakdown.rejectedInvalidPost;
      totals.rejectedDuplicate += breakdown.rejectedDuplicate;
      totals.rejectedMissingHandle += breakdown.rejectedMissingHandle;
      totals.rejectedMissingId += breakdown.rejectedMissingId;
      totals.processingError += breakdown.processingError;

      const sourceStatus: SourceFetchSummary["status"] =
        breakdown.apiPostCount === 0 ? "NO_NEW_POSTS" : "SUCCESS";

      sourceSummaries.push({
        sourceId: source.sourceId,
        sourceName: source.displayName,
        accountHandle: source.accountHandle,
        userIdResolution,
        apiPostCount: breakdown.apiPostCount,
        accepted: breakdown.accepted,
        rejected: breakdown.rejectedByContentFilter,
        rejectedByContentFilter: breakdown.rejectedByContentFilter,
        rejectedReply: breakdown.rejectedReply,
        rejectedRepost: breakdown.rejectedRepost,
        rejectedInvalidPost: breakdown.rejectedInvalidPost,
        rejectedDuplicate: breakdown.rejectedDuplicate,
        rejectedMissingHandle: breakdown.rejectedMissingHandle,
        rejectedMissingId: breakdown.rejectedMissingId,
        processingError: breakdown.processingError,
        newPostCount: countNewPosts(existing, filtered.posts),
        lastSeenPostId: currentRuntime.lastSeenPostId,
        wouldUpdateLastSeenId: result.newestPostId,
        status: sourceStatus,
        paginationPartial: result.paginationPartial,
        countReconciled: isCountReconciled(breakdown),
      });

      runtimeUpdates[source.sourceId] = {
        ...currentRuntime,
        lastAttemptAt: now,
        lastSuccessfulFetchAt: now,
        lastResultCount: breakdown.apiPostCount,
        status: sourceStatus === "NO_NEW_POSTS" ? "NO_NEW_POSTS" : "SUCCESS",
        lastSeenPostId: result.newestPostId ?? currentRuntime.lastSeenPostId,
        lastErrorCode: undefined,
      };

      successfulSourceCount += 1;
    } catch (error) {
      failedSourceCount += 1;

      const code =
        error instanceof XApiError ? error.code : "NETWORK_ERROR";
      if (error instanceof XApiError && error.code === "RATE_LIMITED") {
        console.error(
          `Rate limited for ${source.sourceId}. Retry after approximately: ${error.rateLimitResetAt ?? "unknown"}`
        );
      }

      console.error(
        `Fetch failed for ${source.sourceId}: ${code}` +
          (error instanceof XApiError && error.status !== undefined
            ? ` (HTTP ${error.status})`
            : "") +
          (error instanceof XApiError && error.failureStage
            ? ` stage=${error.failureStage}`
            : "") +
          (error instanceof XApiError && error.apiErrorTitle
            ? ` title=${error.apiErrorTitle}`
            : "")
      );

      sourceSummaries.push({
        sourceId: source.sourceId,
        sourceName: source.displayName,
        accountHandle: source.accountHandle,
        userIdResolution: "FAILED",
        apiPostCount: 0,
        accepted: 0,
        rejected: 0,
        rejectedByContentFilter: 0,
        rejectedReply: 0,
        rejectedRepost: 0,
        rejectedInvalidPost: 0,
        rejectedDuplicate: 0,
        rejectedMissingHandle: 0,
        rejectedMissingId: 0,
        processingError: 0,
        newPostCount: 0,
        lastSeenPostId: runtime.lastSeenPostId,
        wouldUpdateLastSeenId: runtime.lastSeenPostId,
        status: "FAILED",
        paginationPartial: false,
        countReconciled: true,
        errorCode: code,
        failureStage: error instanceof XApiError ? error.failureStage : undefined,
        httpStatus: error instanceof XApiError ? error.status : undefined,
        apiErrorTitle: error instanceof XApiError ? error.apiErrorTitle : undefined,
      });

      runtimeUpdates[source.sourceId] = {
        ...runtime,
        lastAttemptAt: now,
        status: "FAILED",
        lastErrorCode: code,
      };
    }
  }

  if (fetcher instanceof XApiPostFetcher) {
    const counters = fetcher.getUsageCounters();
    usageLookup = counters.userLookupRequests;
    usageTimeline = counters.timelineRequests;
  }

  if (failedSourceCount > 0 && successfulSourceCount === 0) {
    const fetchState = buildFetchState({
      now,
      sourceCount: sources.length,
      successfulSourceCount: 0,
      failedSourceCount,
      status: "FAILED",
      totals: { ...totals, accepted: 0, apiPostCount: 0 },
      mergedPosts: existing,
      previousState,
      monitoring: buildMonitoringFields({
        summaries: sourceSummaries,
        status: "FAILED",
        previousState,
      }),
    });
    if (!dryRun) {
      replaceSourceRuntimeStore({ sources: runtimeUpdates });
      writeJsonAtomically(FETCH_STATE_FILE(), fetchState);
      writeFeedStatus(
        feedStatusFromFetchResult({
          persisted: false,
          fetchState,
          totals,
          now,
        })
      );
    }
    return {
      status: "FAILED",
      dryRun,
      tokenConfigured: true,
      sourceSummaries,
      totals,
      fetchState,
    };
  }

  const merged = mergePosts(existing, incoming);
  let status: FetchState["status"] = "SUCCESS";
  if (failedSourceCount > 0 || anyPartial) status = "PARTIAL";

  const fetchState = buildFetchState({
    now,
    sourceCount: sources.length,
    successfulSourceCount,
    failedSourceCount,
    status,
    totals,
    mergedPosts: merged,
    previousState,
    monitoring: buildMonitoringFields({
      summaries: sourceSummaries,
      status,
      previousState,
    }),
  });

  if (dryRun) {
    return {
      status,
      dryRun: true,
      tokenConfigured: true,
      sourceSummaries,
      totals,
      mergedPosts: merged,
      fetchState,
    };
  }

  try {
    writeJsonAtomically(POSTS_FILE(), merged);
    replaceSourceRuntimeStore({ sources: runtimeUpdates });
    writeJsonAtomically(FETCH_STATE_FILE(), fetchState);
    recordApiUsage({
      userLookupRequests: usageLookup,
      timelineRequests: usageTimeline,
      postsRead: totals.apiPostCount,
      acceptedPosts: totals.accepted,
    });
    writeFeedStatus(
      feedStatusFromFetchResult({
        persisted: true,
        fetchState,
        totals,
        now,
      })
    );
  } catch (error) {
    console.error("Failed to persist fetch results:", error);
    writeFeedStatus(
      feedStatusFromFetchResult({
        persisted: false,
        fetchState: {
          ...previousState,
          lastAttemptAt: now,
          sourceCount: sources.length,
          successfulSourceCount,
          failedSourceCount,
          status: "FAILED",
        },
        totals,
        now,
      })
    );
    return {
      status: "FAILED",
      dryRun: false,
      tokenConfigured: true,
      sourceSummaries,
      totals,
      fetchState: {
        ...previousState,
        lastAttemptAt: now,
        sourceCount: sources.length,
        successfulSourceCount,
        failedSourceCount,
        status: "FAILED",
      },
    };
  }

  return {
    status,
    dryRun: false,
    tokenConfigured: true,
    sourceSummaries,
    totals,
    mergedPosts: merged,
    fetchState,
  };
}

export function printDryRunSummary(
  summaries: SourceFetchSummary[],
  totals: PostProcessingBreakdown
): void {
  for (const summary of summaries) {
    console.log(`SOURCE_ID: ${summary.sourceId}`);
    console.log(`SOURCE_NAME: ${summary.sourceName}`);
    console.log(`ACCOUNT_HANDLE: ${summary.accountHandle ?? "none"}`);
    console.log(`USER_ID_RESOLUTION: ${summary.userIdResolution}`);
    console.log(`API_POST_COUNT: ${summary.apiPostCount}`);
    console.log(`ACCEPTED: ${summary.accepted}`);
    console.log(`REJECTED: ${summary.rejected}`);
    console.log(`REJECTED_REPLY: ${summary.rejectedReply}`);
    console.log(`REJECTED_REPOST: ${summary.rejectedRepost}`);
    console.log(`REJECTED_INVALID_POST: ${summary.rejectedInvalidPost}`);
    console.log(`REJECTED_DUPLICATE: ${summary.rejectedDuplicate}`);
    console.log(`REJECTED_MISSING_HANDLE: ${summary.rejectedMissingHandle}`);
    console.log(`REJECTED_MISSING_ID: ${summary.rejectedMissingId}`);
    console.log(`PROCESSING_ERROR: ${summary.processingError}`);
    console.log(`COUNT_RECONCILED: ${summary.countReconciled ? "YES" : "NO"}`);
    console.log(`LAST_SEEN_POST_ID: ${summary.lastSeenPostId ?? "none"}`);
    console.log(
      `WOULD_UPDATE_LAST_SEEN_ID: ${summary.wouldUpdateLastSeenId ?? "none"}`
    );
    console.log(`STATUS: ${summary.status}`);
    if (summary.errorCode) {
      console.log(`ERROR_CODE: ${summary.errorCode}`);
    }
    if (summary.failureStage) {
      console.log(`FAILURE_STAGE: ${summary.failureStage}`);
    }
    if (summary.httpStatus !== undefined) {
      console.log(`HTTP_STATUS: ${summary.httpStatus}`);
    }
    if (summary.apiErrorTitle) {
      console.log(`API_ERROR_TITLE: ${summary.apiErrorTitle}`);
    }
    if (summary.paginationPartial) {
      console.log("PAGINATION: PARTIAL");
    }
    console.log("");
  }

  console.log(`API_POST_COUNT: ${totals.apiPostCount}`);
  console.log(`FILTER_ACCEPTED: ${totals.accepted}`);
  console.log(`FILTER_REJECTED: ${totals.rejectedByContentFilter}`);
  console.log(`REJECTED_REPLY: ${totals.rejectedReply}`);
  console.log(`REJECTED_REPOST: ${totals.rejectedRepost}`);
  console.log(`REJECTED_INVALID_POST: ${totals.rejectedInvalidPost}`);
  console.log(`REJECTED_DUPLICATE: ${totals.rejectedDuplicate}`);
  console.log(`REJECTED_MISSING_HANDLE: ${totals.rejectedMissingHandle}`);
  console.log(`REJECTED_MISSING_ID: ${totals.rejectedMissingId}`);
  console.log(`PROCESSING_ERROR: ${totals.processingError}`);
  console.log(
    `COUNT_RECONCILED: ${isCountReconciled(totals) ? "YES" : "NO"}`
  );
  console.log(`OTHER_REJECTED: ${sumOtherRejected(totals)}`);
}
