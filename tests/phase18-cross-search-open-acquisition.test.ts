import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { evaluateCrossSearchPost } from "../src/lib/cross-search-filters";
import { buildCrossSearchQueries } from "../src/lib/cross-search-queries";

describe("phase18 open cross-search acquisition", function () {
  test("accepts support posts without disaster keywords", function () {
    const result = evaluateCrossSearchPost({
      text: "宇城市で炊き出しを実施します。企業ボランティアも参加。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "local_shop_support",
    });
    assert.equal(result.pass, true);
    assert.equal(result.reason, "ACCEPTED");
  });

  test("accepts individual support posts in regional scope", function () {
    const result = evaluateCrossSearchPost({
      text: "熊本市の避難所へ支援物資を持っていきます。",
      postedAt: "2026-07-30T08:00:00.000Z",
      accountHandle: "citizen_helper",
    });
    assert.equal(result.pass, true);
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

  test("rejects posts outside 23-municipality scope", function () {
    const result = evaluateCrossSearchPost({
      text: "熊本県全体の支援情報です。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "broad_info",
    });
    assert.equal(result.pass, false);
    assert.equal(result.reason, "REJECTED_OUT_OF_MUNICIPALITY_SCOPE");
  });

  test("queries are municipality-only without keyword filters", function () {
    const queries = buildCrossSearchQueries();
    assert.ok(queries.length > 0);
    queries.forEach(function (query) {
      assert.equal(query.queryType, "OPEN");
      assert.match(query.query, /-is:retweet lang:ja/);
      assert.doesNotMatch(query.query, /熊本地震|給水|支援物資|炊き出し|地震/);
    });
  });
});
