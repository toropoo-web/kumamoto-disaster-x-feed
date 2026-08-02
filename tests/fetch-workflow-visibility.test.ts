import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { test, describe, before, after } from "node:test";
import { runFetch } from "../src/lib/fetch-runner";
import {
  resolveFailureReason,
} from "../src/lib/fetch-monitoring";
import { isXApiPaymentRequired } from "../src/lib/fetch-ci";
import { writeJsonAtomically } from "../src/lib/json-io";
import { mergePosts } from "../src/lib/fetch-pipeline";
import { XApiError } from "../src/types/x-api";
import type { OfficialPost } from "../src/types/post";
import type { Source } from "../src/types/source";
import type { SourceRuntimeState } from "../src/types/source-runtime";
import { createEmptyBreakdown } from "../src/types/post-processing";
import type { FetchLatestPostsResult, RawXPost } from "../src/lib/fetchers/types";

const ROOT = process.cwd();

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function makePost(overrides: Partial<OfficialPost> = {}): OfficialPost {
  return {
    postId: "POST-SRC-KUM-001-1",
    sourceId: "SRC-KUM-001",
    sourceName: "防災くまもと",
    accountHandle: "Bousai_Kumamoto",
    postUrl: "https://x.com/Bousai_Kumamoto/status/1",
    postedAt: "2026-07-29T10:00:00.000Z",
    fetchedAt: "2026-07-29T11:00:00.000Z",
    title: "熊本地震に関する避難情報",
    summary: "熊本県宇城市で避難所を開設しました。",
    regions: ["熊本県"],
    category: "EVACUATION_SHELTER",
    priority: "HIGH",
    status: "ACTIVE",
    hasImage: false,
    hasVideo: false,
    ...overrides,
  };
}

