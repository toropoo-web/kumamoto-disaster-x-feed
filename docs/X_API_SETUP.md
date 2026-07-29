# X API セットアップ

## 1. Developer Console で App を作成

1. [X Developer Portal](https://developer.x.com/) にログイン
2. Project / App を作成
3. App の権限で **Read** を有効化

## 2. Bearer Token を取得

1. App の Keys and Tokens 画面を開く
2. **Bearer Token** を生成
3. Token は再表示できないため、安全な場所へ控える

> 実際の Token 文字列をリポジトリやドキュメントへ記載しないこと。

## 3. `.env.local` を設定

```env
X_API_BEARER_TOKEN=your-bearer-token-here
X_API_BASE_URL=https://api.x.com/2
X_FETCH_MAX_RESULTS=100
X_FETCH_REQUEST_DELAY_MS=500
X_INITIAL_LOOKBACK_HOURS=72
X_FETCH_MAX_PAGES_PER_SOURCE=3
```

## 4. Dry Run を実行

Token 設定後、**最初は必ず Dry Run** を実行します。

```bash
npm run fetch:x:dry
```

確認項目:

- 各 Source の `API_POST_COUNT`
- `FILTER_ACCEPTED` / `FILTER_REJECTED`
- `WOULD_UPDATE_LAST_SEEN_ID`

Dry Run では以下を書き換えません。

- `data/posts.json`
- `data/source-runtime.json`
- `data/fetch-state.json`
- `data/api-usage.json`

## 5. 通常取得を実行

Dry Run の結果を確認した後:

```bash
npm run fetch:x
```

## 6. エラー確認

| コード | 意味 | 対応 |
|--------|------|------|
| `AUTHENTICATION_ERROR` | Token 無効 | Token を再発行 |
| `ACCESS_DENIED` | 権限不足 | App 権限を確認 |
| `USER_NOT_FOUND` | username 不一致 | `sources.json` を確認 |
| `RATE_LIMITED` | レート制限 | ログの再実行可能時刻まで待機 |
| `X_API_SERVER_ERROR` | X 側障害 | 時間をおいて再試行 |

Bearer Token はログへ出力されません。

## Token 未設定時

```bash
npm run fetch:x
```

出力:

```text
X_API_FETCH_NOT_CONFIGURED
```

API は呼び出されず、既存データは変更されません。
