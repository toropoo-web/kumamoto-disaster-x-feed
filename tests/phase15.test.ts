import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { buildFetchState, createEmptyFetchState } from "../src/lib/fetch-state";
import { mergePosts } from "../src/lib/fetch-pipeline";
import {
  isSeedPlaceholderPost,
  removeSeedPlaceholderPosts,
  SEED_PLACEHOLDER_TEXT,
  SEED_PLACEHOLDER_TWEET_ID,
} from "../src/lib/seed-posts";
import { createEmptyBreakdown } from "../src/types/post-processing";
import type { OfficialPost } from "../src/types/post";

function makePost(overrides: Partial<OfficialPost> = {}): OfficialPost {
  return {
    postId: "POST-SRC-KUM-001-2082022732196458525",
    sourceId: "SRC-KUM-001",
    sourceName: "防災くまもと",
    accountHandle: "Bousai_Kumamoto",
    postUrl: "https://x.com/Bousai_Kumamoto/status/2082022732196458525",
    postedAt: "2026-07-28T08:37:56.000Z",
    fetchedAt: "2026-07-29T06:32:26.789Z",
    title: "避難所開設",
    summary: "避難所を開設しました",
    regions: ["熊本県"],
    category: "EVACUATION_SHELTER",
    priority: "HIGH",
    status: "ACTIVE",
    hasImage: false,
    hasVideo: false,
    ...overrides,
  };
}

function makeSeedPost(sourceId: string, handle: string): OfficialPost {
  return makePost({
    postId: `POST-${sourceId}-${SEED_PLACEHOLDER_TWEET_ID}`,
    sourceId,
    accountHandle: handle,
    postUrl: `https://x.com/${handle}/status/${SEED_PLACEHOLDER_TWEET_ID}`,
    title: SEED_PLACEHOLDER_TEXT,
    summary: SEED_PLACEHOLDER_TEXT,
  });
}

describe("phase15 production data cleanup", { concurrency: false }, () => {
  test("identifies seed placeholder posts", () => {
    const seed = makeSeedPost("SRC-NAT-001", "Kantei_Saigai");
    const real = makePost();
    assert.equal(isSeedPlaceholderPost(seed), true);
    assert.equal(isSeedPlaceholderPost(real), false);
  });

  test("removeSeedPlaceholderPosts keeps real X posts", () => {
    const posts = [
      makeSeedPost("SRC-NAT-001", "Kantei_Saigai"),
      makePost(),
    ];
    const cleaned = removeSeedPlaceholderPosts(posts);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].postId, makePost().postId);
  });

  test("mergePosts excludes seed placeholders from existing data", () => {
    const existing = [
      makeSeedPost("SRC-NAT-001", "Kantei_Saigai"),
      makePost({ postId: "POST-EXISTING", postUrl: "https://x.com/a/status/1" }),
    ];
    const incoming = [
      makePost({
        postId: "POST-INCOMING",
        postUrl: "https://x.com/a/status/2",
      }),
    ];
    const merged = mergePosts(existing, incoming);
    assert.equal(merged.length, 2);
    assert.equal(
      merged.some((post) => isSeedPlaceholderPost(post)),
      false
    );
  });

  test("buildFetchState separates run metrics from stored count", () => {
    const previous = createEmptyFetchState();
    const totals = {
      ...createEmptyBreakdown(),
      apiPostCount: 128,
      accepted: 107,
    };
    const merged = Array.from({ length: 107 }, (_, index) =>
      makePost({
        postId: `POST-${index}`,
        postUrl: `https://x.com/a/status/${index}`,
      })
    );

    const state = buildFetchState({
      now: "2026-07-29T06:32:26.789Z",
      sourceCount: 8,
      successfulSourceCount: 8,
      failedSourceCount: 0,
      status: "SUCCESS",
      totals,
      mergedPosts: merged,
      previousState: previous,
    });

    assert.equal(state.fetchedPostCount, 128);
    assert.equal(state.acceptedPostCount, 107);
    assert.equal(state.storedPostCount, 107);
  });

  test("buildFetchState does not use existing stored count as acceptedPostCount", () => {
    const previous = {
      ...createEmptyFetchState(),
      storedPostCount: 8,
      acceptedPostCount: 8,
    };
    const totals = {
      ...createEmptyBreakdown(),
      apiPostCount: 10,
      accepted: 3,
    };
    const state = buildFetchState({
      now: "2026-07-29T07:00:00.000Z",
      sourceCount: 1,
      successfulSourceCount: 1,
      failedSourceCount: 0,
      status: "SUCCESS",
      totals,
      mergedPosts: [makePost()],
      previousState: previous,
    });

    assert.equal(state.acceptedPostCount, 3);
    assert.equal(state.storedPostCount, 1);
    assert.notEqual(state.acceptedPostCount, previous.acceptedPostCount);
  });

  test("buildFetchState records zero accepted with existing stored posts", () => {
    const state = buildFetchState({
      now: "2026-07-29T07:00:00.000Z",
      sourceCount: 8,
      successfulSourceCount: 8,
      failedSourceCount: 0,
      status: "SUCCESS",
      totals: createEmptyBreakdown(),
      mergedPosts: [makePost()],
      previousState: createEmptyFetchState(),
    });

    assert.equal(state.acceptedPostCount, 0);
    assert.equal(state.storedPostCount, 1);
  });
});
