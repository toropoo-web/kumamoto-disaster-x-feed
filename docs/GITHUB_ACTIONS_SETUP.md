# GitHub Actions セットアップ

## 概要

| Workflow | ファイル | 用途 |
|----------|----------|------|
| CI | `.github/workflows/ci.yml` | テスト・ビルド（X API 非呼び出し） |
| Fetch X Posts | `.github/workflows/fetch-x-posts.yml` | 投稿取得・JSONコミット（手動実行のみ） |

## 1. GitHub Repository 作成

ローカルリポジトリを GitHub に push します。

## 2. Repository Secret 追加

Settings → Secrets and variables → Actions → New repository secret

| Name | Value |
|------|-------|
| `X_API_BEARER_TOKEN` | X API Bearer Token |

Token 値は README・Workflow・ログ・JSON に保存しないでください。

## 3. Actions permissions 設定

Settings → Actions → General

- Workflow permissions: **Read and write permissions**（`contents: write` が必要）
- Allow GitHub Actions to create and approve pull requests: 不要（初期実装は直接 push）

## 4. Branch protection がある場合

直接 push が禁止されている環境では、Fetch Workflow のコミットが失敗します。

対応案:

- 保護対象ブランチを一時的に Actions からの push を許可
- 将来 Pull Request 方式へ変更（現時点では未実装）

## 5. 手動実行（workflow_dispatch）

Actions → **Fetch X Posts** → Run workflow

ログで以下を確認:

- `X_API_TOKEN_CONFIGURED=true`（Token の値は表示されない）
- 取得成功時: `Fetch complete: ...`
- 変更なし: `NO_DATA_CHANGES` / `COMMIT_SKIPPED=true`
- HTTP 402 時: `FETCH_STATUS=X_API_PAYMENT_REQUIRED` / `COMMIT_SKIPPED=true`

## 6. JSON 差分確認

取得成功後、コミット対象は以下のみ:

- `data/posts.json`
- `data/fetch-state.json`
- `data/source-runtime.json`
- `data/api-usage.json`

コミットメッセージ: `chore(data): update official X posts`

## 7. schedule 有効化（課金復旧後）

`fetch-x-posts.yml` のコメントを外します:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "*/30 * * * *"
```

課金復旧・Dry Run 確認が完了するまで schedule は有効化しないでください。

## CI Workflow

`ci.yml` は push / pull_request / workflow_dispatch で実行されます。

- `npm ci`
- `npm test`
- `npm run build`

Secret 不要。`fetch:x` は呼び出しません。
