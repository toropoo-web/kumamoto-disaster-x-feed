import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import { isSeedPlaceholderPost } from "../src/lib/seed-posts";
import {
  ALL_CATEGORIES,
  type FetchState,
  type OfficialPost,
  type PostPriority,
  type PostStatus,
} from "../src/types/post";
import type { ApiUsageStore } from "../src/types/api-usage";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const POST_PRIORITIES: PostPriority[] = ["EMERGENCY", "HIGH", "NORMAL"];
const POST_STATUSES: PostStatus[] = [
  "ACTIVE",
  "UPDATED",
  "RESOLVED",
  "UNKNOWN",
];
const FETCH_STATUSES: FetchState["status"][] = [
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "NOT_RUN",
];

function readJson<T>(relativePath: string): T {
  const filePath = path.join(PROJECT_ROOT, relativePath);
  assert.ok(fs.existsSync(filePath), `missing file: ${relativePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function assertOfficialPostShape(post: OfficialPost, index: number): void {
  const label = `posts[${index}]`;
  assert.equal(typeof post.postId, "string", `${label}.postId`);
  assert.match(post.postId, /^POST-/, `${label}.postId format`);
  assert.equal(typeof post.sourceId, "string", `${label}.sourceId`);
  assert.equal(typeof post.sourceName, "string", `${label}.sourceName`);
  assert.equal(typeof post.accountHandle, "string", `${label}.accountHandle`);
  assert.equal(typeof post.postUrl, "string", `${label}.postUrl`);
  assert.match(post.postUrl, /^https:\/\/x\.com\//, `${label}.postUrl format`);
  assert.equal(typeof post.postedAt, "string", `${label}.postedAt`);
  assert.equal(typeof post.fetchedAt, "string", `${label}.fetchedAt`);
  assert.equal(typeof post.title, "string", `${label}.title`);
  assert.equal(typeof post.summary, "string", `${label}.summary`);
  assert.ok(Array.isArray(post.regions), `${label}.regions`);
  assert.ok(
    ALL_CATEGORIES.includes(post.category),
    `${label}.category`
  );
  assert.ok(
    POST_PRIORITIES.includes(post.priority),
    `${label}.priority`
  );
  assert.ok(POST_STATUSES.includes(post.status), `${label}.status`);
  assert.equal(typeof post.hasImage, "boolean", `${label}.hasImage`);
  assert.equal(typeof post.hasVideo, "boolean", `${label}.hasVideo`);
}

function assertFetchStateShape(state: FetchState): void {
  assert.ok(
    state.lastAttemptAt === null || typeof state.lastAttemptAt === "string"
  );
  assert.ok(
    state.lastSuccessfulFetchAt === null ||
      typeof state.lastSuccessfulFetchAt === "string"
  );
  assert.equal(typeof state.sourceCount, "number");
  assert.equal(typeof state.successfulSourceCount, "number");
  assert.equal(typeof state.failedSourceCount, "number");
  assert.equal(typeof state.fetchedPostCount, "number");
  assert.equal(typeof state.acceptedPostCount, "number");
  assert.equal(typeof state.storedPostCount, "number");
  assert.ok(FETCH_STATUSES.includes(state.status));
  assert.ok(state.sourceCount >= 0);
  assert.ok(state.successfulSourceCount >= 0);
  assert.ok(state.failedSourceCount >= 0);
  assert.ok(state.fetchedPostCount >= 0);
  assert.ok(state.acceptedPostCount >= 0);
  assert.ok(state.storedPostCount >= 0);
  assert.ok(state.acceptedPostCount <= state.fetchedPostCount);
  if (state.lastHttpStatus !== undefined) {
    assert.ok(
      state.lastHttpStatus === null || typeof state.lastHttpStatus === "number"
    );
  }
  if (state.consecutiveFailures !== undefined) {
    assert.equal(typeof state.consecutiveFailures, "number");
  }
  if (state.successfulSources !== undefined) {
    assert.ok(Array.isArray(state.successfulSources));
  }
  if (state.failedSources !== undefined) {
    assert.ok(Array.isArray(state.failedSources));
  }
  if (state.failureReason !== undefined) {
    assert.ok(
      state.failureReason === null || typeof state.failureReason === "string"
    );
  }
}

describe("phase15 production data integrity", { concurrency: false }, () => {
  test("production posts.json is an array with valid schema", () => {
    const posts = readJson<OfficialPost[]>("data/posts.json");
    assert.ok(Array.isArray(posts), "posts.json must be an array");
    for (const [index, post] of posts.entries()) {
      assertOfficialPostShape(post, index);
    }
  });

  test("production posts.json has no seed placeholders", () => {
    const posts = readJson<OfficialPost[]>("data/posts.json");
    const seedCount = posts.filter(isSeedPlaceholderPost).length;
    assert.equal(seedCount, 0);
  });

  test("production posts.json has unique post URLs", () => {
    const posts = readJson<OfficialPost[]>("data/posts.json");
    const urls = posts.map((post) => post.postUrl);
    assert.equal(new Set(urls).size, urls.length);
  });

  test("fetch-state.json matches posts.json stored count", () => {
    const posts = readJson<OfficialPost[]>("data/posts.json");
    const state = readJson<FetchState>("data/fetch-state.json");
    assertFetchStateShape(state);
    assert.equal(state.storedPostCount, posts.length);
  });

  test("api-usage.json has valid structure", () => {
    const usage = readJson<ApiUsageStore>("data/api-usage.json");
    assert.ok(Array.isArray(usage.records), "api-usage.records must be an array");
    for (const [index, record] of usage.records.entries()) {
      const label = `records[${index}]`;
      assert.match(record.date, /^\d{4}-\d{2}-\d{2}$/, `${label}.date`);
      assert.equal(typeof record.userLookupRequests, "number", `${label}.userLookupRequests`);
      assert.equal(typeof record.timelineRequests, "number", `${label}.timelineRequests`);
      assert.equal(typeof record.postsRead, "number", `${label}.postsRead`);
      assert.equal(typeof record.acceptedPosts, "number", `${label}.acceptedPosts`);
      assert.ok(record.userLookupRequests >= 0, `${label}.userLookupRequests`);
      assert.ok(record.timelineRequests >= 0, `${label}.timelineRequests`);
      assert.ok(record.postsRead >= 0, `${label}.postsRead`);
      assert.ok(record.acceptedPosts >= 0, `${label}.acceptedPosts`);
    }
  });

  test("api-usage acceptedPosts is not below stored post count", () => {
    const posts = readJson<OfficialPost[]>("data/posts.json");
    const usage = readJson<ApiUsageStore>("data/api-usage.json");
    const totalAccepted = usage.records.reduce(
      (sum, record) => sum + record.acceptedPosts,
      0
    );
    assert.ok(
      totalAccepted >= posts.length,
      "cumulative acceptedPosts should cover stored posts"
    );
  });

  test("feed-status.json has valid automation schema", () => {
    const feedStatus = readJson<{
      last_success_at: string;
      last_fetch_count: string;
      last_commit: string;
      status: "SUCCESS" | "ERROR";
    }>("data/feed-status.json");
    assert.equal(typeof feedStatus.last_success_at, "string");
    assert.equal(typeof feedStatus.last_fetch_count, "string");
    assert.equal(typeof feedStatus.last_commit, "string");
    assert.ok(feedStatus.status === "SUCCESS" || feedStatus.status === "ERROR");
  });
});
