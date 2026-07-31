# GitHub Actions セットアップ

## 概要

| Workflow | ファイル | 用途 |
|----------|----------|------|
| CI | `.github/workflows/ci.yml` | テスト・ビルド（X API 非呼び出し） |
| Fetch X Posts | `.github/workflows/fetch-x-posts.yml` | 投稿取得・JSONコミット・Portal dispatch（30分ごと + 手動） |

## 1. GitHub Repository 作成

ローカルリポジトリを GitHub に push します。

## 2. Repository Secret 追加

Settings → Secrets and variables → Actions → New repository secret

| Name | Value |
|------|-------|
| `X_API_BEARER_TOKEN` | X API Bearer Token |
| `PORTAL_DISPATCH_TOKEN` | `kumamoto-disaster-portal` へ `repository_dispatch` する PAT（`repo` スコープ） |

Token 値は README・Workflow・ログ・JSON に保存しないでください。

## 3. Actions permissions 設定

Settings → Actions → General

- Workflow permissions: **Read and write permissions**（`contents: write` が必要）
- Allow GitHub Actions to create and approve pull requests: 不要（直接 push）

## 4. Branch protection がある場合

直接 push が禁止されている環境では、Fetch Workflow のコミットが失敗します。

対応案:

- 保護対象ブランチを一時的に Actions からの push を許可
- 将来 Pull Request 方式へ変更（現時点では未実装）

## 5. 自動実行（schedule）

`fetch-x-posts.yml` は UTC で 30 分ごとに実行されます。

```yaml
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:
```

JST との対応: UTC+9（例: UTC 00:00 = JST 09:00）

## 6. 手動実行（workflow_dispatch）

Actions → **Fetch X Posts** → Run workflow

ログで以下を確認:

- `X_API_TOKEN_CONFIGURED=true`（Token の値は表示されない）
- 取得成功時: `FETCH_STATUS=SUCCESS`
- 変更なし: `NO_DATA_CHANGES` / `COMMIT_SKIPPED=true`
- HTTP 402 時: `FETCH_STATUS=X_API_PAYMENT_REQUIRED` / `COMMIT_SKIPPED=true`
- Portal 連携: `PORTAL_DISPATCH_SENT=true`（`dispatch-portal` ジョブ）

## 7. Portal 連携

取得成功後（402 以外）、`dispatch-portal` ジョブが `toropoo-web/kumamoto-disaster-portal` に `x-feed-updated` イベントを送信します。

Portal 側は `x-feed-sync.yml` で同期・ビルド・公開データ commit を行い、Render が main への push を検知して再デプロイします。

`PORTAL_DISPATCH_TOKEN` 未設定時は dispatch が失敗しますが、Portal 側のバックアップ cron（UTC :15/:45）で同期されます。

## 8. JSON 差分確認

取得成功後、コミット対象は以下:

- `data/posts.json`
- `data/fetch-state.json`
- `data/source-runtime.json`
- `data/api-usage.json`
- `data/feed-status.json`

コミットメッセージ: `chore(data): update official X posts`

## CI Workflow

`ci.yml` は push / pull_request / workflow_dispatch で実行されます。

- `npm ci`
- `npm test`
- `npm run build`
