# X API コスト管理

## 利用量の記録

取得処理は `data/api-usage.json` に日次で集計します。

```typescript
type ApiUsageRecord = {
  date: string;
  userLookupRequests: number;
  timelineRequests: number;
  postsRead: number;
  acceptedPosts: number;
};
```

Bearer Token やレスポンス本文は記録しません。

## リクエスト数を抑える設定

| 環境変数 | 既定値 | 説明 |
|----------|--------|------|
| `X_FETCH_MAX_RESULTS` | 100 | 1ページあたりの取得件数 |
| `X_FETCH_MAX_PAGES_PER_SOURCE` | 3 | Source あたりの最大ページ数 |
| `X_FETCH_REQUEST_DELAY_MS` | 500 | リクエスト間隔（ミリ秒） |
| `X_INITIAL_LOOKBACK_HOURS` | 72 | 初回取得の遡り時間 |

## 差分取得

- `data/source-runtime.json` の `lastSeenPostId` により、新規投稿のみ取得
- 解決済み `xUserId` は再利用し、username lookup を省略

## レート制限

429 受信時:

- 即時リトライしない
- `x-rate-limit-reset` をログへ表示
- 該当 Source は `FAILED` として記録

他の Source は継続可能（`PARTIAL`）。

## 運用上の推奨

1. 本番導入前に `npm run fetch:x:dry` で件数を確認
2. 取得間隔は必要最小限に設定
3. `api-usage.json` を定期確認
4. 不要な Source は `fetchEnabled=false` に設定

## 課金について

X API の料金体系は X 側のポリシーに従います。本プロジェクトは課金開始や Token 発行を自動実行しません。
