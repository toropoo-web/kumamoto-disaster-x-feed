import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { runFetch } from "../src/lib/fetch-runner";
import { runCrossSearchFetch } from "../src/lib/cross-search-runner";
import { isXApiFetchEnabled } from "../src/lib/x-api-fetch-enabled";
import type { XPostFetcher } from "../src/lib/fetchers/types";
import type { OfficialPost } from "../src/types/post";

const ROOT = path.join(__dirname, "..");

class ThrowingFetcher implements XPostFetcher {
  async resolveUserId(): Promise<string> {
    throw new Error("API must not be called when fetch is disabled");
  }

  async fetchPosts(): Promise<{
    posts: OfficialPost[];
    apiPostCount: number;
    paginationPartial: boolean;
  }> {
    throw new Error("API must not be called when fetch is disabled");
  }
}

describe("X API fetch enabled gate", () => {
  test("isXApiFetchEnabled is false unless explicitly true", () => {
    const original = process.env.X_API_FETCH_ENABLED;
    try {
      delete process.env.X_API_FETCH_ENABLED;
      assert.equal(isXApiFetchEnabled(), false);
      process.env.X_API_FETCH_ENABLED = "false";
      assert.equal(isXApiFetchEnabled(), false);
      process.env.X_API_FETCH_ENABLED = "true";
      assert.equal(isXApiFetchEnabled(), true);
    } finally {
      if (original === undefined) {
        delete process.env.X_API_FETCH_ENABLED;
      } else {
        process.env.X_API_FETCH_ENABLED = original;
      }
    }
  });

  test("workflows are manual-only with X_API_FETCH_ENABLED default false", () => {
    const official = fs.readFileSync(
      path.join(ROOT, ".github/workflows/fetch-x-posts.yml"),
      "utf8"
    );
    const cross = fs.readFileSync(
      path.join(ROOT, ".github/workflows/fetch-x-cross-search.yml"),
      "utf8"
    );

    for (const workflow of [official, cross]) {
      assert.match(workflow, /workflow_dispatch:/);
      assert.doesNotMatch(workflow, /^\s*schedule:/m);
      assert.match(workflow, /X_API_FETCH_ENABLED/);
      assert.match(workflow, /x_api_fetch_enabled/);
    }
  });

  test("fetch scripts skip before runFetch when disabled", () => {
    const fetchX = fs.readFileSync(
      path.join(ROOT, "scripts/fetch-x.ts"),
      "utf8"
    );
    const fetchCross = fs.readFileSync(
      path.join(ROOT, "scripts/fetch-x-cross-search.ts"),
      "utf8"
    );

    for (const script of [fetchX, fetchCross]) {
      assert.match(script, /isXApiFetchEnabled\(\)/);
      assert.match(script, /FETCH_STATUS=SKIPPED/);
      assert.match(script, /writeXApiFetchDisabledStepSummary/);
      assert.match(script, /DATA_MODIFIED=false/);
    }
  });
});

describe("X API fetch disabled runtime safety", () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalEnabled: string | undefined;
  let originalToken: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-disabled-"));
    originalCwd = process.cwd();
    originalEnabled = process.env.X_API_FETCH_ENABLED;
    originalToken = process.env.X_API_BEARER_TOKEN;

    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    for (const file of [
      "posts.json",
      "posts-cross-search.json",
      "fetch-state.json",
      "cross-search-fetch-state.json",
      "source-runtime.json",
      "sources.json",
    ]) {
      fs.copyFileSync(
        path.join(ROOT, "data", file),
        path.join(tmpDir, "data", file)
      );
    }

    process.chdir(tmpDir);
    process.env.X_API_FETCH_ENABLED = "false";
    process.env.X_API_BEARER_TOKEN = "test-token-should-not-be-used";
  });

  after(() => {
    process.chdir(originalCwd);
    if (originalEnabled === undefined) {
      delete process.env.X_API_FETCH_ENABLED;
    } else {
      process.env.X_API_FETCH_ENABLED = originalEnabled;
    }
    if (originalToken === undefined) {
      delete process.env.X_API_BEARER_TOKEN;
    } else {
      process.env.X_API_BEARER_TOKEN = originalToken;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("runFetch makes zero API calls and preserves posts.json", async () => {
    const beforePosts = fs.readFileSync(
      path.join(tmpDir, "data/posts.json"),
      "utf8"
    );
    const beforeState = fs.readFileSync(
      path.join(tmpDir, "data/fetch-state.json"),
      "utf8"
    );

    const result = await runFetch({ fetcher: new ThrowingFetcher() });

    assert.equal(result.fetchEnabled, false);
    assert.equal(result.status, "NOT_RUN");
    assert.equal(result.sourceSummaries.length, 0);
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "data/posts.json"), "utf8"),
      beforePosts
    );
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "data/fetch-state.json"), "utf8"),
      beforeState
    );
  });

  test("runCrossSearchFetch makes zero API calls and preserves cross-search data", async () => {
    const beforePosts = fs.readFileSync(
      path.join(tmpDir, "data/posts-cross-search.json"),
      "utf8"
    );
    const beforeState = fs.readFileSync(
      path.join(tmpDir, "data/cross-search-fetch-state.json"),
      "utf8"
    );

    const client = {
      searchRecent: async () => {
        throw new Error("API must not be called when fetch is disabled");
      },
    };

    const result = await runCrossSearchFetch({ client: client as never });

    assert.equal(result.fetchEnabled, false);
    assert.equal(result.status, "NOT_RUN");
    assert.equal(result.querySummaries.length, 0);
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "data/posts-cross-search.json"), "utf8"),
      beforePosts
    );
    assert.equal(
      fs.readFileSync(
        path.join(tmpDir, "data/cross-search-fetch-state.json"),
        "utf8"
      ),
      beforeState
    );
  });
});
