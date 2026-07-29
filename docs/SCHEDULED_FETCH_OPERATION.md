# 定期取得オペレーション

## 運用フロー

```text
[GitHub Actions: Fetch X Posts]
  npm test
  npm run fetch:x
  data/*.json 更新（変更時のみ）
  npm run build（検証）
  git commit & push（変更時のみ）
       ↓
[ホスティング: 再デプロイ]
  npm run build
  公開サイト更新
```

## 初期状態

- schedule は **無効**（コメントアウト）
- 手動 `workflow_dispatch` のみ
- X API HTTP 402 発生中のため、実取得成功は前提にしない

## 同時実行防止

`concurrency: kumamoto-x-fetch` により、同一 Workflow の並行実行を防止します。

## HTTP 402（課金不足）時

| 項目 | 挙動 |
|------|------|
| JSON 更新 | なし |
| git commit | スキップ |
| build | 既存 JSON で実行 |
| ログ | `FETCH_STATUS=X_API_PAYMENT_REQUIRED` |
| 公開サイト | 最後の成功データを表示 |

公開ページには課金エラーの詳細を表示しません。

## 最終取得時刻の表示

公開サイトは `fetch-state.json` の `lastSuccessfulFetchAt` のみを「公式X最終取得」として表示します。

`lastAttemptAt`（失敗試行を含む）は公開しません。

## 空データ時

投稿 0 件でもサイトは正常表示します。

- トップ: 空状態メッセージ + 監視対象リンク
- 投稿一覧: 「現在、掲載中の公式投稿はありません。」
- 重要情報: 「現在、掲載中の重要情報はありません。」

## 手動取得（ローカル）

```bash
npm run fetch:x:dry   # 確認用
npm run fetch:x       # 通常取得
```

本番運用では GitHub Actions を推奨します。

## schedule 有効化のゲート

以下を満たしてから schedule を有効化:

1. X API 課金復旧
2. `npm run fetch:x:dry` で 8 Source 確認
3. 手動 Workflow で取得成功を確認
4. JSON 差分・ビルド成功を確認
