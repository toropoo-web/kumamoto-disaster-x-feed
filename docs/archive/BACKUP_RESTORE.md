> **DEPRECATED** ? Phase 9/10 の管理運用系ドキュメント。現在の構成では使用しません。

# 繝舌ャ繧ｯ繧｢繝・・繝ｻ蠕ｩ蜈・焔鬆・

## 繝舌ャ繧ｯ繧｢繝・・菴懈・

```bash
npm run storage:backup
```

### 蟇ｾ雎｡繝・・繧ｿ

- posts・・osts.json 縺ｾ縺溘・ kumamoto.db・・
- revisions
- review-state
- sources
- pin order・・osts 蜀・ｼ・

### 菫晄戟荳紋ｻ｣

譛菴・荳紋ｻ｣・・data/backups/backup-YYYY-MM-DD.../`・・

## 蠕ｩ蜈・ｼ・ry-run・・

```bash
npm run storage:restore -- --dry-run
```

迚ｹ螳壹ヰ繝・け繧｢繝・・繧呈欠螳・

```bash
npm run storage:restore -- backup-2026-07-30T00-00-00 --dry-run
```

## 蠕ｩ蜈・ｼ域悽逡ｪ繝・・繧ｿ荳頑嶌縺搾ｼ・

**豕ｨ諢・ 迴ｾ蝨ｨ縺ｮ繝・・繧ｿ縺御ｸ頑嶌縺阪＆繧後∪縺吶・*

```bash
npm run storage:restore -- --confirm
```

## 螳壽悄繝舌ャ繧ｯ繧｢繝・・

cron 萓具ｼ域ｯ取律 3:00・・

```cron
0 3 * * * cd /app && npm run storage:backup
```

Docker迺ｰ蠅・〒縺ｯ繝帙せ繝亥・ cron 縺ｾ縺溘・繧ｳ繝ｳ繝・リ蜀・cron 縺ｧ險ｭ螳壹・

## 螟夜Κ菫晏ｭ・

繝舌ャ繧ｯ繧｢繝・・繝・ぅ繝ｬ繧ｯ繝医Μ繧偵け繝ｩ繧ｦ繝峨せ繝医Ξ繝ｼ繧ｸ縺ｸ蜷梧悄縺吶ｋ縺薙→繧呈耳螂ｨ縲・

```bash
# 萓・ rsync
rsync -av data/backups/ user@backup-server:/backups/kumamoto-x/
```
