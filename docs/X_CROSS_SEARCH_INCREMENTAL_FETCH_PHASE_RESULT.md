# X Cross Search Incremental Fetch — PHASE_RESULT

Generated: 2026-08-02

## 変更前方式

- 毎回 `start_time = 2026-07-28T00:00:00Z` 固定
- `since_id` 未使用・未保存
- バッチ別 state なし
- APIは同一期間を30分ごとに再スキャン（`postId` マージで保存重複のみ防止）

## 変更後方式

- **初回（バッチ state なし）**: `start_time = 2026-07-28T00:00:00Z`
- **移行（既存 global `lastSuccessfulFetchAt` のみ）**: 各バッチを前回成功時刻 − 5分で初期化（既存3,321件を再スキャンしない）
- **2回目以降**: バッチ別 `nextStartTime`（前回成功 − 5分）を `start_time` に使用
- **Search Recent API**: `since_id` 非対応のため `start_time_overlap` 方式を採用
- 成功時のみバッチ state 更新 / 失敗時は `nextStartTime` を進めない

## state構造

`data/cross-search-fetch-state.json`:

```json
{
  "lastSuccessfulFetchAt": "...",
  "consecutiveFailures": 0,
  "batches": {
    "MUN-SCOPED-01": {
      "lastSuccessfulSearchAt": "...",
      "nextStartTime": "...",
      "lastBatchId": "MUN-SCOPED-01",
      "lastNewestPostId": "...",
      "fetchedCount": 0,
      "acceptedCount": 0,
      "storedCount": 3321,
      "consecutiveFailures": 0
    }
  }
}
```

## 初回取得

- バッチ state も global 成功時刻もない場合 → `2026-07-28T00:00:00Z`
- 既存投稿ファイルは削除・再初期化しない

## 差分取得

- バッチごとに `nextStartTime` を使用
- 5分オーバーラップで取りこぼし防止
- `mergeCrossSearchPosts` で `postId` 重複除外

## 失敗時挙動

- HTTP 402 / 500 / INVALID_RESPONSE → 当該バッチの `nextStartTime` 不更新
- `consecutiveFailures` インクリメント
- `posts-cross-search.json` は上書きしない（全クエリ失敗時）

## 5バッチ確認

- `MUN-SCOPED-01`〜`05` 個別 `batches` エントリ
- 30分ローテーション後も各バッチが独立した `nextStartTime` から再開

## 比較（コーパス推定）

| 指標 | 変更前 | 変更後（30分ごと） |
|---|---:|---:|
| 検索ウィンドウ | 2026-07-28〜現在（最大7日） | 前回成功〜現在（約30分+5分） |
| 1実行あたりAPI取得件数（推定） | 全期間ヒット | 直近30分帯のみ |
| API消費削減率（推定） | — | **90%以上**（期間比例） |
| 取りこぼし件数 | 0（全スキャン） | 0（5分オーバーラップ） |
| 重複件数 | マージで0保存 | マージで0保存 |

## Validation

- phase22 A〜G: PASS
- Build: PASS
- npm test: PASS

## 対象コード

- `src/lib/cross-search-incremental.ts`
- `src/lib/cross-search-runner.ts`
- `src/lib/fetchers/x-search-client.ts`
- `src/types/cross-search-post.ts`
- `tests/phase22-cross-search-incremental-fetch.test.ts`