function makeRawPost(overrides: Partial<RawXPost> = {}): RawXPost {
  return {
    id: "2000000000000000999",
    text: "熊本県の避難所情報をお知らせします。",
    authorId: "12345",
    createdAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

function makeSuccessResult(raw = makeRawPost()): FetchLatestPostsResult {
  return {
    posts: [raw],
    newestPostId: raw.id,
    apiPostCount: 1,
    paginationPartial: false,
    breakdown: {
      ...createEmptyBreakdown(),
      apiPostCount: 1,
      accepted: 1,
    },
  };
}

class PaymentRequiredFetcher {
  async resolveUserId(): Promise<string> {
    throw new XApiError("ACCESS_DENIED", "Payment required", {
      status: 402,
      failureStage: "user_lookup",
      apiErrorTitle: "PaymentRequired",
    });
  }

  async fetchLatestPosts(): Promise<FetchLatestPostsResult> {
    throw new XApiError("ACCESS_DENIED", "Payment required", {
      status: 402,
      failureStage: "user_lookup",
      apiErrorTitle: "PaymentRequired",
    });
  }
}

class InvalidResponseFetcher {
  async resolveUserId(): Promise<string> {
    throw new XApiError("INVALID_RESPONSE", "Unexpected response", {
      status: 500,
      failureStage: "user_lookup",
    });
  }

  async fetchLatestPosts(): Promise<FetchLatestPostsResult> {
    throw new XApiError("INVALID_RESPONSE", "Unexpected response", {
      status: 500,
      failureStage: "timeline_fetch",
    });
  }
}

class PartialSuccessFetcher {
  async resolveUserId(): Promise<string> {
    return "12345";
  }

  async fetchLatestPosts(
    source: Source,
    _runtime?: SourceRuntimeState
  ): Promise<FetchLatestPostsResult> {
    if (source.sourceId === "SRC-NAT-001") {
      return makeSuccessResult(
        makeRawPost({
          id: "2000000000000001001",
          text: "熊本県の避難所情報をお知らせします。",
        })
      );
    }
    throw new XApiError("ACCESS_DENIED", "Payment required", {
      status: 402,
      failureStage: "user_lookup",
    });
  }
}

class SuccessFetcher {
  async resolveUserId(): Promise<string> {
    return "12345";
  }

  async fetchLatestPosts(
    source: Source
  ): Promise<FetchLatestPostsResult> {
    const suffix = source.sourceId.replace(/\D/g, "").padStart(4, "0").slice(-4);
    return makeSuccessResult(
      makeRawPost({
        id: `2000000000${suffix}${String(Date.now()).slice(-5)}`,
        text: "熊本県の避難所情報をお知らせします。",
      })
    );
  }
}

describe("fetch workflow visibility", { concurrency: false }, () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalToken: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-visibility-"));
    originalCwd = process.cwd();
    originalToken = process.env.X_API_BEARER_TOKEN;
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "data/sources.json"),
      path.join(tmpDir, "data/sources.json")
    );
    writeJsonAtomically(path.join(tmpDir, "data/posts.json"), [makePost()]);
    writeJsonAtomically(path.join(tmpDir, "data/fetch-state.json"), {
      lastAttemptAt: "2026-07-28T10:00:00.000Z",
      lastSuccessfulFetchAt: "2026-07-28T10:00:00.000Z",
      sourceCount: 11,
      successfulSourceCount: 11,
      failedSourceCount: 0,
      fetchedPostCount: 1,
      acceptedPostCount: 1,
      storedPostCount: 1,
      status: "SUCCESS",
      consecutiveFailures: 0,
    });
    writeJsonAtomically(path.join(tmpDir, "data/source-runtime.json"), {
      sources: {},
    });
    writeJsonAtomically(path.join(tmpDir, "data/api-usage.json"), {
      records: [],
    });
    writeJsonAtomically(path.join(tmpDir, "data/feed-status.json"), {
      last_success_at: "2026-07-28T10:00:00.000Z",
      last_fetch_count: "1",
      last_commit: "abc123",
      status: "SUCCESS",
    });
    process.chdir(tmpDir);
    process.env.X_API_BEARER_TOKEN = "test-token";
  });

  after(() => {
    process.chdir(originalCwd);
    if (originalToken === undefined) {
      delete process.env.X_API_BEARER_TOKEN;
    } else {
      process.env.X_API_BEARER_TOKEN = originalToken;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows
    }
  });

  test("successful API response updates posts.json and monitoring state", async () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const statePath = path.join(tmpDir, "data/fetch-state.json");
    const beforeCount = JSON.parse(fs.readFileSync(postsPath, "utf-8")).length;

    const result = await runFetch({ fetcher: new SuccessFetcher() });
    assert.equal(result.status, "SUCCESS");
    assert.ok(result.totals.accepted > 0);

    const posts = JSON.parse(fs.readFileSync(postsPath, "utf-8")) as OfficialPost[];
    assert.ok(posts.length > beforeCount);

    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(state.status, "SUCCESS");
    assert.equal(state.consecutiveFailures, 0);
    assert.equal(state.failureReason, null);
    assert.ok(state.successfulSources.length > 0);
  });

  test("HTTP 402 records failure state without modifying posts.json", async () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const statePath = path.join(tmpDir, "data/fetch-state.json");
    const before = fs.readFileSync(postsPath, "utf-8");
    const stateBefore = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const beforeFailures = stateBefore.consecutiveFailures ?? 0;
    const beforeLastSuccess = stateBefore.lastSuccessfulFetchAt;

    const result = await runFetch({ fetcher: new PaymentRequiredFetcher() });
    assert.equal(result.status, "FAILED");
    assert.equal(isXApiPaymentRequired(result), true);
    assert.equal(fs.readFileSync(postsPath, "utf-8"), before);

    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(state.status, "FAILED");
    assert.equal(state.lastHttpStatus, 402);
    assert.equal(state.failureReason, "X_API_PAYMENT_REQUIRED");
    assert.equal(state.consecutiveFailures, beforeFailures + 1);
    assert.equal(state.lastSuccessfulFetchAt, beforeLastSuccess);
    assert.ok(state.failedSources.length > 0);
  });

  test("INVALID_RESPONSE records failure state without modifying posts.json", async () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const statePath = path.join(tmpDir, "data/fetch-state.json");
    const before = fs.readFileSync(postsPath, "utf-8");
    const beforeFailures =
      JSON.parse(fs.readFileSync(statePath, "utf-8")).consecutiveFailures ?? 0;

    const result = await runFetch({ fetcher: new InvalidResponseFetcher() });
    assert.equal(result.status, "FAILED");
    assert.equal(fs.readFileSync(postsPath, "utf-8"), before);

    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(state.status, "FAILED");
    assert.equal(state.failureReason, "INVALID_RESPONSE");
    assert.equal(state.consecutiveFailures, beforeFailures + 1);
  });

  test("partial source success persists accepted posts and marks PARTIAL", async () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const beforeCount = JSON.parse(fs.readFileSync(postsPath, "utf-8")).length;

    const result = await runFetch({ fetcher: new PartialSuccessFetcher() });
    assert.equal(result.status, "PARTIAL");
    assert.ok(result.fetchState.successfulSourceCount >= 1);
    assert.ok(result.fetchState.failedSourceCount >= 1);

    const posts = JSON.parse(fs.readFileSync(postsPath, "utf-8")) as OfficialPost[];
    assert.ok(posts.length > beforeCount);
    assert.equal(result.fetchState.failureReason, "PARTIAL_SOURCE_FAILURE");
    assert.equal(result.fetchState.consecutiveFailures, 0);
  });

  test("consecutive failures increment on repeated all-source failures", async () => {
    const statePath = path.join(tmpDir, "data/fetch-state.json");
    const before = JSON.parse(fs.readFileSync(statePath, "utf-8")).consecutiveFailures ?? 0;

    await runFetch({ fetcher: new PaymentRequiredFetcher() });
    const afterFirst = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(afterFirst.consecutiveFailures, before + 1);

    await runFetch({ fetcher: new PaymentRequiredFetcher() });
    const afterSecond = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(afterSecond.consecutiveFailures, before + 2);
  });
});

