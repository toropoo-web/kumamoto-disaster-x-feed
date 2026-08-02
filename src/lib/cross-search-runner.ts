import path from "path";
import { readJsonFile, writeJsonAtomically } from "@/lib/json-io";
import {
  buildCrossSearchQueries,
  listOfficialAccountHandles,
  resolveQueriesForScheduledRun,
} from "@/lib/cross-search-queries";
import {
  applyBatchFailure,
  applyBatchSuccess,
  countDuplicateIncomingPosts,
  getBatchState,
  normalizeCrossSearchFetchState,
  resolveBatchStartTime,
  resolveIncrementalSearchStrategy,
} from "@/lib/cross-search-incremental";
import {
  countUnregisteredAccountPosts,
  mergeCrossSearchPosts,
  mapSearchResponseToCrossSearchPosts,
} from "@/lib/cross-search-pipeline";
import { evaluateCrossSearchPost } from "@/lib/cross-search-filters";
import { XSearchClient } from "@/lib/fetchers/x-search-client";
import { loadXApiConfigFromEnv } from "@/types/x-api";
import {
  createEmptyCrossSearchFetchState,
  type CrossSearchBatchFetchState,
  type CrossSearchFetchState,
  type CrossSearchPost,
} from "@/types/cross-search-post";

const DATA_DIR = () => path.join(process.cwd(), "data");
const CROSS_SEARCH_POSTS_FILE = () =>
  path.join(DATA_DIR(), "posts-cross-search.json");
const CROSS_SEARCH_STATE_FILE = () =>
  path.join(DATA_DIR(), "cross-search-fetch-state.json");
const MAX_PAGES_PER_QUERY = Number(process.env.X_CROSS_SEARCH_MAX_PAGES || 1);

function pruneCrossSearchPosts(posts: CrossSearchPost[]): CrossSearchPost[] {
  return posts.filter(function (post) {
    const evaluation = evaluateCrossSearchPost({
      text: post.content || post.summary || post.title || "",
      postedAt: post.postedAt,
      accountHandle: post.accountHandle,
    });
    return evaluation.pass;
  });
}

function resolveNewestPostId(
  responseNewestId: string | undefined,
  incomingPosts: CrossSearchPost[]
): string | null {
  if (responseNewestId) {
    return responseNewestId;
  }
  if (incomingPosts.length === 0) {
    return null;
  }
  return incomingPosts
    .map(function (post) {
      return post.postId.replace(/^POST-CROSS-/, "");
    })
    .sort(function (a, b) {
      return BigInt(a) > BigInt(b) ? -1 : 1;
    })[0];
}

export type CrossSearchRunResult = {
  dryRun: boolean;
  tokenConfigured: boolean;
  status: CrossSearchFetchState["status"];
  searchStrategy: ReturnType<typeof resolveIncrementalSearchStrategy>;
  querySummaries: Array<{
    id: string;
    query: string;
    startTime: string;
    apiPostCount: number;
    accepted: number;
    rejected: number;
    duplicateExcluded: number;
    status: "SUCCESS" | "FAILED";
    errorCode?: string;
  }>;
  fetchState: CrossSearchFetchState;
  mergedPosts?: CrossSearchPost[];
  metrics: {
    duplicateExcluded: number;
    newStoredCount: number;
  };
};

