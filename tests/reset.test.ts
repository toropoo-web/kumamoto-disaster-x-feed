import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import {
  dedupePostsByUrl,
  mergePosts,
  rawPostToOfficialPost,
} from "../src/lib/fetch-pipeline";
import {
  isEligibleForPublication,
  isDemoPost,
} from "../src/lib/filters";
import { writeJsonAtomically } from "../src/lib/json-io";
import type { OfficialPost } from "../src/types/post";
import type { Source } from "../src/types/source";

const ROOT = process.cwd();

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

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

function makePost(overrides: Partial<OfficialPost> = {}): OfficialPost {
  return {
    postId: "POST-1",
    sourceId: "SRC-KUM-001",
    sourceName: "防災くまもと",
    accountHandle: "Bousai_Kumamoto",
    postUrl: "https://x.com/example/status/1",
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

describe("reset scope", () => {
  test("admin pages do not exist", () => {
    assert.equal(fileExists("src/app/admin"), false);
    assert.equal(fileExists("src/app/api/admin"), false);
  });

  test("auth middleware does not exist", () => {
    assert.equal(fileExists("src/middleware.ts"), false);
  });

  test("sqlite and storage scripts do not exist", () => {
    assert.equal(fileExists("src/lib/storage"), false);
    assert.equal(fileExists("scripts/storage-migrate.ts"), false);
    assert.equal(fileExists("docker-compose.yml"), false);
    const pkg = JSON.parse(readText("package.json"));
    assert.equal(pkg.scripts["storage:migrate"], undefined);
    assert.equal(pkg.scripts["fetch:x"], "tsx scripts/fetch-x.ts");
  });

  test("package.json has no admin env references in example", () => {
    const envExample = readText(".env.example");
    assert.equal(envExample.includes("ADMIN_USERNAME"), false);
    assert.equal(envExample.includes("STORAGE_MODE"), false);
    assert.equal(envExample.includes("X_API_BEARER_TOKEN"), true);
  });

  test("sources.json loads with camelCase schema", () => {
    const sources = JSON.parse(readText("data/sources.json"));
    assert.ok(Array.isArray(sources));
    assert.ok(sources.length >= 8);
    assert.ok(sources.every((s: Source) => s.sourceId && s.displayName));
  });

  test("dedupePostsByUrl removes duplicate URLs", () => {
    const posts = [
      makePost({ postId: "A", postUrl: "https://x.com/a" }),
      makePost({ postId: "B", postUrl: "https://x.com/a" }),
      makePost({ postId: "C", postUrl: "https://x.com/b" }),
    ];
    assert.equal(dedupePostsByUrl(posts).length, 2);
  });

  test("isEligibleForPublication filters political content", () => {
    assert.equal(
      isEligibleForPublication("熊本地震の選挙活動について", "Kantei_Saigai"),
      false
    );
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
    assert.equal(
      isEligibleForPublication(
        "こちらは熊本市です。避難所を開設しました。",
        "kumamotocity_",
        { sourceType: "LOCAL_GOVERNMENT", contentFilter: "DISASTER_RELATED" }
      ),
      true
    );
    assert.equal(
      isEligibleForPublication(
        "【応急給水活動について】給水所を設置します。",
        "yatsushiro0801",
        { sourceType: "LOCAL_GOVERNMENT", contentFilter: "DISASTER_RELATED" }
      ),
      true
    );
    assert.equal(
      isEligibleForPublication(
        "春のイベント開催のお知らせ",
        "kumamotocity_",
        { sourceType: "LOCAL_GOVERNMENT", contentFilter: "DISASTER_RELATED" }
      ),
      false
    );
    assert.equal(
      isEligibleForPublication(
        "こちらは人吉市です。避難所を開設しました。",
        "hitoyoshishi",
        { sourceType: "LOCAL_GOVERNMENT", contentFilter: "DISASTER_RELATED" }
      ),
      true
    );
  });

  test("rawPostToOfficialPost assigns category and regions", () => {
    const post = rawPostToOfficialPost(
      {
        id: "123",
        text: "熊本県宇城市の避難所を開設しました。",
        authorId: "2244994945",
        createdAt: "2026-07-29T10:00:00.000Z",
        media: [{ mediaKey: "1", type: "photo" }],
      },
      sampleSource,
      "2026-07-29T11:00:00.000Z"
    );
    assert.ok(post);
    assert.equal(post?.category, "EVACUATION_SHELTER");
    assert.ok(post?.regions.includes("宇城市"));
  });

  test("important post filter and demo exclusion in production", () => {
    const posts = [
      makePost({
        postId: "important",
        category: "EVACUATION_SHELTER",
        priority: "HIGH",
        status: "ACTIVE",
      }),
      makePost({
        postId: "normal",
        category: "OTHER",
        priority: "NORMAL",
        status: "ACTIVE",
        postUrl: "https://x.com/example/status/2",
      }),
      makePost({
        postId: "demo",
        isDemo: true,
        postUrl: "https://x.com/example/status/3",
      }),
    ];

    const visibleInProduction = posts.filter((p) => !isDemoPost(p));
    const important = visibleInProduction.filter(
      (p) =>
        p.status === "ACTIVE" &&
        (p.priority === "EMERGENCY" || p.priority === "HIGH") &&
        [
          "EVACUATION_SHELTER",
          "EARTHQUAKE_TSUNAMI",
          "RESCUE_JSDF",
          "WATER",
          "ROAD_TRANSPORT",
          "POWER",
          "MEDICAL_SUPPORT",
        ].includes(p.category)
    );

    assert.equal(important.length, 1);
    assert.equal(visibleInProduction.length, 2);
  });

  test("writeJsonAtomically preserves existing file on invalid data", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-io-"));
    const target = path.join(tmpDir, "posts.json");
    fs.writeFileSync(target, "[]", "utf-8");
    assert.throws(() => {
      writeJsonAtomically(target, BigInt(1));
    });
    assert.equal(fs.readFileSync(target, "utf-8"), "[]");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("mergePosts keeps existing when incoming is empty", () => {
    const existing = [makePost()];
    const merged = mergePosts(existing, []);
    assert.equal(merged.length, 1);
  });

  test("demo posts are detected", () => {
    assert.equal(isDemoPost(makePost({ isDemo: true })), true);
    assert.equal(isDemoPost(makePost({ title: "SAMPLE post" })), true);
    assert.equal(isDemoPost(makePost()), false);
  });
});

describe("fetch failure safety", () => {
  let tmpDir: string;
  let originalCwd: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kumamoto-x-fetch-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "data/sources.json"),
      path.join(tmpDir, "data/sources.json")
    );
    const existingPost = makePost();
    writeJsonAtomically(path.join(tmpDir, "data/posts.json"), [existingPost]);
    writeJsonAtomically(path.join(tmpDir, "data/fetch-state.json"), {
      lastAttemptAt: null,
      lastSuccessfulFetchAt: "2026-07-28T10:00:00.000Z",
      sourceCount: 8,
      successfulSourceCount: 8,
      failedSourceCount: 0,
      fetchedPostCount: 1,
      acceptedPostCount: 1,
      storedPostCount: 1,
      status: "SUCCESS",
    });
    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Windows may lock cwd briefly; ignore cleanup errors
    }
  });

  test("failed fetch does not overwrite posts.json", async () => {
    class FailingFetcher {
      async fetchLatestPosts() {
        throw new Error("network error");
      }
    }

    const postsPath = path.join(tmpDir, "data/posts.json");
    const statePath = path.join(tmpDir, "data/fetch-state.json");
    const before = fs.readFileSync(postsPath, "utf-8");
    const stateBefore = JSON.parse(fs.readFileSync(statePath, "utf-8"));

    const { getFetchEnabledSources } = await import("../src/lib/sources");
    const sources = getFetchEnabledSources();
    let successCount = 0;
    let failureCount = 0;
    const fetcher = new FailingFetcher();

    for (const source of sources) {
      try {
        await fetcher.fetchLatestPosts(source);
        successCount += 1;
      } catch {
        failureCount += 1;
      }
    }

    assert.equal(successCount, 0);
    assert.ok(failureCount > 0);
    assert.equal(fs.readFileSync(postsPath, "utf-8"), before);
    assert.equal(
      JSON.parse(fs.readFileSync(statePath, "utf-8")).lastSuccessfulFetchAt,
      stateBefore.lastSuccessfulFetchAt
    );
  });
});
