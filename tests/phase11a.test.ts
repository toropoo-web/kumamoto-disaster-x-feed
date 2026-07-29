import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import { loadProjectEnv } from "../src/lib/load-env";
import {
  describeResponseShape,
  XApiClient,
} from "../src/lib/fetchers/x-api-client";
import {
  applyContentFilterBreakdown,
} from "../src/lib/fetch-pipeline";
import {
  processTweetResponse,
} from "../src/lib/fetchers/x-api-mapper";
import { runFetch } from "../src/lib/fetch-runner";
import { isCountReconciled } from "../src/types/post-processing";
import { XApiError } from "../src/types/x-api";
import { loadFixture } from "./helpers/x-api-fixture-fetch";

describe("phase11a stabilization", () => {
  test("loadProjectEnv does not override existing process.env", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-env-"));
    const original = process.env.PHASE11A_TEST_KEY;
    process.env.PHASE11A_TEST_KEY = "from-shell";
    fs.writeFileSync(
      path.join(tmpDir, ".env.local"),
      "PHASE11A_TEST_KEY=from-file\n",
      "utf-8"
    );
    const cwd = process.cwd();
    process.chdir(tmpDir);
    try {
      loadProjectEnv(tmpDir);
      assert.equal(process.env.PHASE11A_TEST_KEY, "from-shell");
    } finally {
      process.chdir(cwd);
      if (original === undefined) {
        delete process.env.PHASE11A_TEST_KEY;
      } else {
        process.env.PHASE11A_TEST_KEY = original;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("loadProjectEnv loads .env.local when unset", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-env2-"));
    const key = "PHASE11A_LOAD_TEST";
    const original = process.env[key];
    delete process.env[key];
    fs.writeFileSync(
      path.join(tmpDir, ".env.local"),
      `${key}=loaded\n`,
      "utf-8"
    );
    const cwd = process.cwd();
    process.chdir(tmpDir);
    try {
      loadProjectEnv(tmpDir);
      assert.equal(process.env[key], "loaded");
    } finally {
      process.chdir(cwd);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("timeline zero-result response is handled as empty", () => {
    const response = loadFixture<{ meta: { result_count: number } }>(
      "user-posts-empty.json"
    );
    const processed = processTweetResponse(response, "123");
    assert.equal(processed.breakdown.apiPostCount, 0);
    assert.equal(processed.posts.length, 0);
    assert.equal(isCountReconciled(processed.breakdown), true);
  });

  test("user lookup 200+errors maps to USER_LOOKUP_ERROR or USER_NOT_FOUND", async () => {
    const client = new XApiClient({
      bearerToken: "test",
      baseUrl: "https://api.x.com/2",
      maxResults: 100,
      requestDelayMs: 0,
      initialLookbackHours: 72,
      maxPagesPerSource: 3,
      fetchImpl: async () =>
        new Response(JSON.stringify(loadFixture("error-404.json")), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    await assert.rejects(
      () => client.lookupUserId("missing"),
      (error: unknown) =>
        error instanceof XApiError &&
        (error.code === "USER_NOT_FOUND" || error.code === "USER_LOOKUP_ERROR")
    );
  });

  test("reply and repost are counted in breakdown", () => {
    const response = loadFixture("user-posts-success.json");
    const processed = processTweetResponse(response, "1");
    const filtered = applyContentFilterBreakdown(
      processed.posts,
      {
        sourceId: "SRC-KUM-001",
        displayName: "防災くまもと",
        accountHandle: "Bousai_Kumamoto",
        sourceType: "PREFECTURE",
        region: "熊本県",
        priority: "HIGH",
        verificationStatus: "VERIFIED",
        fetchEnabled: true,
        contentFilter: "ALL",
      },
      "2026-07-29T11:00:00.000Z",
      processed.breakdown
    );
    assert.equal(processed.breakdown.apiPostCount, 4);
    assert.equal(filtered.breakdown.rejectedReply, 1);
    assert.equal(filtered.breakdown.rejectedRepost, 1);
    assert.equal(isCountReconciled(filtered.breakdown), true);
  });

  test("describeResponseShape never includes secret fields", () => {
    const shape = describeResponseShape({
      data: { id: "1" },
      errors: [{ title: "Not Found", detail: "safe detail" }],
      meta: { result_count: 0 },
    });
    assert.match(shape, /has_data: true/);
    assert.match(shape, /has_errors: true/);
    assert.equal(shape.includes("Bearer"), false);
  });

  test("dry run does not modify json files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-11a-"));
    const cwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.copyFileSync(
      path.join(cwd, "data/sources.json"),
      path.join(tmpDir, "data/sources.json")
    );
    fs.writeFileSync(path.join(tmpDir, "data/posts.json"), "[]", "utf-8");
    fs.writeFileSync(
      path.join(tmpDir, "data/fetch-state.json"),
      JSON.stringify({
        lastAttemptAt: null,
        lastSuccessfulFetchAt: null,
        sourceCount: 0,
        successfulSourceCount: 0,
        failedSourceCount: 0,
        fetchedPostCount: 0,
        acceptedPostCount: 0,
        storedPostCount: 0,
        status: "NOT_RUN",
      }),
      "utf-8"
    );
    const postsBefore = "[]";
    process.chdir(tmpDir);
    process.env.X_API_BEARER_TOKEN = "fixture-token";
    try {
      const { MockXPostFetcher } = await import("../src/lib/fetchers/mock");
      const result = await runFetch({
        dryRun: true,
        fetcher: new MockXPostFetcher(),
      });
      assert.equal(result.dryRun, true);
      assert.equal(fs.readFileSync(path.join(tmpDir, "data/posts.json"), "utf-8"), postsBefore);
      assert.equal(fs.existsSync(path.join(tmpDir, "data/source-runtime.json")), false);
    } finally {
      process.chdir(cwd);
      delete process.env.X_API_BEARER_TOKEN;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
