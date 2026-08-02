import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import { buildCrossSearchQueries, resolveQueriesForScheduledRun } from "../src/lib/cross-search-queries";
import { runCrossSearchFetch } from "../src/lib/cross-search-runner";
import {
  applyBatchFailure,
  applyBatchSuccess,
  buildNextStartTime,
  countDuplicateIncomingPosts,
  createEmptyBatchState,
  normalizeCrossSearchFetchState,
  resolveBatchStartTime,
  resolveIncrementalSearchStrategy,
  subtractOverlap,
} from "../src/lib/cross-search-incremental";
import { writeJsonAtomically } from "../src/lib/json-io";
import { XSearchClient } from "../src/lib/fetchers/x-search-client";
import { XApiError } from "../src/types/x-api";
import {
  CROSS_SEARCH_SINCE_DATE,
  createEmptyCrossSearchFetchState,
  type CrossSearchFetchState,
  type CrossSearchPost,
} from "../src/types/cross-search-post";
import type { XSearchTweetResponse } from "../src/lib/fetchers/x-search-client";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const SCHEDULED_NOW = new Date("2026-08-02T00:10:00.000Z");
let tmpDir = "";
let previousCwd = "";

function scheduledQueryId(): string {
  const scheduled = resolveQueriesForScheduledRun(buildCrossSearchQueries(), {
    now: SCHEDULED_NOW,
  });
  return scheduled[0]?.id ?? "MUN-SCOPED-01";
}

function batchStateWithSuccess(batchId: string, previousSuccess: string) {
  return {
    ...createEmptyBatchState(batchId),
    lastSuccessfulSearchAt: previousSuccess,
    nextStartTime: buildNextStartTime(previousSuccess),
  };
}

function makeCrossSearchPost(overrides: Partial<CrossSearchPost> = {}): CrossSearchPost {
  return {
    postId: "POST-CROSS-1001",
    postUrl: "https://x.com/user/status/1001",
    postedAt: "2026-08-02T10:00:00.000Z",
    fetchedAt: "2026-08-02T10:30:00.000Z",
    title: "宇城市で給水車を設置",
    summary: "宇城市で給水車を設置しました。",
    content: "宇城市で給水車を設置しました。",
    accountHandle: "local_user",
    regions: ["宇城市"],
    status: "ACTIVE",
    acquisition_mode: "SEARCH_CROSS",
    hasImage: false,
    hasVideo: false,
    searchQueryId: "MUN-SCOPED-02",
    ...overrides,
  };
}

function makeSearchResponse(
  tweetId: string,
  text: string
): XSearchTweetResponse {
  return {
    data: [
      {
        id: tweetId,
        text,
        created_at: "2026-08-02T10:15:00.000Z",
        author_id: "42",
      },
    ],
    includes: {
      users: [{ id: "42", username: "local_user", name: "Local User" }],
    },
    meta: {
      newest_id: tweetId,
      result_count: 1,
    },
  };
}

class RecordingSearchClient extends XSearchClient {
  readonly calls: Array<{
    query: string;
    startTime?: string;
    paginationToken?: string;
  }> = [];
  private readonly handler: (params: {
    query: string;
    startTime?: string;
    paginationToken?: string;
  }) => Promise<XSearchTweetResponse>;

  constructor(
    handler: (params: {
      query: string;
      startTime?: string;
      paginationToken?: string;
    }) => Promise<XSearchTweetResponse>
  ) {
    super({
      bearerToken: "test-token",
      baseUrl: "https://api.x.com/2",
      maxResults: 100,
      requestDelayMs: 0,
      initialLookbackHours: 72,
      maxPagesPerSource: 1,
      fetchImpl: async () => new Response("{}"),
    });
    this.handler = handler;
  }

  async searchRecent(params: {
    query: string;
    startTime?: string;
    maxResults?: number;
    paginationToken?: string;
  }): Promise<XSearchTweetResponse> {
    this.calls.push({
      query: params.query,
      startTime: params.startTime,
      paginationToken: params.paginationToken,
    });
    return this.handler(params);
  }
}

function setupWorkspace(input?: {
  posts?: CrossSearchPost[];
  state?: CrossSearchFetchState;
}): void {
  fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  writeJsonAtomically(
    path.join(tmpDir, "data", "posts-cross-search.json"),
    input?.posts ?? []
  );
  writeJsonAtomically(
    path.join(tmpDir, "data", "cross-search-fetch-state.json"),
    input?.state ?? createEmptyCrossSearchFetchState()
  );
  process.env.X_API_BEARER_TOKEN = "test-token";
  process.env.X_API_FETCH_ENABLED = "true";
}

