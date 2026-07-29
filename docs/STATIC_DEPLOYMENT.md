# 静的デプロイ

## 方針

本サイトは VPS / Docker 永続ボリューム前提ではありません。静的JSON + Next.js ビルド時読み込みで、一般的な静的ホスティングまたは定期ビルド型デプロイに対応します。

## アーキテクチャ

```text
[GitHub Actions: fetch-x-posts.yml]
  npm run fetch:x → data/*.json 更新 → commit
       ↓
[GitHub Actions: ci.yml / ホスティング自動ビルド]
  npm run build → 公開サイト
```

## 静的生成

全公開ページはビルド時に `data/*.json` を読み込みます。

| ページ | 静的生成 |
|--------|----------|
| `/` | `force-static` |
| `/posts` | `force-static` |
| `/sources` | `force-static` |
| `/sources/[sourceId]` | `generateStaticParams` + `force-static` |
| `/regions/[region]` | `generateStaticParams` + `force-static` |
| `/categories/[category]` | `generateStaticParams` + `force-static` |

DB・API Route・Server Action・ランタイム fetch は使用しません。

## デプロイ手順（手動）

1. `npm run fetch:x` で最新投稿を取得（または Actions で更新済み JSON を pull）
2. `npm run build` でビルド
3. ビルド成果物をホスティングへ配置

## 対応ホスティング

詳細は [DEPLOYMENT_OPTIONS.md](./DEPLOYMENT_OPTIONS.md) を参照。

## 環境変数（本番サイト）

```env
SITE_URL=https://your-domain.example
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

`X_API_BEARER_TOKEN` は取得ジョブ（Actions / ローカルCLI）側でのみ使用。公開サイトには不要。

`SHOW_DEMO_POSTS` は本番では設定しないか `false` にしてください。

## GitHub Actions

- [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) — Secret・権限・手動実行
- [SCHEDULED_FETCH_OPERATION.md](./SCHEDULED_FETCH_OPERATION.md) — 定期取得運用

## 注意

- Webサーバーから `data/*.json` への書き込みは不要
- 管理画面・認証・データベースは不要
- `posts.json` と関連 JSON は取得ジョブの成果物として Git 管理
