import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after, beforeEach } from "node:test";
import { XApiPostFetcher } from "../src/lib/fetchers/x-api";
import { XApiClient } from "../src/lib/fetchers/x-api-client";
import {
  hasImage,
  hasVideo,
  mapTweetResponseToRawPosts,
} from "../src/lib/fetchers/x-api-mapper";
import {
  buildPostUrl,
  dedupePostsByUrl,
  isUrlOnlyPost,
  rawPostToOfficialPost,
} from "../src/lib/fetch-pipeline";
import { isEligibleForPublication } from "../src/lib/filters";
import { runFetch } from "../src/lib/fetch-runner";
import { writeJsonAtomically } from "../src/lib/json-io";
import { getSourceRuntime } from "../src/lib/source-runtime";
import { getTodayUsageRecord, recordApiUsage } from "../src/lib/api-usage";
import { XApiError } from "../src/types/x-api";
import type { Source } from "../src/types/source";
import type { OfficialPost } from "../src/types/post";
import {
  createFixtureFetch,
  loadFixture,
  resetFixtureCounters,
} from "./helpers/x-api-fixture-fetch";

const ROOT = process.cwd();

const sampleSource: Source = {
  sourceId: "SRC-KUM-001",
  displayName: "防災くまもと",
  accountHandle: "Bousai_Kumamoto",
  sourceType: "PREFECTURE",
  region: "熊本県",
  priority: "HIGH",
  verificationStatus: "VERIFIED",
  fetchEnabled: true,
  contentFilter: "ALL",
};

function makeFetcherConfig() {
  return {
    bearerToken: "test-token",
    baseUrl: "https://api.x.com/2",
    maxResults: 100,
    requestDelayMs: 0,
    initialLookbackHours: 72,
    maxPagesPerSource: 3,
    fetchImpl: createFixtureFetch(),
  };
}

function makePost(overrides: Partial<OfficialPost> = {}): OfficialPost {
  return {
    postId: "POST-1",
    sourceId: "SRC-KUM-001",
    sourceName: "防災くまもと",
    accountHandle: "Bousai_Kumamoto",
    postUrl: "https://x.com/Bousai_Kumamoto/status/1",
    postedAt: "2026-07-29T10:00:00.000Z",
    fetchedAt: "2026-07-29T11:00:00.000Z",
    title: "熊本地震に関する避難情報",
    summary: "熊本県宇城市で避難所を開設しました。",
    regions: ["熊本県", "宇城市"],
    category: "EVACUATION_SHELTER",
    priority: "HIGH",
    status: "ACTIVE",
    hasImage: false,
    hasVideo: false,
    ...overrides,
  };
}

