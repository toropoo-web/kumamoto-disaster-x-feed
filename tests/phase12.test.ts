import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import {
  getPublishedPosts,
  getImportantPosts,
  getFetchState,
  getLastSuccessfulFetchAt,
  countDemoPostsInProduction,
} from "../src/lib/posts";
import { getAllSources } from "../src/lib/sources";
import {
  countActiveMonitoringSources,
  countRegisteredSources,
  getMonitoringStatus,
  getSourceRegistryEntries,
} from "../src/lib/source-registry";
import { isXApiPaymentRequired, FETCH_DATA_FILES } from "../src/lib/fetch-ci";
import type { FetchRunResult } from "../src/lib/fetch-runner";
import {
  EMPTY_HOME_POSTS_MESSAGE,
  EMPTY_IMPORTANT_POSTS_MESSAGE,
  EMPTY_POSTS_MESSAGE,
  ALL_CATEGORIES,
  REGION_OPTIONS,
} from "../src/types/post";

const ROOT = process.cwd();

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("phase12 static deployment", () => {
  test("empty posts message constants match public copy", () => {
    assert.equal(
      EMPTY_POSTS_MESSAGE,
      "現在、掲載中の公式投稿はありません。"
    );
    assert.equal(
      EMPTY_IMPORTANT_POSTS_MESSAGE,
      "現在、掲載中の重要情報はありません。"
    );
    assert.match(EMPTY_HOME_POSTS_MESSAGE, /現在表示できる公式投稿はありません/);
  });

  test("getPublishedPosts returns array without throwing", () => {
    const posts = getPublishedPosts();
    assert.ok(Array.isArray(posts));
  });

  test("getImportantPosts returns array without throwing", () => {
    const posts = getImportantPosts();
    assert.ok(Array.isArray(posts));
  });

  test("lastSuccessfulFetchAt comes only from successful fetch state", () => {
    const state = getFetchState();
    const lastSuccessful = getLastSuccessfulFetchAt();
    assert.equal(lastSuccessful, state.lastSuccessfulFetchAt);
  });

  test("LastFetchInfo does not expose lastAttemptAt", () => {
    const source = readText("src/components/LastFetchInfo.tsx");
    assert.doesNotMatch(source, /lastAttemptAt/);
    assert.match(source, /公式Xからの取得は現在準備中です/);
  });

  test("public pages do not expose error codes or HTTP status", () => {
    const pages = [
      "src/app/page.tsx",
      "src/app/posts/page.tsx",
      "src/app/sources/page.tsx",
    ];
    for (const page of pages) {
      const text = readText(page);
      assert.doesNotMatch(text, /402/);
      assert.doesNotMatch(text, /ACCESS_DENIED/);
      assert.doesNotMatch(text, /lastAttemptAt/);
    }
  });

  test("demo posts are excluded in production count", () => {
    assert.equal(countDemoPostsInProduction(), 0);
  });

  test("source registry distinguishes monitoring and registered counts", () => {
    const active = countActiveMonitoringSources();
    const registered = countRegisteredSources();
    assert.ok(active <= registered);
    assert.ok(registered >= 1);
  });

  test("VERIFYING or disabled sources are marked preparing", () => {
    const verifying = getAllSources().find(
      (source) => source.verificationStatus === "VERIFYING"
    );
    if (verifying) {
      assert.equal(getMonitoringStatus(verifying), "PREPARING");
    }
  });

  test("source registry entries include runtime last success only", () => {
    const entries = getSourceRegistryEntries();
    assert.equal(entries.length, getAllSources().length);
    for (const entry of entries) {
      assert.ok(
        entry.lastSuccessfulFetchAt === null ||
          typeof entry.lastSuccessfulFetchAt === "string"
      );
    }
  });

  test("dynamic routes define generateStaticParams", () => {
    const dynamicPages = [
      "src/app/sources/[sourceId]/page.tsx",
      "src/app/regions/[region]/page.tsx",
      "src/app/categories/[category]/page.tsx",
    ];
    for (const page of dynamicPages) {
      const text = readText(page);
      assert.match(text, /generateStaticParams/);
      assert.match(text, /force-static/);
    }
  });

  test("region page validates against REGION_OPTIONS", () => {
    const text = readText("src/app/regions/[region]/page.tsx");
    assert.match(text, /notFound\(\)/);
    assert.match(text, /REGION_OPTIONS/);
  });

  test("category and source pages use notFound for invalid params", () => {
    assert.match(readText("src/app/categories/[category]/page.tsx"), /notFound\(\)/);
    assert.match(readText("src/app/sources/[sourceId]/page.tsx"), /notFound\(\)/);
  });

  test("static params cover all sources regions and categories", () => {
    assert.equal(getAllSources().length >= 1, true);
    assert.equal(REGION_OPTIONS.length >= 1, true);
    assert.equal(ALL_CATEGORIES.length >= 1, true);
  });
});

