# Phase 8 実装仕様 — 熊本地震 公式X投稿まとめサイト

## 概要

X上で時間とともに流れてしまう熊本地震関連の公式投稿を収集し、時系列・発信元・対象地域・情報分類から探せるサイトの初期実装。

一般投稿、報道記事、非公式情報、独自の被害推定は扱わない。

## スコープ

### 実装済み

- Source Master（`data/sources.json`）9件
- 投稿データモデル（`src/types/post.ts`）
- 掲載判定フィルタ（`src/lib/filters.ts`）
- X取得アダプター（Mock / Manual / X API スタブ）
- 必須画面 8 ページ
- 手動投稿登録（`/admin/import`）
- 固定候補管理（`/admin/pins`）
- スマートフォン優先の日本語UI
- SAMPLE/DEMO データ（開発時のみ表示）

### 未実装（Phase 9 以降）

- X API による自動取得
- 認証付き管理画面
- 定期実行ジョブ（cron）
- 投稿の更新・解除ステータス自動判定

## データモデル

### Source

`src/types/source.ts` 参照。JSON フィールドは snake_case。

### OfficialPost

`src/types/post.ts` 参照。

### PostCategory（固定9種）

- EARTHQUAKE_TSUNAMI
- EVACUATION_SHELTER
- RESCUE_JSDF
- WATER
- ROAD_TRANSPORT
- POWER
- MEDICAL_SUPPORT
- GOVERNMENT_RESPONSE
- OTHER

## 掲載判定

キーワードのいずれかを含む投稿のみ掲載候補:

熊本、熊本県、熊本地震、宇城市、宇土市、八代市、被災地、災害派遣、救助、避難、避難所、断水、給水、通行止め、停電、地震、津波

例外: `Bousai_Kumamoto` は初期段階で全投稿取得可能（除外キーワードは適用）。

除外: 政治、選挙、政党活動、一般政策、日常広報、イベント告知

## 固定情報（PIN）

以下キーワードで `pinStatus: CANDIDATE` を自動付与:

避難指示、避難所開設・閉鎖、津波、救助、災害派遣、断水・給水、道路通行止め、停電、医療

初期版では `PIN_ACTIVE` への自動昇格はしない。管理者が `/admin/pins` で操作。

## トップページ表示順

1. サイトタイトル
2. 最終確認時刻（`lastSuccessfulFetchAt`）
3. 現在監視中の対象名（高市早苗を除く8件）
4. 重要固定投稿（`pinStatus: ACTIVE`）
5. 最新の公式投稿
6. 地域から探す
7. 情報種別から探す
8. 発信元から探す

## 投稿カード項目

- カテゴリ
- 見出し
- 概要（100文字以内、判断語句なし）
- 対象地域
- 発信元
- 投稿時刻
- 当サイト確認時刻
- 公式Xで確認（原文リンク）

## 取得アーキテクチャ

```typescript
interface XPostFetcher {
  fetchLatestPosts(source: Source): Promise<RawXPost[]>;
}
```

| クラス | ファイル | 状態 |
|--------|----------|------|
| MockXPostFetcher | `src/lib/fetchers/mock.ts` | 有効（デフォルト） |
| ManualXPostImporter | `src/lib/fetchers/manual.ts` | 有効 |
| XApiPostFetcher | `src/lib/fetchers/x-api.ts` | スタブ |

差し替え入口: `src/lib/fetchers/index.ts` → `createDefaultFetcher()`

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| FETCH_INTERVAL_MINUTES | 30 | 取得間隔（分）下限 |
| FETCH_INTERVAL_MAX_MINUTES | 60 | 取得間隔（分）上限 |
| SHOW_SAMPLE_POSTS | dev: true, prod: false | サンプル投稿表示 |

## ファイル構成

```
data/sources.json          # Source Master
data/posts.json            # 登録投稿（gitignore、手動登録で生成）
data/fetch-state.json      # 最終取得成功時刻（gitignore）
src/types/source.ts
src/types/post.ts
src/lib/fetchers/
src/lib/filters.ts
src/lib/posts.ts
src/lib/storage.ts
src/lib/sources.ts
src/lib/config.ts
src/app/                   # ページ・API
src/components/            # UIコンポーネント
```

## 品質条件

- スマートフォン優先
- 日本語表示
- 投稿日時と確認日時を区別
- 原文リンク必須
- 非公式投稿を混ぜない
- 解除済み投稿を削除しない
- 投稿取得失敗を更新成功として記録しない
- アカウント名を推測しない
- X取得手段を無断で決定しない（スクレイピングなし）