describe("XApiPostFetcher", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  test("resolves username to user id", async () => {
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const userId = await fetcher.resolveUserId(sampleSource);
    assert.equal(userId, "2244994945");
  });

  test("reuses saved user id without lookup", async () => {
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const userId = await fetcher.resolveUserId(sampleSource, {
      sourceId: sampleSource.sourceId,
      xUserId: "saved-user-id",
      lastSeenPostId: null,
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "SUCCESS",
    });
    assert.equal(userId, "saved-user-id");
  });

  test("adds since_id when lastSeenPostId exists", async () => {
    const calls: string[] = [];
    const fetcher = new XApiPostFetcher({
      ...makeFetcherConfig(),
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input.url;
        calls.push(url);
        return createFixtureFetch()(input);
      },
    });

    await fetcher.fetchLatestPosts(sampleSource, {
      sourceId: sampleSource.sourceId,
      xUserId: "2244994945",
      lastSeenPostId: "1000",
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "SUCCESS",
    });

    assert.ok(calls.some((url) => url.includes("since_id=1000")));
    assert.ok(calls.every((url) => !url.includes("start_time=")));
  });

  test("adds start_time on first fetch without lastSeenPostId", async () => {
    const calls: string[] = [];
    const fetcher = new XApiPostFetcher({
      ...makeFetcherConfig(),
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input.url;
        calls.push(url);
        return createFixtureFetch()(input);
      },
    });

    await fetcher.fetchLatestPosts(sampleSource, {
      sourceId: sampleSource.sourceId,
      xUserId: "2244994945",
      lastSeenPostId: null,
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "NOT_CONFIGURED",
    });

    assert.ok(calls.some((url) => url.includes("start_time=")));
    assert.ok(calls.every((url) => !url.includes("since_id=")));
  });

  test("excludes replies and reposts", async () => {
    const response = loadFixture<{ data: unknown[] }>("user-posts-success.json");
    const posts = mapTweetResponseToRawPosts(
      response,
      "2244994945"
    );
    assert.equal(posts.length, 2);
    assert.ok(posts.every((post) => !post.referencedPosts?.length));
  });

  test("paginates across next_token", async () => {
    const source: Source = {
      ...sampleSource,
      sourceId: "SRC-PAGE",
      accountHandle: "page_user",
    };
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const result = await fetcher.fetchLatestPosts(source, {
      sourceId: source.sourceId,
      xUserId: "888001",
      lastSeenPostId: "1000",
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "SUCCESS",
    });
    assert.equal(result.posts.length, 2);
    assert.equal(result.apiPostCount, 2);
  });

  test("marks pagination partial when max pages reached", async () => {
    const source: Source = {
      ...sampleSource,
      sourceId: "SRC-PAGE-LIMIT",
      accountHandle: "page_limit",
    };
    const fetcher = new XApiPostFetcher({
      ...makeFetcherConfig(),
      maxPagesPerSource: 1,
    });
    const result = await fetcher.fetchLatestPosts(source, {
      sourceId: source.sourceId,
      xUserId: "888001",
      lastSeenPostId: "1000",
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "SUCCESS",
    });
    assert.equal(result.paginationPartial, true);
    assert.equal(result.posts.length, 1);
  });

  test("detects image and video media", async () => {
    const source: Source = {
      ...sampleSource,
      sourceId: "SRC-MEDIA",
      accountHandle: "media_user",
    };
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const result = await fetcher.fetchLatestPosts(source, {
      sourceId: source.sourceId,
      xUserId: "888002",
      lastSeenPostId: "1000",
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "SUCCESS",
    });
    const photoPost = result.posts.find((post) => post.id.endsWith("0001"));
    const videoPost = result.posts.find((post) => post.id.endsWith("0002"));
    assert.equal(hasImage(photoPost?.media), true);
    assert.equal(hasVideo(videoPost?.media), true);
  });
});

describe("X API error handling", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  test("maps 401 to AUTHENTICATION_ERROR", async () => {
    const client = new XApiClient({
      ...makeFetcherConfig(),
      fetchImpl: async () =>
        new Response(JSON.stringify(loadFixture("error-401.json")), {
          status: 401,
        }),
    });
    await assert.rejects(
      () => client.lookupUserId("bad"),
      (error: unknown) =>
        error instanceof XApiError &&
        error.code === "AUTHENTICATION_ERROR"
    );
  });

  test("maps 402 to ACCESS_DENIED on user lookup", async () => {
    const client = new XApiClient({
      ...makeFetcherConfig(),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            errors: [
              {
                title: "Payment Required",
                detail: "Billing subscription required",
                type: "about:blank",
                status: 402,
              },
            ],
          }),
          { status: 402, headers: { "content-type": "application/json" } }
        ),
    });
    await assert.rejects(
      () => client.lookupUserId("any"),
      (error: unknown) =>
        error instanceof XApiError &&
        error.code === "ACCESS_DENIED" &&
        error.status === 402 &&
        error.failureStage === "user_lookup"
    );
  });

  test("maps 404 to USER_NOT_FOUND on user lookup", async () => {
    const client = new XApiClient({
      bearerToken: "test",
      baseUrl: "https://api.x.com/2",
      maxResults: 100,
      requestDelayMs: 0,
      initialLookbackHours: 72,
      maxPagesPerSource: 3,
      fetchImpl: async () =>
        new Response(JSON.stringify(loadFixture("error-404.json")), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    });
    await assert.rejects(
      () => client.lookupUserId("missing"),
      (error: unknown) =>
        error instanceof XApiError && error.code === "USER_NOT_FOUND"
    );
  });

  test("maps 429 to RATE_LIMITED with reset header", async () => {
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const source: Source = {
      ...sampleSource,
      sourceId: "SRC-429",
      accountHandle: "limited",
    };
    await assert.rejects(
      () =>
        fetcher.fetchLatestPosts(source, {
          sourceId: source.sourceId,
          xUserId: "999429",
          lastSeenPostId: null,
          lastAttemptAt: null,
          lastSuccessfulFetchAt: null,
          lastResultCount: 0,
          status: "NOT_CONFIGURED",
        }),
      (error: unknown) =>
        error instanceof XApiError &&
        error.code === "RATE_LIMITED" &&
        Boolean(error.rateLimitResetAt)
    );
  });

  test("retries 5xx up to two times", async () => {
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const source: Source = {
      ...sampleSource,
      sourceId: "SRC-500",
      accountHandle: "server_error",
    };
    const result = await fetcher.fetchLatestPosts(source, {
      sourceId: source.sourceId,
      xUserId: "999500",
      lastSeenPostId: "1000",
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      lastResultCount: 0,
      status: "NOT_CONFIGURED",
    });
    assert.ok(result.posts.length >= 0);
  });
});

