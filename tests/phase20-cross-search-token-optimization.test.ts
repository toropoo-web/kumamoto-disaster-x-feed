import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import {
  analyzeCrossSearchTokenOptimization,
  buildMuniOnlyQueries,
  buildProposedScopedQueries,
  PROPOSED_DISASTER_QUERY_TERMS,
} from "../src/lib/cross-search-token-optimization";
import { buildCrossSearchQueries } from "../src/lib/cross-search-queries";
import type { CrossSearchPost } from "../src/types/cross-search-post";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_FILE = path.join(ROOT, "data", "posts-cross-search.json");
const REPORT_JSON = path.join(
  ROOT,
  "docs",
  "X_CROSS_SEARCH_TOKEN_OPTIMIZATION_REPORT.json"
);
const REPORT_MD = path.join(
  ROOT,
  "docs",
  "X_CROSS_SEARCH_TOKEN_OPTIMIZATION_PHASE_RESULT.md"
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

describe("phase20 cross-search token optimization", function () {
  test("current queries are municipality + disaster scoped", function () {
    const queries = buildCrossSearchQueries();
    assert.ok(queries.length >= 5);
    queries.forEach(function (query) {
      assert.match(query.query, /-is:retweet lang:ja/);
      assert.match(query.query, /給水|断水|避難|支援物資|ボランティア/);
    });
  });

  test("proposed and muni-only builders keep batch parity", function () {
    const current = buildCrossSearchQueries();
    const proposed = buildProposedScopedQueries();
    const muniOnly = buildMuniOnlyQueries();
    assert.equal(proposed.length, current.length);
    assert.equal(muniOnly.length, current.length);
    proposed.forEach(function (query, index) {
      assert.deepEqual(
        query.municipalityBatch,
        current[index].municipalityBatch
      );
      PROPOSED_DISASTER_QUERY_TERMS.forEach(function (term) {
        assert.match(query.query, new RegExp(term));
      });
    });
    muniOnly.forEach(function (query) {
      assert.doesNotMatch(query.query, /給水|断水|避難|支援物資/);
    });
  });

  test("analysis report has required task sections", function () {
    const posts = readJson<CrossSearchPost[]>(POSTS_FILE);
    const report = analyzeCrossSearchTokenOptimization({ posts });
    assert.ok(report.currentQueries.length >= 5);
    assert.ok(report.termPerformance.length > 0);
    assert.equal(report.candidateComparison.length, 3);
    assert.ok(report.recommendation.queryStrategy.length > 0);
    assert.ok(report.recommendation.predictedApiReductionRate >= 0);
    assert.ok(report.recommendation.predictedDisasterPostRate > 0);
  });

  test("generated report artifacts exist after script run", function () {
    assert.ok(fs.existsSync(REPORT_JSON), "missing JSON report");
    assert.ok(fs.existsSync(REPORT_MD), "missing markdown report");
    const report = readJson<{ phase?: string }>(REPORT_JSON);
    assert.ok(Array.isArray((report as { currentQueries: unknown[] }).currentQueries));
    const markdown = fs.readFileSync(REPORT_MD, "utf8");
    assert.match(markdown, /TASK1/);
    assert.match(markdown, /TASK4/);
    assert.match(markdown, /PHASE_RESULT/);
  });
});
