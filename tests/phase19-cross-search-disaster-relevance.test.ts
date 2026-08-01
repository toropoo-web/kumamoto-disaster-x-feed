import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { evaluateDisasterRelevance } from "../src/lib/cross-search-disaster-relevance";
import { evaluateCrossSearchPost } from "../src/lib/cross-search-filters";

describe("phase19 cross-search disaster relevance", function () {
  test("accepts disaster support posts in municipality scope", function () {
    const result = evaluateCrossSearchPost({
      text: "芦北町で炊き出しと支援物資を配布します。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "local_support",
    });
    assert.equal(result.pass, true);
  });

  test("rejects region-only tourism chatter", function () {
    const result = evaluateCrossSearchPost({
      text: "芦北町の観光スポットがおすすめです。旅行記を書きました。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "travel_blog",
    });
    assert.equal(result.pass, false);
    assert.equal(result.reason, "REJECTED_NOISE_CONTENT");
  });

  test("rejects affiliate shopping posts", function () {
    const result = evaluateDisasterRelevance(
      "芦北町限定 楽天通販アフィリエイトでお得情報"
    );
    assert.equal(result.pass, false);
    assert.equal(result.reason, "NOISE_EXCLUDED");
  });

  test("rejects game posts", function () {
    const result = evaluateCrossSearchPost({
      text: "芦北町民だけど新作ゲーム紹介。Steamで攻略中。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "gamer",
    });
    assert.equal(result.pass, false);
    assert.equal(result.reason, "REJECTED_NOISE_CONTENT");
  });

  test("rejects municipality-only posts without disaster relevance", function () {
    const result = evaluateCrossSearchPost({
      text: "芦北町の天気は晴れです。",
      postedAt: "2026-07-29T10:00:00.000Z",
      accountHandle: "weather_fan",
    });
    assert.equal(result.pass, false);
    assert.equal(result.reason, "REJECTED_NOT_DISASTER_RELEVANT");
  });
});
