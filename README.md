# 熊本地震 公式X情報まとめ

熊本地震に関する公的機関・自治体等の公式X投稿を、発信元・地域・情報種別ごとに整理して表示する**閲覧専用サイト**です。

> 本サイトは行政機関が運営する公式サイトではありません。緊急時は、各機関の公式Xおよび公式Webサイトを直接確認してください。

## 構成

```text
公式Xアカウント
  ↓ X API 取得（CLI / GitHub Actions）
熊本地震関連投稿の抽出・分類
  ↓
data/posts.json（静的JSON）
  ↓
Next.js 公開サイト（閲覧のみ）
```

## データファイル

| ファイル | 説明 |
|----------|------|
| `data/sources.json` | 監視対象マスタ（手動管理） |
| `data/source-runtime.json` | User ID・差分取得状態（CLI生成） |
| `data/posts.json` | 取得済み投稿 |
| `data/fetch-state.json` | 最終取得状態 |
| `data/api-usage.json` | X API 利用量（日次） |

## 投稿取得

```bash
# Token 設定後、最初は Dry Run
npm run fetch:x:dry

# 確認後に通常取得
npm run fetch:x
```

Token 未設定時は `X_API_FETCH_NOT_CONFIGURED` を表示し、API は呼び出しません。

本番運用では [GitHub Actions](./docs/GITHUB_ACTIONS_SETUP.md) での定期取得を推奨します（初期状態は手動実行のみ）。

## 環境変数

```env
X_API_BEARER_TOKEN=
X_API_BASE_URL=https://api.x.com/2
X_FETCH_MAX_RESULTS=100
X_FETCH_REQUEST_DELAY_MS=500
X_INITIAL_LOOKBACK_HOURS=72
X_FETCH_MAX_PAGES_PER_SOURCE=3
```

公開サイトのみデプロイする場合、`X_API_BEARER_TOKEN` は不要です。

## テスト・ビルド

```bash
npm test
npm run build
npm start
```

## ドキュメント

- [現在のアーキテクチャ](docs/CURRENT_ARCHITECTURE.md)
- [X取得フロー](docs/X_FETCH_FLOW.md)
- [X API セットアップ](docs/X_API_SETUP.md)
- [X API コスト管理](docs/X_API_COST_CONTROL.md)
- [静的デプロイ](docs/STATIC_DEPLOYMENT.md)
- [デプロイ先オプション](docs/DEPLOYMENT_OPTIONS.md)
- [GitHub Actions セットアップ](docs/GITHUB_ACTIONS_SETUP.md)
- [定期取得オペレーション](docs/SCHEDULED_FETCH_OPERATION.md)

## GitHub Actions

| Workflow | 用途 |
|----------|------|
| `ci.yml` | push/PR 時のテスト・ビルド |
| `fetch-x-posts.yml` | X投稿取得・JSONコミット（手動のみ） |

Actions には `contents: write` 権限と `X_API_BEARER_TOKEN` Secret が必要です。Branch protection がある場合は直接 push ができないため、[GITHUB_ACTIONS_SETUP.md](docs/GITHUB_ACTIONS_SETUP.md) を参照してください。