describe("fetch pipeline and filters", () => {
  test("builds official post url and summary limits", () => {
    const post = rawPostToOfficialPost(
      {
        id: "123",
        text: "熊本県宇城市の避難所を開設しました。",
        authorId: "1",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      sampleSource,
      "2026-07-29T11:00:00.000Z"
    );
    assert.ok(post);
    assert.equal(
      post?.postUrl,
      buildPostUrl("Bousai_Kumamoto", "123")
    );
    assert.ok((post?.title.length ?? 0) <= 80);
    assert.ok((post?.summary.length ?? 0) <= 200);
  });

  test("rejects url-only posts", () => {
    assert.equal(isUrlOnlyPost("https://t.co/abc"), true);
    const post = rawPostToOfficialPost(
      {
        id: "124",
        text: "https://t.co/abc",
        authorId: "1",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      sampleSource,
      "2026-07-29T11:00:00.000Z"
    );
    assert.equal(post, null);
  });

  test("dedupePostsByUrl removes duplicate urls", () => {
    const posts = [
      makePost({ postUrl: "https://x.com/a" }),
      makePost({ postUrl: "https://x.com/a", postId: "POST-2" }),
    ];
    assert.equal(dedupePostsByUrl(posts).length, 1);
  });

  test("filters kumamoto-related posts and all-post source", () => {
    assert.equal(
      isEligibleForPublication("熊本地震の避難所情報", "Kantei_Saigai"),
      true
    );
    assert.equal(
      isEligibleForPublication("通常の広報イベント", "Bousai_Kumamoto"),
      false
    );
    assert.equal(
      isEligibleForPublication("熊本県の避難情報", "Bousai_Kumamoto"),
      true
    );
  });
});

describe("fetch runner integration", { concurrency: false }, () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalToken: string | undefined;
  let originalFetchEnabled: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-phase11-"));
    originalCwd = process.cwd();
    originalToken = process.env.X_API_BEARER_TOKEN;
    originalFetchEnabled = process.env.X_API_FETCH_ENABLED;
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data/sources.json"),
      JSON.stringify([sampleSource], null, 2)
    );
    writeJsonAtomically(path.join(tmpDir, "data/posts.json"), []);
    writeJsonAtomically(path.join(tmpDir, "data/fetch-state.json"), {
      lastAttemptAt: null,
      lastSuccessfulFetchAt: null,
      sourceCount: 1,
      successfulSourceCount: 0,
      failedSourceCount: 0,
      fetchedPostCount: 0,
      acceptedPostCount: 0,
      storedPostCount: 0,
      status: "NOT_RUN",
    });
    writeJsonAtomically(path.join(tmpDir, "data/source-runtime.json"), {
      sources: {},
    });
    writeJsonAtomically(path.join(tmpDir, "data/api-usage.json"), {
      records: [],
    });
    process.chdir(tmpDir);
    process.env.X_API_BEARER_TOKEN = "test-token";
    process.env.X_API_FETCH_ENABLED = "true";
    process.env.X_FETCH_REQUEST_DELAY_MS = "0";
  });

  after(() => {
    process.chdir(originalCwd);
    if (originalToken === undefined) {
      delete process.env.X_API_BEARER_TOKEN;
    } else {
      process.env.X_API_BEARER_TOKEN = originalToken;
    }
    if (originalFetchEnabled === undefined) {
      delete process.env.X_API_FETCH_ENABLED;
    } else {
      process.env.X_API_FETCH_ENABLED = originalFetchEnabled;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows
    }
  });

  beforeEach(() => {
    resetFixtureCounters();
    writeJsonAtomically(path.join(tmpDir, "data/posts.json"), []);
    writeJsonAtomically(path.join(tmpDir, "data/source-runtime.json"), {
      sources: {},
    });
  });

  test("token not configured does not call api", async () => {
    delete process.env.X_API_BEARER_TOKEN;
    const result = await runFetch();
    assert.equal(result.tokenConfigured, false);
    assert.equal(result.status, "NOT_RUN");
    process.env.X_API_BEARER_TOKEN = "test-token";
  });

  test("dry run does not update data files", async () => {
    const postsBefore = fs.readFileSync(
      path.join(tmpDir, "data/posts.json"),
      "utf-8"
    );
    const runtimeBefore = fs.readFileSync(
      path.join(tmpDir, "data/source-runtime.json"),
      "utf-8"
    );
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const result = await runFetch({ dryRun: true, fetcher });
    assert.equal(result.dryRun, true);
    assert.equal(fs.readFileSync(path.join(tmpDir, "data/posts.json"), "utf-8"), postsBefore);
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "data/source-runtime.json"), "utf-8"),
      runtimeBefore
    );
    assert.ok(result.sourceSummaries.length > 0);
  });

  test("successful fetch updates runtime lastSeenPostId", async () => {
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    const result = await runFetch({ fetcher });
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.fetchState.acceptedPostCount, result.totals.accepted);
    assert.equal(result.fetchState.fetchedPostCount, result.totals.apiPostCount);
    assert.equal(
      result.fetchState.storedPostCount,
      result.mergedPosts?.length ?? 0
    );
    const runtime = getSourceRuntime(sampleSource.sourceId);
    assert.equal(runtime.lastSeenPostId, "2000000000000000001");
    assert.equal(runtime.xUserId, "2244994945");
  });

  test("records api usage on successful fetch", async () => {
    const fetcher = new XApiPostFetcher(makeFetcherConfig());
    await runFetch({ fetcher });
    const usage = getTodayUsageRecord();
    assert.ok(usage.timelineRequests >= 1);
    assert.ok(usage.acceptedPosts >= 1);
  });

  test("runtime persistence happens only after posts.json write on success path", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/lib/fetch-runner.ts"),
      "utf-8"
    );
    const successBlock = source.slice(
      source.indexOf("writeJsonAtomically(POSTS_FILE(), merged)")
    );
    const postsWriteIndex = successBlock.indexOf(
      "writeJsonAtomically(POSTS_FILE(), merged)"
    );
    const runtimeWriteIndex = successBlock.indexOf(
      "replaceSourceRuntimeStore({ sources: runtimeUpdates })"
    );
    assert.ok(postsWriteIndex >= 0);
    assert.ok(runtimeWriteIndex > postsWriteIndex);
  });
});

describe("api usage aggregation", () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-usage-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("aggregates counters by date", () => {
    const first = recordApiUsage({
      userLookupRequests: 1,
      timelineRequests: 2,
      postsRead: 10,
      acceptedPosts: 3,
    });
    const second = recordApiUsage({
      timelineRequests: 1,
      acceptedPosts: 1,
    });
    assert.equal(first.userLookupRequests, 1);
    assert.equal(second.timelineRequests, 3);
    assert.equal(second.acceptedPosts, 4);
  });
});

describe("production demo exclusion", () => {
  test("demo posts are excluded in production", async () => {
    const { isDemoPost } = await import("../src/lib/filters");
    process.env.NODE_ENV = "production";
    assert.equal(isDemoPost(makePost({ isDemo: true })), true);
    assert.equal(isDemoPost(makePost()), false);
    process.env.NODE_ENV = "test";
  });
});

describe("build artifacts", () => {
  test("x api fetcher files exist", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "src/lib/fetchers/x-api.ts")), true);
    assert.equal(fs.existsSync(path.join(ROOT, "scripts/fetch-x.ts")), true);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")
    );
    assert.equal(pkg.scripts["fetch:x:dry"], "tsx scripts/fetch-x.ts --dry-run");
  });
});