function readState(): CrossSearchFetchState {
  return JSON.parse(
    fs.readFileSync(path.join(tmpDir, "data", "cross-search-fetch-state.json"), "utf8")
  ) as CrossSearchFetchState;
}

function readPosts(): CrossSearchPost[] {
  return JSON.parse(
    fs.readFileSync(path.join(tmpDir, "data", "posts-cross-search.json"), "utf8")
  ) as CrossSearchPost[];
}

describe("phase22 cross-search incremental fetch", function () {
  before(function () {
    previousCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cross-search-inc-"));
    process.chdir(tmpDir);
  });

  after(function () {
    process.chdir(previousCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.X_API_BEARER_TOKEN;
    delete process.env.X_API_FETCH_ENABLED;
  });

  test("A: first fetch without batch state uses CROSS_SEARCH_SINCE_DATE", function () {
    setupWorkspace();
    const start = resolveBatchStartTime(
      "MUN-SCOPED-01",
      undefined,
      createEmptyCrossSearchFetchState()
    );
    assert.equal(start, CROSS_SEARCH_SINCE_DATE);
  });

  test("B: second fetch uses previous success minus 5 minutes", async function () {
    const previousSuccess = "2026-08-02T10:10:00.000Z";
    const queryId = scheduledQueryId();
    setupWorkspace({
      posts: [makeCrossSearchPost()],
      state: {
        ...createEmptyCrossSearchFetchState(),
        lastSuccessfulFetchAt: previousSuccess,
        storedPostCount: 1,
        batches: {
          [queryId]: batchStateWithSuccess(queryId, previousSuccess),
        },
      },
    });

    const client = new RecordingSearchClient(async function () {
      return makeSearchResponse("2002", "宇城市で断水情報を更新");
    });

    const result = await runCrossSearchFetch({
      client,
      now: SCHEDULED_NOW,
    });

    assert.equal(result.querySummaries.length, 1);
    assert.equal(
      result.querySummaries[0]?.startTime,
      buildNextStartTime(previousSuccess)
    );
    assert.notEqual(result.querySummaries[0]?.startTime, CROSS_SEARCH_SINCE_DATE);
    assert.equal(client.calls.length, 1);
  });

  test("C: HTTP 402 failure does not advance batch start time", async function () {
    const previousSuccess = "2026-08-02T10:10:00.000Z";
    const queryId = scheduledQueryId();
    const batchState = batchStateWithSuccess(queryId, previousSuccess);
    setupWorkspace({
      posts: [makeCrossSearchPost()],
      state: {
        ...createEmptyCrossSearchFetchState(),
        lastSuccessfulFetchAt: previousSuccess,
        storedPostCount: 1,
        batches: {
          [queryId]: batchState,
        },
      },
    });

    const client = new RecordingSearchClient(async function () {
      throw new XApiError("ACCESS_DENIED", "PaymentRequired", {
        status: 402,
        failureStage: "timeline_fetch",
        apiErrorTitle: "PaymentRequired",
      });
    });

    await runCrossSearchFetch({ client, now: SCHEDULED_NOW });

    const state = readState();
    assert.equal(state.batches?.[queryId]?.nextStartTime, batchState.nextStartTime);
    assert.equal(state.batches?.[queryId]?.consecutiveFailures, 1);
    assert.equal(readPosts().length, 1);
  });

  test("D: HTTP 500 failure does not advance batch start time", async function () {
    const previousSuccess = "2026-08-02T11:00:00.000Z";
    const queryId = scheduledQueryId();
    const batchState = batchStateWithSuccess(queryId, previousSuccess);
    setupWorkspace({
      posts: [makeCrossSearchPost()],
      state: {
        ...createEmptyCrossSearchFetchState(),
        lastSuccessfulFetchAt: previousSuccess,
        storedPostCount: 1,
        batches: {
          [queryId]: batchState,
        },
      },
    });

    const client = new RecordingSearchClient(async function () {
      throw new XApiError("X_API_SERVER_ERROR", "Server error", {
        status: 500,
        failureStage: "timeline_fetch",
      });
    });

    await runCrossSearchFetch({ client, now: SCHEDULED_NOW });

    const state = readState();
    assert.equal(state.batches?.[queryId]?.nextStartTime, batchState.nextStartTime);
    assert.equal(readPosts().length, 1);
  });

  test("E: duplicate posts are excluded on merge", function () {
    const existing = [makeCrossSearchPost({ postId: "POST-CROSS-1001" })];
    const incoming = [
      makeCrossSearchPost({ postId: "POST-CROSS-1001" }),
      makeCrossSearchPost({ postId: "POST-CROSS-1002" }),
    ];
    assert.equal(countDuplicateIncomingPosts(existing, incoming), 1);
  });

  test("F: batch states are isolated per query id", function () {
    const globalState = createEmptyCrossSearchFetchState();
    const batchOne = {
      ...createEmptyBatchState("MUN-SCOPED-01"),
      lastSuccessfulSearchAt: "2026-08-02T09:00:00.000Z",
      nextStartTime: buildNextStartTime("2026-08-02T09:00:00.000Z"),
    };
    const batchTwo = {
      ...createEmptyBatchState("MUN-SCOPED-02"),
      lastSuccessfulSearchAt: "2026-08-02T10:10:00.000Z",
      nextStartTime: buildNextStartTime("2026-08-02T10:10:00.000Z"),
    };
    const state: CrossSearchFetchState = {
      ...globalState,
      batches: {
        "MUN-SCOPED-01": batchOne,
        "MUN-SCOPED-02": batchTwo,
      },
    };

    assert.equal(
      resolveBatchStartTime("MUN-SCOPED-01", batchOne, state),
      batchOne.nextStartTime
    );
    assert.equal(
      resolveBatchStartTime("MUN-SCOPED-02", batchTwo, state),
      batchTwo.nextStartTime
    );
    assert.notEqual(
      resolveBatchStartTime("MUN-SCOPED-01", batchOne, state),
      resolveBatchStartTime("MUN-SCOPED-02", batchTwo, state)
    );
  });

  test("success updates only the executed batch state", async function () {
    const queryId = scheduledQueryId();
    const untouchedId = queryId === "MUN-SCOPED-01" ? "MUN-SCOPED-02" : "MUN-SCOPED-01";
    const untouchedSuccess = "2026-08-02T08:00:00.000Z";
    setupWorkspace({
      posts: [makeCrossSearchPost()],
      state: {
        ...createEmptyCrossSearchFetchState(),
        storedPostCount: 1,
        batches: {
          [untouchedId]: batchStateWithSuccess(untouchedId, untouchedSuccess),
        },
      },
    });

    const client = new RecordingSearchClient(async function () {
      return makeSearchResponse("3003", "宇城市で避難所を開設");
    });

    await runCrossSearchFetch({ client, now: SCHEDULED_NOW });
    const state = readState();
    assert.ok(state.batches?.[queryId]?.lastSuccessfulSearchAt);
    assert.equal(
      state.batches?.[untouchedId]?.nextStartTime,
      buildNextStartTime(untouchedSuccess)
    );
  });

  test("migration uses global lastSuccessfulFetchAt when batch state is missing", function () {
    const migrated = normalizeCrossSearchFetchState(
      {
        ...createEmptyCrossSearchFetchState(),
        lastSuccessfulFetchAt: "2026-08-02T10:10:00.000Z",
      },
      ["MUN-SCOPED-01", "MUN-SCOPED-02"]
    );
    assert.equal(
      migrated.batches?.["MUN-SCOPED-01"]?.nextStartTime,
      subtractOverlap("2026-08-02T10:10:00.000Z")
    );
    assert.equal(
      migrated.batches?.["MUN-SCOPED-02"]?.nextStartTime,
      subtractOverlap("2026-08-02T10:10:00.000Z")
    );
  });

  test("search strategy uses start_time overlap only", function () {
    assert.equal(resolveIncrementalSearchStrategy(), "start_time_overlap");
  });

  test("production posts file remains populated", function () {
    const postsPath = path.join(PROJECT_ROOT, "data", "posts-cross-search.json");
    assert.ok(fs.existsSync(postsPath));
    const posts = JSON.parse(fs.readFileSync(postsPath, "utf8")) as CrossSearchPost[];
    assert.ok(posts.length >= 3000);
  });

  test("applyBatchSuccess resets consecutiveFailures", function () {
    const next = applyBatchSuccess({
      batchId: "MUN-SCOPED-03",
      previous: {
        ...createEmptyBatchState("MUN-SCOPED-03"),
        consecutiveFailures: 2,
      },
      successfulAt: "2026-08-02T12:00:00.000Z",
      fetchedCount: 3,
      acceptedCount: 2,
      storedCount: 10,
      lastNewestPostId: "9001",
    });
    assert.equal(next.consecutiveFailures, 0);
    assert.equal(next.nextStartTime, buildNextStartTime("2026-08-02T12:00:00.000Z"));
  });

  test("applyBatchFailure increments consecutiveFailures", function () {
    const next = applyBatchFailure("MUN-SCOPED-03", createEmptyBatchState("MUN-SCOPED-03"));
    assert.equal(next.consecutiveFailures, 1);
  });
});
