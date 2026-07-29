# X取得フロー

## コマンド

```bash
npm run fetch:x:dry   # 確認用（ファイル非更新）
npm run fetch:x       # 通常取得
```

## 処理ステップ

1. `data/sources.json` を読み込み
2. `fetchEnabled=true` の Source を対象
3. `data/source-runtime.json` から差分状態を読み込み
4. xUserId 未登録時のみ username lookup
5. `since_id` または初回 `start_time` で投稿取得
6. 返信・リポスト除外、熊本関連フィルタ
7. 分類・重複除外
8. `posts.json` を一時ファイル経由で更新
9. 保存成功後に `lastSeenPostId` を更新
10. `fetch-state.json`, `api-usage.json` を更新

## Fetcher

| 実装 | 条件 |
|------|------|
| 未設定 | Token なし → API 非実行、`NOT_RUN` |
| `XApiPostFetcher` | `X_API_BEARER_TOKEN` 設定時 |

## 失敗時

| 状況 | 挙動 |
|------|------|
| Token 未設定 | 既存データ不変、`NOT_RUN` |
| 全 Source 失敗 | `posts.json` 不変 |
| 全 Source HTTP 402 | `posts.json` 不変、exit code 2、`FETCH_STATUS=X_API_PAYMENT_REQUIRED` |
| 一部失敗 | 成功分を保存、`PARTIAL` |
| 保存失敗 | `lastSeenPostId` 不更新 |

## GitHub Actions

`fetch-x-posts.yml` が `npm run fetch:x` を実行し、変更がある場合のみ `data/*.json` をコミットします。

詳細: [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)

## 掲載フィルタ

熊本関連キーワードを含む投稿のみ（`Bousai_Kumamoto` は全投稿対象）。選挙・イベント等は除外。

詳細は Phase 11 仕様および `src/lib/filters.ts` を参照。
