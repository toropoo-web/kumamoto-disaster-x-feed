import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import {
  buildCrossSearchQueries,
  CROSS_SEARCH_MUNICIPALITIES,
  DISASTER_QUERY_TERMS,
  resolveQueriesForScheduledRun,
} from "../src/lib/cross-search-queries";
import {
  analyzeQueryOptimization,
  REQUIRED_FETCH_KEYWORDS,
} from "../src/lib/cross-search-query-optimization";
import type { CrossSearchPost } from "../src/types/cross-search-post";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_FILE = path.join(ROOT, "data", "posts-cross-search.json");
const REPORT_JSON = path.join(
  ROOT,
  "docs",
  "X_CROSS_SEARCH_QUERY_OPTIMIZATION_REPORT.json"
);
const REPORT_MD = path.join(
  ROOT,
  "docs",
  "X_CROSS_SEARCH_QUERY_OPTIMIZATION_PHASE_RESULT.md"
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

describe("phase21 cross-search query optimization", function () {
  test("queries use 23 municipalities and optimized disaster terms", function () {
    const queries = buildCrossSearchQueries();
    assert.equal(queries.length, 5);
    const covered = new Set<string>();
    queries.forEach(function (query) {
      assert.equal(query.queryType, "SCOPED");
      assert.ok(query.query.length <= 512, `query too long: ${query.id}`);
      assert.match(query.query, /-is:retweet lang:ja/);
      query.municipalityBatch.forEach(function (municipality) {
        covered.add(municipality);
      });
      DISASTER_QUERY_TERMS.forEach(function (term) {
        assert.match(query.query, new RegExp(term));
      });
      assert.doesNotMatch(query.query, /熊本地震|"地震"|"被災"|"災害"|"支援"|"物資"/);
    });
    assert.equal(covered.size, CROSS_SEARCH_MUNICIPALITIES.length);
  });

  test("required fetch keywords are present in query terms", function () {
    REQUIRED_FETCH_KEYWORDS.forEach(function (keyword) {
      assert.ok(
        (DISASTER_QUERY_TERMS as readonly string[]).includes(keyword),
        `missing keyword: ${keyword}`
      );
    });
    assert.equal(REQUIRED_FETCH_KEYWORDS.length, 19);
  });

  test("30-minute scheduled rotation remains one query per slot", function () {
    const queries = buildCrossSearchQueries();
    const scheduled = resolveQueriesForScheduledRun(queries, {
      now: new Date("2026-08-02T00:10:00.000Z"),
    });
    assert.equal(scheduled.length, 1);
    const all = resolveQueriesForScheduledRun(queries, { runAll: true });
    assert.equal(all.length, queries.length);
  });

  test("optimization comparison shows fetch reduction", function () {
    const posts = readJson<CrossSearchPost[]>(POSTS_FILE);
    const report = analyzeQueryOptimization(posts);
    assert.ok(report.before.fetchProxyCount > report.after.fetchProxyCount);
    assert.ok(report.reduction.fetchReductionRate > 0);
    assert.ok(report.after.adoptedProxyCount > 0);
  });

  test("phase result artifacts exist", function () {
    assert.ok(fs.existsSync(REPORT_JSON), "missing JSON report");
    assert.ok(fs.existsSync(REPORT_MD), "missing markdown report");
    const report = readJson<{
      keywordCoverage: Array<{ keyword: string; inQuery: boolean }>;
    }>(REPORT_JSON);
    assert.equal(report.keywordCoverage.length, 19);
    report.keywordCoverage.forEach(function (row) {
      assert.equal(row.inQuery, true, `keyword missing in query: ${row.keyword}`);
    });
    const markdown = fs.readFileSync(REPORT_MD, "utf8");
    assert.match(markdown, /PHASE_RESULT/);
    assert.match(markdown, /変更前/);
    assert.match(markdown, /変更後/);
  });
});
