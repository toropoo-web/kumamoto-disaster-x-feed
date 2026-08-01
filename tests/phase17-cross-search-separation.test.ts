import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import { buildCrossSearchQueries, listOfficialAccountHandles } from "../src/lib/cross-search-queries";
import {
  CROSS_SEARCH_ACQUISITION_MODE,
  type CrossSearchPost,
} from "../src/types/cross-search-post";
import type { OfficialPost } from "../src/types/post";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const OFFICIAL_POSTS_FILE = path.join(PROJECT_ROOT, "data", "posts.json");
const CROSS_SEARCH_POSTS_FILE = path.join(
  PROJECT_ROOT,
  "data",
  "posts-cross-search.json"
);

function readJson<T>(filePath: string): T {
  assert.ok(fs.existsSync(filePath), `missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function assertCrossSearchPostShape(post: CrossSearchPost, index: number): void {
  const label = `posts-cross-search[${index}]`;
  assert.equal(typeof post.postId, "string", `${label}.postId`);
  assert.match(post.postId, /^POST-CROSS-/, `${label}.postId format`);
  assert.equal(typeof post.postUrl, "string", `${label}.postUrl`);
  assert.match(post.postUrl, /^https:\/\/x\.com\//, `${label}.postUrl format`);
  assert.equal(typeof post.postedAt, "string", `${label}.postedAt`);
  assert.equal(typeof post.fetchedAt, "string", `${label}.fetchedAt`);
  assert.equal(typeof post.title, "string", `${label}.title`);
  assert.equal(typeof post.summary, "string", `${label}.summary`);
  assert.equal(typeof post.content, "string", `${label}.content`);
  assert.equal(typeof post.accountHandle, "string", `${label}.accountHandle`);
  assert.ok(Array.isArray(post.regions), `${label}.regions`);
  assert.equal(post.status, "ACTIVE", `${label}.status`);
  assert.equal(
    post.acquisition_mode,
    CROSS_SEARCH_ACQUISITION_MODE,
    `${label}.acquisition_mode`
  );
  assert.equal(
    (post as { sourceId?: string }).sourceId,
    undefined,
    `${label}.sourceId must be absent`
  );
}

describe("phase17 cross-search feed separation", function () {
  test("posts-cross-search.json exists", function () {
    assert.ok(fs.existsSync(CROSS_SEARCH_POSTS_FILE));
  });

  test("cross-search queries stay within API length limit", function () {
    const queries = buildCrossSearchQueries();
    assert.ok(queries.length > 0);
    queries.forEach(function (query) {
      assert.ok(query.query.length <= 512, `query too long: ${query.id}`);
      assert.match(query.query, /-is:retweet/);
      if (query.queryType !== "OPEN") {
        assert.match(query.query, /熊本地震|熊本/);
      }
    });
  });

  test("official posts.json remains sourceId-based official feed", function () {
    const posts = readJson<OfficialPost[]>(OFFICIAL_POSTS_FILE);
    assert.ok(posts.length > 0);
    posts.slice(0, 20).forEach(function (post, index) {
      assert.match(
        post.postId,
        /^POST-SRC-/,
        `official posts[${index}].postId must remain official format`
      );
      assert.equal(typeof post.sourceId, "string");
    });
  });

  test("cross-search posts do not use sourceId registry", function () {
    const posts = readJson<CrossSearchPost[]>(CROSS_SEARCH_POSTS_FILE);
    posts.forEach(assertCrossSearchPostShape);
    posts.forEach(function (post, index) {
      assert.doesNotMatch(
        post.postId,
        /^POST-SRC-/,
        `cross-search posts[${index}] must not use official postId format`
      );
    });
  });

  test("cross-search queries include support batches", function () {
    const queries = buildCrossSearchQueries();
    const supportQueries = queries.filter(function (query) {
      return query.queryType === "SUPPORT";
    });
    assert.ok(supportQueries.length > 0);
    supportQueries.forEach(function (query) {
      assert.match(query.query, /熊本/);
    });
    const supportQueryText = supportQueries.map(function (query) {
      return query.query;
    }).join(" ");
    assert.match(supportQueryText, /給水|水|支援物資|炊き出し/);
  });

  test("cross-search includes unregistered account posts when populated", function () {
    const posts = readJson<CrossSearchPost[]>(CROSS_SEARCH_POSTS_FILE);
    if (posts.length === 0) {
      return;
    }
    const registered = new Set(listOfficialAccountHandles());
    const unregisteredCount = posts.filter(function (post) {
      return !registered.has(post.accountHandle.replace(/^@/, "").toLowerCase());
    }).length;
    assert.ok(
      unregisteredCount > 0,
      "expected at least one post from an unregistered account once cross-search feed is populated"
    );
  });
});
