> **DEPRECATED** ? Phase 9/10 の管理運用系ドキュメント。現在の構成では使用しません。

# Phase 10 譛ｬ逡ｪ繝・・繝ｭ繧､繧ｬ繧､繝・

## 迺ｰ蠅・屮譟ｻ邨先棡・亥ｮ溯｣・凾轤ｹ・・

| 鬆・岼 | 蛟､ |
|------|-----|
| CURRENT_FRAMEWORK | Next.js 14 (App Router) |
| NEXT_VERSION | ^14.2.0 |
| NODE_VERSION | v24.x・磯幕逋ｺ迺ｰ蠅・ｼ・|
| CURRENT_STORAGE_MODE | json・磯幕逋ｺ・・ persistent・域悽逡ｪ謗ｨ螂ｨ・・|
| CURRENT_DATA_PATH | `./data` 縺ｾ縺溘・ `PERSISTENT_DATA_PATH` |
| GIT_STATUS | 譛ｪ蛻晄悄蛹・|
| DEPLOYMENT_CONFIG_FOUND | Dockerfile, docker-compose.yml |
| HOSTING_CANDIDATE_FOUND | 縺ｪ縺暦ｼ域悴螂醍ｴ・ｼ・|
| DOMAIN_CONFIG_FOUND | 縺ｪ縺暦ｼ域悴險ｭ螳夲ｼ・|

## 繧ｹ繝医Ξ繝ｼ繧ｸ豈碑ｼ・

| 譁ｹ蠑・| 豌ｸ邯壽ｧ | 雋ｻ逕ｨ | 繝舌ャ繧ｯ繧｢繝・・ | 蠕ｩ譌ｧ諤ｧ | Next.js莠呈鋤 | 繝ｭ繝・け繧､繝ｳ | 螳溯｣・㍼ |
|------|--------|------|-------------|--------|------------|-----------|--------|
| JSON (json) | 髢狗匱縺ｮ縺ｿ | 辟｡譁・| 繝輔ぃ繧､繝ｫ繧ｳ繝斐・ | 鬮・| 鬮・| 菴・| 貂・|
| SQLite (node:sqlite) | 鬮・| 辟｡譁・| DB繝輔ぃ繧､繝ｫ繧ｳ繝斐・ | 鬮・| 鬮假ｼ・ode 22+・・| 菴・| 貂・|
| PostgreSQL | 鬮・| 譛画侭譫縺ゅｊ | 繧ｵ繝ｼ繝薙せ萓晏ｭ・| 鬮・| 鬮・| 荳ｭ | 譛ｪ螳溯｣・|
| Vercel Blob | 荳ｭ | 譛画侭 | 繧ｵ繝ｼ繝薙せ萓晏ｭ・| 荳ｭ | 荳ｭ | 鬮・| 譛ｪ螳溯｣・|

**譛ｬ逡ｪ蛻､螳・** JSON 縺ｯ蜀崎ｵｷ蜍輔・蜀阪ョ繝励Ο繧､縺ｧ繝・・繧ｿ豸亥､ｱ縺吶ｋ繝帙せ繝・ぅ繝ｳ繧ｰ縺ｧ縺ｯ菴ｿ逕ｨ荳榊庄縲ＡSTORAGE_MODE=persistent`・・QLite・峨ｒ菴ｿ逕ｨ縺吶ｋ縺薙→縲・

## 繝・・繝ｭ繧､譁ｹ豕包ｼ・ocker謗ｨ螂ｨ・・

### 1. 迺ｰ蠅・､画焚繧定ｨｭ螳・

```env
NODE_ENV=production
STORAGE_MODE=persistent
DATABASE_URL=file:/app/data/kumamoto.db
PERSISTENT_DATA_PATH=/app/data
SITE_URL=https://your-domain.example
NEXT_PUBLIC_SITE_URL=https://your-domain.example
ADMIN_USERNAME=your-admin
ADMIN_PASSWORD=your-secure-password
SESSION_SECRET=your-32char-or-longer-secret
```

### 2. 繝薙Ν繝峨・襍ｷ蜍・

```bash
docker compose up -d --build
```

### 3. 繝・・繧ｿ遘ｻ陦鯉ｼ域里蟄労SON縺九ｉ・・

```bash
npm run storage:migrate -- --dry-run   # 遒ｺ隱・
npm run storage:migrate                # 螳溯｡・
```

### 4. 蜈ｬ髢句燕遒ｺ隱・

`/admin/readiness` 縺ｧ `PRODUCTION_READY` 繧堤｢ｺ隱阪・

## 繝帙せ繝・ぅ繝ｳ繧ｰ蛟呵｣懊→縺ｮ蟾ｮ蛻・

| 蛟呵｣・| 蟇ｾ蠢・| 霑ｽ蜉菴懈･ｭ |
|------|------|----------|
| VPS + Docker | 螳悟・蟇ｾ蠢・| 繝峨Γ繧､繝ｳ繝ｻHTTPS・・addy/nginx・芽ｨｭ螳・|
| Railway | 蟇ｾ蠢懷庄閭ｽ | 繝懊Μ繝･繝ｼ繝繝槭え繝ｳ繝郁ｨｭ螳・|
| Fly.io | 蟇ｾ蠢懷庄閭ｽ | volume 險ｭ螳・|
| Vercel | 髱樊耳螂ｨ | 豌ｸ邯壹ヵ繧｡繧､繝ｫ繧ｷ繧ｹ繝・Β縺ｪ縺・|

## HTTPS

Docker蜊倅ｽ薙〒縺ｯ HTTPS 譛ｪ險ｭ螳壹よ悽逡ｪ縺ｧ縺ｯ繝ｪ繝舌・繧ｹ繝励Ο繧ｭ繧ｷ・・addy, nginx, Cloudflare・峨〒 TLS 邨らｫｯ繧定｡後≧縲・

## 繧ｻ繧ｭ繝･繝ｪ繝・ぅ

- HttpOnly + Secure Cookie
- CSRF 繝医・繧ｯ繝ｳ・育ｮ｡逅・PI・・
- 繝ｭ繧ｰ繧､繝ｳ繝ｬ繝ｼ繝亥宛髯撰ｼ・蝗・15蛻・ｼ・
- 邂｡逅・判髱｢ noindex
- 邂｡逅・PI 繧ｭ繝｣繝・す繝･遖∵ｭ｢