describe("fetch workflow visibility workflow contract", () => {
  test("workflow fails on fetch failure instead of silent success", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.doesNotMatch(workflow, /blocked=true/);
    assert.doesNotMatch(workflow, /Report blocked fetch/);
    assert.doesNotMatch(workflow, /FETCH_EXIT=-eq 2/);
    assert.match(workflow, /set -e/);
    assert.match(workflow, /npm run fetch:x/);
  });

  test("fetch-x exits with code 1 on payment required", () => {
    const script = readText("scripts/fetch-x.ts");
    assert.match(script, /FETCH_STATUS=X_API_PAYMENT_REQUIRED/);
    assert.match(script, /process\.exit\(1\)/);
    assert.doesNotMatch(script, /process\.exit\(2\)/);
    assert.match(script, /FETCH_PARTIAL_SUCCESS=true/);
    assert.match(script, /writeFetchStepSummary/);
  });

  test("cron schedules are staggered between official fetch and cross-search", () => {
    const official = readText(".github/workflows/fetch-x-posts.yml");
    const cross = readText(".github/workflows/fetch-x-cross-search.yml");
    assert.match(official, /\*\/30 \* \* \* \*/);
    assert.match(cross, /10,40 \* \* \* \*/);
    assert.doesNotMatch(official, /10,40/);
  });
});

describe("fetch monitoring helpers", () => {
  test("resolveFailureReason classifies payment required", () => {
    const reason = resolveFailureReason(
      [
        {
          sourceId: "SRC-1",
          sourceName: "A",
          accountHandle: "a",
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
          lastSeenPostId: null,
          wouldUpdateLastSeenId: null,
          status: "FAILED",
          paginationPartial: false,
          countReconciled: true,
          errorCode: "ACCESS_DENIED",
          httpStatus: 402,
        },
      ],
      "FAILED"
    );
    assert.equal(reason, "X_API_PAYMENT_REQUIRED");
  });
});