export async function runCrossSearchFetch(options?: {
  dryRun?: boolean;
  client?: XSearchClient;
  runAllQueries?: boolean;
  now?: Date;
}): Promise<CrossSearchRunResult> {
  const dryRun = options?.dryRun ?? false;
  const config = loadXApiConfigFromEnv();
  const now = new Date().toISOString();
  const existing = readJsonFile<CrossSearchPost[]>(
    CROSS_SEARCH_POSTS_FILE(),
    []
  );
  const allQueries = buildCrossSearchQueries();
  const rawPreviousState = readJsonFile<CrossSearchFetchState>(
    CROSS_SEARCH_STATE_FILE(),
    createEmptyCrossSearchFetchState()
  );
  const previousState = normalizeCrossSearchFetchState(
    rawPreviousState,
    allQueries.map(function (query) {
      return query.id;
    })
  );
  const queries = resolveQueriesForScheduledRun(allQueries, {
    runAll: options?.runAllQueries ?? process.env.X_CROSS_SEARCH_RUN_ALL === "true",
    now: options?.now,
  });
  const officialHandles = listOfficialAccountHandles();
  const batchStates: Record<string, CrossSearchBatchFetchState> = {
    ...(previousState.batches ?? {}),
  };

  if (!config) {
    return {
      dryRun,
      tokenConfigured: false,
      status: "NOT_RUN",
      searchStrategy: resolveIncrementalSearchStrategy(),
      querySummaries: [],
      fetchState: {
        ...previousState,
        status: "NOT_RUN",
      },
      metrics: {
        duplicateExcluded: 0,
        newStoredCount: 0,
      },
    };
  }

  const client = options?.client ?? new XSearchClient(config);
  const incoming: CrossSearchPost[] = [];
  const querySummaries: CrossSearchRunResult["querySummaries"] = [];
  let apiPostCount = 0;
  let acceptedPostCount = 0;
  let failedQueryCount = 0;
  let accessDeniedCount = 0;
  let duplicateExcluded = 0;

  for (const query of queries) {
    const previousBatch = getBatchState(previousState, query.id);
    const startTime = resolveBatchStartTime(
      query.id,
      batchStates[query.id] ?? previousBatch,
      previousState
    );

    try {
      let paginationToken: string | undefined;
      let queryApiPostCount = 0;
      let queryAccepted = 0;
      let queryRejected = 0;
      let queryIncoming: CrossSearchPost[] = [];
      let newestPostId: string | null = previousBatch.lastNewestPostId;

      for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
        const response = await client.searchRecent({
          query: query.query,
          startTime,
          maxResults: config.maxResults,
          paginationToken,
        });
        const mapped = mapSearchResponseToCrossSearchPosts(
          response,
          now,
          query.id
        );
        queryIncoming.push(...mapped.posts);
        queryApiPostCount += mapped.apiPostCount;
        queryAccepted += mapped.posts.length;
        queryRejected += mapped.rejected;
        const pageNewest = resolveNewestPostId(
          response.meta?.newest_id,
          mapped.posts
        );
        if (
          pageNewest &&
          (!newestPostId || BigInt(pageNewest) > BigInt(newestPostId))
        ) {
          newestPostId = pageNewest;
        }
        paginationToken = response.meta?.next_token;
        if (!paginationToken) {
          break;
        }
      }

      const queryDuplicates = countDuplicateIncomingPosts(existing, queryIncoming);
      duplicateExcluded += queryDuplicates;
      incoming.push(...queryIncoming);
      apiPostCount += queryApiPostCount;
      acceptedPostCount += queryAccepted;

      const mergedPreview = mergeCrossSearchPosts(existing, incoming);
      batchStates[query.id] = applyBatchSuccess({
        batchId: query.id,
        previous: previousBatch,
        successfulAt: now,
        fetchedCount: queryApiPostCount,
        acceptedCount: queryAccepted,
        storedCount: mergedPreview.length,
        lastNewestPostId: newestPostId,
      });

      querySummaries.push({
        id: query.id,
        query: query.query,
        startTime,
        apiPostCount: queryApiPostCount,
        accepted: queryAccepted,
        rejected: queryRejected,
        duplicateExcluded: queryDuplicates,
        status: "SUCCESS",
      });
    } catch (error) {
      failedQueryCount += 1;
      const errorCode =
        error instanceof Error && "code" in error
          ? String((error as { code?: string }).code)
          : "UNKNOWN";
      if (errorCode === "ACCESS_DENIED") {
        accessDeniedCount += 1;
      }
      const errorStatus =
        error instanceof Error && "status" in error
          ? String((error as { status?: number }).status)
          : "";
      batchStates[query.id] = applyBatchFailure(query.id, previousBatch);
      querySummaries.push({
        id: query.id,
        query: query.query,
        startTime,
        apiPostCount: 0,
        accepted: 0,
        rejected: 0,
        duplicateExcluded: 0,
        status: "FAILED",
        errorCode: errorStatus ? `${errorCode}:${errorStatus}` : errorCode,
      });
      console.error(
        `Cross-search query failed (${query.id}): ${errorCode}${errorStatus ? ` HTTP ${errorStatus}` : ""}`
      );
    }
  }

  const merged = pruneCrossSearchPosts(mergeCrossSearchPosts(existing, incoming));
  const unregisteredAccountPostCount = countUnregisteredAccountPosts(
    merged,
    officialHandles
  );
  const newStoredCount = merged.length - existing.length;

  let status: CrossSearchFetchState["status"] = "SUCCESS";
  if (failedQueryCount > 0 && failedQueryCount < queries.length) {
    status = "PARTIAL";
  } else if (failedQueryCount === queries.length) {
    status = "FAILED";
  }

  const globalConsecutiveFailures =
    status === "FAILED"
      ? (previousState.consecutiveFailures ?? 0) + 1
      : 0;

  const fetchState: CrossSearchFetchState = {
    lastAttemptAt: now,
    lastSuccessfulFetchAt:
      status === "FAILED" ? previousState.lastSuccessfulFetchAt : now,
    queryCount: allQueries.length,
    scheduledQueryCount: queries.length,
    apiPostCount,
    acceptedPostCount,
    storedPostCount: status === "FAILED" ? existing.length : merged.length,
    unregisteredAccountPostCount:
      status === "FAILED"
        ? countUnregisteredAccountPosts(existing, officialHandles)
        : unregisteredAccountPostCount,
    status,
    accessDeniedCount,
    consecutiveFailures: globalConsecutiveFailures,
    batches:
      status === "FAILED"
        ? previousState.batches ?? batchStates
        : {
            ...(previousState.batches ?? {}),
            ...batchStates,
          },
  };

  const result: CrossSearchRunResult = {
    dryRun,
    tokenConfigured: true,
    status,
    searchStrategy: resolveIncrementalSearchStrategy(),
    querySummaries,
    fetchState,
    mergedPosts: merged,
    metrics: {
      duplicateExcluded,
      newStoredCount: status === "FAILED" ? 0 : newStoredCount,
    },
  };

  if (dryRun) {
    return result;
  }

  if (status !== "FAILED") {
    writeJsonAtomically(CROSS_SEARCH_POSTS_FILE(), merged);
    writeJsonAtomically(CROSS_SEARCH_STATE_FILE(), fetchState);
  } else {
    const failureBatches: Record<string, CrossSearchBatchFetchState> = {
      ...(previousState.batches ?? {}),
    };
    querySummaries.forEach(function (summary) {
      if (summary.status === "FAILED") {
        failureBatches[summary.id] = applyBatchFailure(
          summary.id,
          getBatchState(previousState, summary.id)
        );
      }
    });
    writeJsonAtomically(CROSS_SEARCH_STATE_FILE(), {
      ...previousState,
      lastAttemptAt: now,
      status: "FAILED",
      apiPostCount: 0,
      acceptedPostCount: 0,
      accessDeniedCount:
        (previousState.accessDeniedCount ?? 0) + accessDeniedCount,
      consecutiveFailures: globalConsecutiveFailures,
      scheduledQueryCount: queries.length,
      queryCount: allQueries.length,
      batches: failureBatches,
    });
  }

  return result;
}