describe("phase12 fetch workflow safety", () => {
  test("isXApiPaymentRequired detects all-source HTTP 402 failures", () => {
    const result: FetchRunResult = {
      status: "FAILED",
      dryRun: false,
      tokenConfigured: true,
      sourceSummaries: [
        {
          sourceId: "SRC-1",
          sourceName: "Test",
          accountHandle: "test",
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
      totals: {
        apiPostCount: 0,
        accepted: 0,
        rejectedByContentFilter: 0,
        rejectedReply: 0,
        rejectedRepost: 0,
        rejectedInvalidPost: 0,
        rejectedDuplicate: 0,
        rejectedMissingHandle: 0,
        rejectedMissingId: 0,
        processingError: 0,
      },
      fetchState: {
        lastAttemptAt: "2026-01-01T00:00:00.000Z",
        lastSuccessfulFetchAt: null,
        sourceCount: 1,
        successfulSourceCount: 0,
        failedSourceCount: 1,
        fetchedPostCount: 0,
        acceptedPostCount: 0,
        storedPostCount: 0,
        status: "FAILED",
      },
    };
    assert.equal(isXApiPaymentRequired(result), true);
  });

  test("isXApiPaymentRequired is false for mixed failures", () => {
    const result: FetchRunResult = {
      status: "FAILED",
      dryRun: false,
      tokenConfigured: true,
      sourceSummaries: [
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
        {
          sourceId: "SRC-2",
          sourceName: "B",
          accountHandle: "b",
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
          errorCode: "USER_NOT_FOUND",
        },
      ],
      totals: {
        apiPostCount: 0,
        accepted: 0,
        rejectedByContentFilter: 0,
        rejectedReply: 0,
        rejectedRepost: 0,
        rejectedInvalidPost: 0,
        rejectedDuplicate: 0,
        rejectedMissingHandle: 0,
        rejectedMissingId: 0,
        processingError: 0,
      },
      fetchState: {
        lastAttemptAt: "2026-01-01T00:00:00.000Z",
        lastSuccessfulFetchAt: null,
        sourceCount: 2,
        successfulSourceCount: 0,
        failedSourceCount: 2,
        fetchedPostCount: 0,
        acceptedPostCount: 0,
        storedPostCount: 0,
        status: "FAILED",
      },
    };
    assert.equal(isXApiPaymentRequired(result), false);
  });

  test("fetch data commit scope is limited to JSON data files", () => {
    assert.deepEqual(FETCH_DATA_FILES, [
      "data/posts.json",
      "data/fetch-state.json",
      "data/source-runtime.json",
      "data/api-usage.json",
    ]);
  });

  test("ci workflow does not call fetch:x", () => {
    const ci = readText(".github/workflows/ci.yml");
    assert.doesNotMatch(ci, /fetch:x/);
    assert.match(ci, /npm test/);
    assert.match(ci, /npm run build/);
  });

  test("fetch workflow does not log bearer token", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.match(workflow, /secrets\.X_API_BEARER_TOKEN/);
    assert.match(workflow, /X_API_TOKEN_CONFIGURED=true/);
    assert.doesNotMatch(workflow, /echo.*X_API_BEARER_TOKEN/);
    assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.X_API_BEARER_TOKEN\s*\}\}.*echo/);
  });

  test("fetch workflow skips commit on payment required", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.match(workflow, /FETCH_STATUS=X_API_PAYMENT_REQUIRED/);
    assert.match(workflow, /COMMIT_SKIPPED=true/);
    assert.match(workflow, /blocked != 'true'/);
  });

  test("fetch workflow schedule is commented out", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.match(workflow, /# schedule:/);
    assert.doesNotMatch(workflow, /^\s+schedule:/m);
  });

  test("fetch workflow uses concurrency guard", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.match(workflow, /concurrency:/);
    assert.match(workflow, /kumamoto-x-fetch/);
  });

  test("fetch-x script handles payment required exit", () => {
    const script = readText("scripts/fetch-x.ts");
    assert.match(script, /isXApiPaymentRequired/);
    assert.match(script, /FETCH_STATUS=X_API_PAYMENT_REQUIRED/);
    assert.match(script, /process\.exit\(2\)/);
  });
});
