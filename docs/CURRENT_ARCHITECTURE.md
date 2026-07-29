# 現在のアーキテクチャ

## 概要

閲覧専用サイト。管理画面・DB・手動投稿はありません。

## レイヤー構成

```text
公開Web（Next.js, ビルド時静的生成）  ← read only
  ↑
data/posts.json, data/fetch-state.json, data/sources.json
  ↑
GitHub Actions / npm run fetch:x
  ↑
XApiPostFetcher → X API v2
```

## データモデル

| ファイル | 内容 |
|----------|------|
| `sources.json` | 監視対象マスタ（手動） |
| `source-runtime.json` | xUserId, lastSeenPostId（CLI） |
| `posts.json` | 公開投稿データ |
| `fetch-state.json` | 全体取得状態（`fetchedPostCount`=API処理件数、`acceptedPostCount`=今回ACCEPTED、`storedPostCount`=保存後総件数） |
| `api-usage.json` | API 利用量 |

## X API 取得

- Bearer Token 認証
- username → User ID 解決（初回のみ、以降は runtime 再利用）
- `since_id` による差分取得
- 初回は `start_time`（既定72時間）
- 返信・リポスト除外
- ページネーション（最大3ページ/Source）

## 定期取得（Phase 12）

| Workflow | 用途 |
|----------|------|
| `ci.yml` | テスト・ビルド（API 非呼び出し） |
| `fetch-x-posts.yml` | 投稿取得・JSONコミット（手動のみ、schedule はコメントアウト） |

HTTP 402 時は JSON 不更新・commit スキップ。公開サイトは `lastSuccessfulFetchAt` のみ表示。

## 重要情報の自動判定

`status=ACTIVE` かつ `priority=EMERGENCY|HIGH` かつインフラ系カテゴリを最大10件表示。

## Dry Run

`npm run fetch:x:dry` — API呼び出しのみ行い、JSONファイルは更新しません。
