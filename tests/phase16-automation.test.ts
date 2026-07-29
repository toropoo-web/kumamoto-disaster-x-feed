import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import { execSync } from "node:child_process";
import { runFetch } from "../src/lib/fetch-runner";
import {
  assertFeedStatusShape,
  buildErrorFeedStatus,
  buildSuccessFeedStatus,
  readFeedStatus,
  type FeedStatus,
} from "../src/lib/feed-status";
import { FETCH_DATA_FILES } from "../src/lib/fetch-ci";
import { writeJsonAtomically } from "../src/lib/json-io";
import { mergePosts } from "../src/lib/fetch-pipeline";
import type { OfficialPost } from "../src/types/post";
import type { Source } from "../src/types/source";
import { createEmptyBreakdown } from "../src/types/post-processing";

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

class EmptyFetcher {
  async fetchLatestPosts() {
    return {
      posts: [],
      newestPostId: null,
      paginationPartial: false,
      breakdown: createEmptyBreakdown(),
    };
  }
}

class ThrowingFetcher {
  async fetchLatestPosts() {
    throw new Error("temporary API failure");
  }
}

describe("phase16 feed automation", () => {
  test("feed-status helpers produce valid shape", () => {
    const success = buildSuccessFeedStatus({
      now: "2026-07-29T12:00:00.000Z",
      acceptedCount: 12,
    });
    assertFeedStatusShape(success);
    assert.equal(success.status, "SUCCESS");
    assert.equal(success.last_fetch_count, "12");

    const error = buildErrorFeedStatus({
      previous: success,
      lastFetchCount: "0",
    });
    assertFeedStatusShape(error);
    assert.equal(error.status, "ERROR");
    assert.equal(error.last_success_at, success.last_success_at);
  });

  test("production feed-status.json has valid schema", () => {
    const status = JSON.parse(readText("data/feed-status.json")) as FeedStatus;
    assertFeedStatusShape(status);
  });

  test("fetch data commit scope includes feed-status.json", () => {
    assert.ok(FETCH_DATA_FILES.includes("data/feed-status.json"));
  });

  test("workflow commits feed-status and stamps commit sha", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.match(workflow, /data\/feed-status\.json/);
    assert.match(workflow, /stamp-feed-status-commit/);
    assert.match(workflow, /permissions:/);
    assert.match(workflow, /contents: write/);
  });

  test("schedule workflow runs every 30 minutes in UTC", () => {
    const workflow = readText(".github/workflows/fetch-x-posts.yml");
    assert.match(workflow, /\*\/30 \* \* \* \*/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /schedule:/);
  });
});

describe("phase16 fetch failure safety", () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-phase16-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "data/sources.json"),
      path.join(tmpDir, "data/sources.json")
    );
    fs.copyFileSync(
      path.join(ROOT, "data/source-runtime.json"),
      path.join(tmpDir, "data/source-runtime.json")
    );
    writeJsonAtomically(path.join(tmpDir, "data/posts.json"), [makePost()]);
    writeJsonAtomically(path.join(tmpDir, "data/fetch-state.json"), {
      lastAttemptAt: "2026-07-28T10:00:00.000Z",
      lastSuccessfulFetchAt: "2026-07-28T10:00:00.000Z",
      sourceCount: 8,
      successfulSourceCount: 8,
      failedSourceCount: 0,
      fetchedPostCount: 1,
      acceptedPostCount: 1,
      storedPostCount: 1,
      status: "SUCCESS",
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
    delete process.env.X_API_BEARER_TOKEN;
    process.chdir(originalCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows
    }
  });

  test("API failure does not overwrite posts.json", async () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const before = fs.readFileSync(postsPath, "utf-8");
    const result = await runFetch({ fetcher: new ThrowingFetcher() });
    assert.equal(result.status, "FAILED");
    assert.equal(fs.readFileSync(postsPath, "utf-8"), before);
    const feedStatus = readFeedStatus();
    assert.equal(feedStatus.status, "ERROR");
    assert.equal(feedStatus.last_success_at, "2026-07-28T10:00:00.000Z");
    assert.equal(feedStatus.last_commit, "abc123");
  });

  test("zero accepted posts keeps existing posts.json", async () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const before = fs.readFileSync(postsPath, "utf-8");
    const result = await runFetch({ fetcher: new EmptyFetcher() });
    assert.notEqual(result.status, "FAILED");
    assert.equal(fs.readFileSync(postsPath, "utf-8"), before);
    const feedStatus = readFeedStatus();
    assert.equal(feedStatus.status, "SUCCESS");
    assert.equal(feedStatus.last_fetch_count, "0");
  });

  test("mergePosts preserves existing data when incoming is empty", () => {
    const existing = [makePost()];
    const merged = mergePosts(existing, []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].postId, existing[0].postId);
  });

  test("invalid atomic write does not corrupt posts.json", () => {
    const postsPath = path.join(tmpDir, "data/posts.json");
    const before = fs.readFileSync(postsPath, "utf-8");
    assert.throws(() => {
      writeJsonAtomically(postsPath, BigInt(1));
    });
    assert.equal(fs.readFileSync(postsPath, "utf-8"), before);
  });
});

describe("phase16 schedule-equivalent validation", () => {
  test("pre-fetch, build, and production-data validation pass", () => {
    execSync("npm run test:pre-fetch", { cwd: ROOT, stdio: "pipe" });
    execSync("npm run build", { cwd: ROOT, stdio: "pipe" });
    execSync("npm run test:production-data", { cwd: ROOT, stdio: "pipe" });
  });

  test("dry-run fetch completes without modifying production data files", async () => {
    const files = [
      "data/posts.json",
      "data/fetch-state.json",
      "data/feed-status.json",
    ];
    const before = new Map(
      files.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf-8")])
    );

    execSync("npm run fetch:x:dry", { cwd: ROOT, stdio: "pipe" });

    for (const file of files) {
      assert.equal(
        fs.readFileSync(path.join(ROOT, file), "utf-8"),
        before.get(file)
      );
    }
  });
});
