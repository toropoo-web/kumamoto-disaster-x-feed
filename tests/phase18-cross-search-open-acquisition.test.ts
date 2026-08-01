import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { evaluateCrossSearchPost } from "../src/lib/cross-search-filters";
import {
  buildCrossSearchQueries,
  resolveQueriesForScheduledRun,
} from "../src/lib/cross-search-queries";

describe("phase18 open cross-search acquisition", function () {
  test("accepts support posts with disaster relevance", function () {
    const result = evaluateCrossSearchPost({
      text: "宇城市で炊き出しを実施します。企業ボランティアも参加。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "local_shop_support",
    });
    assert.equal(result.pass, true);
    assert.equal(result.reason, "ACCEPTED");
  });

  test("rejects posts before since date", function () {
    const result = evaluateCrossSearchPost({
      text: "熊本市で支援物資配布",
      postedAt: "2026-07-27T10:00:00.000Z",
      accountHandle: "shop_account",
    });
    assert.equal(result.pass, false);
    assert.equal(result.reason, "REJECTED_BEFORE_SINCE_DATE");
  });

  test("queries include municipality and disaster clauses", function () {
    const queries = buildCrossSearchQueries();
    assert.ok(queries.length > 0);
    queries.forEach(function (query) {
      assert.equal(query.queryType, "SCOPED");
      assert.match(query.query, /-is:retweet lang:ja/);
      assert.match(query.query, /熊本地震|地震|被災|災害|支援/);
    });
  });

  test("scheduled run rotates one query batch", function () {
    const queries = buildCrossSearchQueries();
    const scheduled = resolveQueriesForScheduledRun(queries, {
      now: new Date("2026-08-02T00:10:00.000Z"),
    });
    assert.equal(scheduled.length, 1);
    const all = resolveQueriesForScheduledRun(queries, { runAll: true });
    assert.equal(all.length, queries.length);
  });
});
