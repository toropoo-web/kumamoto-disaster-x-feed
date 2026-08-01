import path from "path";
import fs from "fs";
import { readJsonFile, writeJsonAtomically } from "@/lib/json-io";
import {
  buildCrossSearchQueries,
  listOfficialAccountHandles,
} from "@/lib/cross-search-queries";
import {
  countUnregisteredAccountPosts,
  mergeCrossSearchPosts,
  mapSearchResponseToCrossSearchPosts,
} from "@/lib/cross-search-pipeline";
import { XSearchClient } from "@/lib/fetchers/x-search-client";
import { loadXApiConfigFromEnv } from "@/types/x-api";
import {
  createEmptyCrossSearchFetchState,
  CROSS_SEARCH_SINCE_DATE,
  type CrossSearchFetchState,
  type CrossSearchPost,
} from "@/types/cross-search-post";

const DATA_DIR = () => path.join(process.cwd(), "data");
const CROSS_SEARCH_POSTS_FILE = () =>
  path.join(DATA_DIR(), "posts-cross-search.json");
const CROSS_SEARCH_STATE_FILE = () =>
  path.join(DATA_DIR(), "cross-search-fetch-state.json");
const MAX_PAGES_PER_QUERY = Number(process.env.X_CROSS_SEARCH_MAX_PAGES || 3);

export type CrossSearchRunResult = {
  dryRun: boolean;
  tokenConfigured: boolean;
  status: CrossSearchFetchState["status"];
  querySummaries: Array<{
    id: string;
    query: string;
    apiPostCount: number;
    accepted: number;
    rejected: number;
    status: "SUCCESS" | "FAILED";
    errorCode?: string;
  }>;
  fetchState: CrossSearchFetchState;
  mergedPosts?: CrossSearchPost[];
};

export async function runCrossSearchFetch(options?: {
  dryRun?: boolean;
  client?: XSearchClient;
}): Promise<CrossSearchRunResult> {
  const dryRun = options?.dryRun ?? false;
  const config = loadXApiConfigFromEnv();
  const now = new Date().toISOString();
  const existing = readJsonFile<CrossSearchPost[]>(
    CROSS_SEARCH_POSTS_FILE(),
    []
  );
  const previousState = readJsonFile<CrossSearchFetchState>(
    CROSS_SEARCH_STATE_FILE(),
    createEmptyCrossSearchFetchState()
  );
  const queries = buildCrossSearchQueries();
  const officialHandles = listOfficialAccountHandles();

  if (!config) {
    return {
      dryRun,
      tokenConfigured: false,
      status: "NOT_RUN",
      querySummaries: [],
      fetchState: {
        ...previousState,
        status: "NOT_RUN",
      },
    };
  }

  const client = options?.client ?? new XSearchClient(config);
  const incoming: CrossSearchPost[] = [];
  const querySummaries: CrossSearchRunResult["querySummaries"] = [];
  let apiPostCount = 0;
  let acceptedPostCount = 0;
  let failedQueryCount = 0;

  for (const query of queries) {
    try {
      let paginationToken: string | undefined;
      let queryApiPostCount = 0;
      let queryAccepted = 0;
      let queryRejected = 0;

      for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
        const response = await client.searchRecent({
          query: query.query,
          startTime: CROSS_SEARCH_SINCE_DATE,
          maxResults: config.maxResults,
          paginationToken,
        });
        const mapped = mapSearchResponseToCrossSearchPosts(
          response,
          now,
          query.id
        );
        incoming.push(...mapped.posts);
        queryApiPostCount += mapped.apiPostCount;
        queryAccepted += mapped.posts.length;
        queryRejected += mapped.rejected;
        paginationToken = response.meta?.next_token;
        if (!paginationToken) {
          break;
        }
      }

      apiPostCount += queryApiPostCount;
      acceptedPostCount += queryAccepted;
      querySummaries.push({
        id: query.id,
        query: query.query,
        apiPostCount: queryApiPostCount,
        accepted: queryAccepted,
        rejected: queryRejected,
        status: "SUCCESS",
      });
    } catch (error) {
      failedQueryCount += 1;
      const errorCode =
        error instanceof Error && "code" in error
          ? String((error as { code?: string }).code)
          : "UNKNOWN";
      querySummaries.push({
        id: query.id,
        query: query.query,
        apiPostCount: 0,
        accepted: 0,
        rejected: 0,
        status: "FAILED",
        errorCode,
      });
      console.error(`Cross-search query failed (${query.id}): ${errorCode}`);
    }
  }

  const merged = mergeCrossSearchPosts(existing, incoming);
  const unregisteredAccountPostCount = countUnregisteredAccountPosts(
    merged,
    officialHandles
  );

  let status: CrossSearchFetchState["status"] = "SUCCESS";
  if (failedQueryCount > 0 && failedQueryCount < queries.length) {
    status = "PARTIAL";
  } else if (failedQueryCount === queries.length) {
    status = "FAILED";
  }

  const fetchState: CrossSearchFetchState = {
    lastAttemptAt: now,
    lastSuccessfulFetchAt: status === "FAILED" ? previousState.lastSuccessfulFetchAt : now,
    queryCount: queries.length,
    apiPostCount,
    acceptedPostCount,
    storedPostCount: merged.length,
    unregisteredAccountPostCount,
    status,
  };

  if (dryRun) {
    return {
      dryRun: true,
      tokenConfigured: true,
      status,
      querySummaries,
      fetchState,
      mergedPosts: merged,
    };
  }

  if (status !== "FAILED") {
    writeJsonAtomically(CROSS_SEARCH_POSTS_FILE(), merged);
    writeJsonAtomically(CROSS_SEARCH_STATE_FILE(), fetchState);
  }

  return {
    dryRun: false,
    tokenConfigured: true,
    status,
    querySummaries,
    fetchState,
    mergedPosts: merged,
  };
}

export function printCrossSearchSummary(result: CrossSearchRunResult): void {
  for (const summary of result.querySummaries) {
    console.log(`QUERY_ID: ${summary.id}`);
    console.log(`QUERY: ${summary.query}`);
    console.log(`API_POST_COUNT: ${summary.apiPostCount}`);
    console.log(`ACCEPTED: ${summary.accepted}`);
    console.log(`REJECTED: ${summary.rejected}`);
    console.log(`STATUS: ${summary.status}`);
    if (summary.errorCode) {
      console.log(`ERROR_CODE: ${summary.errorCode}`);
    }
    console.log("");
  }
  console.log(`STORED_POST_COUNT: ${result.fetchState.storedPostCount}`);
  console.log(
    `UNREGISTERED_ACCOUNT_POST_COUNT: ${result.fetchState.unregisteredAccountPostCount}`
  );
  console.log(`STATUS: ${result.status}`);
}