export function printCrossSearchSummary(result: CrossSearchRunResult): void {
  console.log(`SEARCH_STRATEGY: ${result.searchStrategy}`);
  for (const summary of result.querySummaries) {
    console.log(`QUERY_ID: ${summary.id}`);
    console.log(`START_TIME: ${summary.startTime}`);
    console.log(`QUERY: ${summary.query}`);
    console.log(`API_POST_COUNT: ${summary.apiPostCount}`);
    console.log(`ACCEPTED: ${summary.accepted}`);
    console.log(`REJECTED: ${summary.rejected}`);
    console.log(`DUPLICATE_EXCLUDED: ${summary.duplicateExcluded}`);
    console.log(`STATUS: ${summary.status}`);
    if (summary.errorCode) {
      console.log(`ERROR_CODE: ${summary.errorCode}`);
    }
    console.log("");
  }
  console.log(`STORED_POST_COUNT: ${result.fetchState.storedPostCount}`);
  console.log(`NEW_STORED_COUNT: ${result.metrics.newStoredCount}`);
  console.log(`DUPLICATE_EXCLUDED: ${result.metrics.duplicateExcluded}`);
  console.log(
    `UNREGISTERED_ACCOUNT_POST_COUNT: ${result.fetchState.unregisteredAccountPostCount}`
  );
  console.log(`STATUS: ${result.status}`);
}
