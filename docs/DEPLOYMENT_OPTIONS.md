# デプロイ先オプション

本サイトは静的JSONをビルド時に読み込む Next.js アプリです。ホスティング先はプロジェクト開始時点で決め打ちしません。

## 共通前提

- ビルド時に `data/*.json` を読み込む（ランタイムDB不要）
- 本番サイト側に `X_API_BEARER_TOKEN` は不要
- 投稿更新は GitHub Actions（または手動CLI）で `data/*.json` を更新し、再ビルド・再デプロイ

## Vercel

| 項目 | 設定例 |
|------|--------|
| 接続 | GitHub Repository をインポート |
| Framework | Next.js（自動検出） |
| Build command | `npm run build` |
| Output | Next.js デフォルト（`.next`） |
| Install command | `npm ci` |
| 環境変数（サイト） | `SITE_URL` / `NEXT_PUBLIC_SITE_URL`（任意） |
| X API Token | 不要（取得は Actions 側） |

## Cloudflare Pages

| 項目 | 設定例 |
|------|--------|
| 接続 | GitHub Repository を接続 |
| Build command | `npm run build` |
| Build output | Next.js on Pages の場合は `@cloudflare/next-on-pages` 等の設定が必要な場合あり |
| 環境変数（サイト） | `SITE_URL` / `NEXT_PUBLIC_SITE_URL`（任意） |
| X API Token | 不要 |

静的エクスポート（`output: 'export'`）を使う場合は、動的ルートを `generateStaticParams` で事前生成する必要があります。現行コードはビルド時静的生成に対応しています。

## Netlify

| 項目 | 設定例 |
|------|--------|
| 接続 | GitHub Repository を接続 |
| Build command | `npm run build` |
| Publish directory | Next.js Runtime 利用時は Netlify Next.js プラグインを検討 |
| 環境変数（サイト） | `SITE_URL` / `NEXT_PUBLIC_SITE_URL`（任意） |
| X API Token | 不要 |

Next.js App Router の一部機能は Netlify Adapter が必要な場合があります。公式ドキュメントの Next.js 対応状況を確認してください。

## GitHub Pages

| 項目 | 注意点 |
|------|--------|
| 方式 | `output: 'export'` による静的HTML出力が必要 |
| basePath | リポジトリ名配下で公開する場合は `basePath` / `assetPrefix` の設定が必要 |
| 動的ルート | `generateStaticParams` で全パラメータを事前生成 |
| X API Token | 不要 |

現行の標準 `next build` は GitHub Pages 向けの static export ではありません。Pages 利用時は別途 export 設定が必要です。

## 既存Webサイト配下

- サブパスまたはサブドメインで `out/` またはビルド成果物を配置
- `SITE_URL` / `NEXT_PUBLIC_SITE_URL` を公開URLに合わせる
- 取得ジョブは別途（Actions 等）で JSON を更新

## 推奨順位

本ドキュメントでは特定サービスを推奨しません。利用環境・既存インフラ・運用コストに応じて選択してください。
