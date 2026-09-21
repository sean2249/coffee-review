# Coffee Review

[![CI](https://github.com/sean2249/coffee-review/actions/workflows/ci.yml/badge.svg)](https://github.com/sean2249/coffee-review/actions/workflows/ci.yml)
[![Deploy](https://github.com/sean2249/coffee-review/actions/workflows/deploy.yml/badge.svg)](https://github.com/sean2249/coffee-review/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

個人用咖啡記錄工具，視覺呈現參考 **CoE (Cup of Excellence)** 國際精品咖啡比賽格式，但評分流程做了個人化客製：使用者直接決定總分，下方各項僅供對照印象。

**線上**：<https://coffee.kiwi-walk.com/>（Cloudflare Access 後面，僅限 allow-list 內的帳號）

## 功能總覽

三個主要頁面，hash router 切換：

| 路由 | 頁面 | 說明 |
|------|------|------|
| `#/records` | 記錄列表 | 卡片清單 · 可依 沖煮/品鑑/杯測 · 店家 篩選 |
| `#/new` | 新增記錄 | 選擇 沖煮 / 品鑑 / 杯測 |
| `#/shops` | 店家管理 | CRUD 店家，點進去看相關記錄 |
| `#/cupping/<id>` | 沖煮詳情 | 唯讀（網址沿用舊名 cupping） |
| `#/tasting/<id>` | 品鑑詳情 | 唯讀 |
| `#/session/<id>` | 杯測詳情 | 一場多杯的排名與每杯評分 |
| `#/session/<id>/edit` | 杯測編輯 | 補分數、補豆子資訊、刪除整場 |
| `#/shops/<id>` | 店家詳情 | 顯示該店家的所有相關記錄（含杯測裡連到這家店的杯） |

## 評分流程

1. **CoE 總分（主分數，74-96）** — 使用者**直接輸入**，不是用下方項目加總。
   - 兩段式徽章選擇：先點徽章 → 再點該區間的分數
   - 預設：「卓越銅獎」徽章 + 分數 82
2. **8 項細評（參考分，4-8，預設 5）** — 風味、酸質、甜度、口感、尾韻、乾淨度、平衡、整體。**不影響總分**。
3. **香氣 Aroma** — **觀察項，不計分**。可記錄乾香 / 濕香文字，並從風味輪勾選關鍵詞。
4. **瑕疵記錄 / 最終備註** — 自由文字。

## 沖煮 vs 品鑑 vs 杯測

| | 沖煮 (cupping) | 品鑑 (tasting) | 杯測 (session) |
|---|---|---|---|
| 用途 | 自家沖煮一支豆的詳細評估 | 在咖啡店喝到的飲品記錄 | 一場同時評很多支豆，每杯以編號（手動 / 1, 2, 3 / A, B, C）識別 |
| 店家 | 選填（豆源） | 必填 | 每杯各自選填（豆源） |
| 沖煮參數 | 有（研磨 / 水溫 / 粉水比 ...） | 無 | 無 |
| 店家筆記 | 無 | 表單內載入該店 `shop_notes`（沒填過自動展開、填過收合） | 無 |
| 評分系統 | CoE 8 項 + 風味輪 | 同左 | 每杯同左；沒點過分數 = 未評分，不列入排名 |
| 存檔後 | 唯讀 | 唯讀 | 可編輯、可刪除整場 |

內部 key `cupping` / 表名 `cupping_records` 沿用舊名（畫面上叫「沖煮」），不需遷移資料。

## 徽章 / 分數區間表

| 圓圈 | 方括號 | 全稱 | 區間 | 敘述 |
|------|--------|------|------|------|
| 劣 | [ 瑕疵 ] | 風味平淡 | ≤ 76 | 平淡無亮點，或帶明顯瑕疵 |
| 凡 | [ 普羅 ] | 商業風味 | 77-79 | 普羅大眾的日常選擇，缺乏精品層次 |
| 銅 | [ 銅牌 ] | 卓越銅獎 | 80-82 | 合格的精品咖啡，適合日常品飲 |
| 銀 | [ 銀牌 ] | 優秀銀獎 | 83-85 | 平衡乾淨、值得反覆品飲的精品 |
| 金 | [ 金牌 ] | 傑出金獎 | 86-88 | 風味飽滿、層次豐富的傑作 |
| 鉑 | [ 鉑金 ] | 大師鉑金 | 89-91 | 結構完整、令人驚艷的大師之作 |
| 神 | [ 典藏 ] | 稀世絕品 | ≥ 92 | 可遇不可求的競標級稀世絕品 |

## Cloudflare 架構

整個 app 是**一支 Worker**：同時服務 `public/` 的靜態檔與 `/api/*`。
前端與 API 同源，所以沒有 CORS、沒有 base URL、也沒有任何憑證留在瀏覽器裡。

```
瀏覽器 ──► Cloudflare Access（Google 登入，在邊緣就擋掉未認證的請求）
            │
            └─► Worker（Hono）
                  ├─ /api/*   → D1（手寫 SQL，每個查詢都帶 and user_id = ?）
                  ├─ /api/places/* → Google Places API（key 只在 Worker）
                  └─ 其餘      → Workers Static Assets（public/，SPA fallback）
```

| 元件 | 用途 |
|---|---|
| Workers | API + 靜態站，單一部署 |
| D1 | 資料庫（SQLite）。schema 在 `migrations/`，由 `wrangler d1 migrations apply` 套用 |
| Workers Static Assets | `public/` 直接上傳，`run_worker_first: ["/api/*"]` 讓 Worker 只看見 API 路徑 |
| Cloudflare Access | 登入。Google IdP + email allow-list，Worker 再驗一次 JWT（fail closed） |
| Rate Limiting binding | `/api/places/*` 依 user_id 限流 |
| 自訂域名 | `coffee.kiwi-walk.com`，`workers_dev: false` |

### 資料隔離

Supabase 的 RLS 換成 **Worker 端強制**：`requireAccess` 驗完 Access JWT 之後，
`withUser` 把 email 解析成 `users.id`，每一個查詢都寫 `and user_id = ?`。
擁有者欄位（`user_id` / `created_by`）一律由 Worker 蓋上，前端送什麼都會被
`src/worker/lib/columns.ts` 的白名單濾掉。

`shops` 仍是共享 registry（任何登入者可讀、可新增、可同步；只有建立者可刪），
記錄、場次、杯與 `shop_notes` 都是每人隔離。`test/worker/` 對每一張擁有表
都有一個「看不到別人的資料」案例。

### Schema

**真實來源是 `migrations/0001_init.sql`**（不是這份 README）。Postgres → SQLite 的
三條翻譯規則：

- `uuid` → `text`（id 由 Worker 或前端的 `crypto.randomUUID()` 產生）
- `timestamptz` → `text`，一律 ISO-8601 UTC 帶毫秒與 `Z`（`app.js` 用 `localeCompare`
  排序 `created_at`，格式一混就排錯）
- `text[]` / `jsonb` → `text` 存 JSON 字面值，配 `json_valid()` 約束。編解碼只在
  `src/worker/lib/json.ts` 做，wire 上的形狀與 PostgREST 相同，所以 `app.js` 讀
  `record.defects_tags` 仍然拿到陣列

改欄位時：`migrations/` 加一個新的 `NNNN_*.sql`（不要改既有的），並同步
`src/worker/lib/columns.ts` 的白名單與 `src/shared/json-columns.js` 的清單。

### Trigger 為什麼不在 migrations/

D1 的 `/query` API 端點解析不了 `create trigger … begin … end;`（`begin…end` 裡的
分號會讓它回 `incomplete input`），而 `wrangler d1 migrations apply` 只走那個端點。
`d1 execute --file` 走的是 `/import`，可以。

所以 trigger 放在 **`schema/triggers.sql`**，用 `d1 execute --file` 套用，
本機的 `db:migrate:*`、vitest 的 worker setup、`deploy.yml` 三處都跑同一份檔案，
不會 drift。檔案裡一律用 `create trigger if not exists`，重跑安全；
**一個 trigger 一條語句，不要在那個檔案裡做語句切割**。

## 本機開發

```bash
npm install
cp .dev.vars.example .dev.vars     # 填 DEV_USER_EMAIL（+ 選填 GOOGLE_MAPS_API_KEY）
npm run db:migrate:local           # 建好本地 D1（migrations + schema/triggers.sql）
npm run dev                        # wrangler dev → http://localhost:8787
```

`wrangler dev` 同時服務靜態檔與 API，沒有第二個 dev server，也沒有 build step。

本機沒有 Cloudflare Access：`ACCESS_TEAM_DOMAIN` 與 `ACCESS_AUD` 都空時
`requireAccess` 走 open 分支，身分改由 `.dev.vars` 的 `DEV_USER_EMAIL` 提供。
**沒設就回 503** —— 不會無聲地跑成無主資料。只要 `ACCESS_AUD` 有值，
`DEV_USER_EMAIL` 就會被硬性忽略，所以它不可能降級正式環境。

```bash
npm run lint         # eslint + stylelint
npm run typecheck    # tsc（只涵蓋 Worker）
npm test             # vitest：app（jsdom）+ worker（workerd + 本地 D1）兩個 project
```

## 部署

### 一次性設定

**0. D1**

```bash
npx wrangler d1 create coffee-review   # 已建好；database_id 已在 wrangler.jsonc
npm run db:migrate:remote              # migrations + schema/triggers.sql
```

Windows 的 PowerShell 若因執行原則擋下 `npx.ps1`，改用 `npx.cmd` / `npm.cmd`。

**1. Cloudflare Access（必須在第一次部署之前做完）**

Zero Trust → Access → Applications → Self-hosted，網域填 `coffee.kiwi-walk.com`，
IdP 選 Google（client ID / secret 在 Google Cloud Console 建，redirect URI 指向
`https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`），Policy 加一條
Allow ← 你的 email。**一條 Bypass policy 都不要建** —— 這個 app 沒有任何機器寫入者。

建議再加一個 Worker 層級的 Access destination（`{"type":"worker","worker_id":…}`），
連 preview 與 `workers.dev` 一起關掉，當作 `workers_dev: false` 之外的平台層保險。

抄下 **team domain** 與 **Application Audience (AUD) tag**。

**2. Google Places**

Google Cloud Console 啟用 **Places API (New)**，建一把 key，並**設每日配額上限**
（quota cap）—— 這是帳單的硬底線，程式碼擋不住的最後一道。

```bash
npx wrangler secret put GOOGLE_MAPS_API_KEY
```

**3. GitHub**

Settings → Secrets and variables → Actions：

| 類型 | 名稱 | 內容 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | 「Edit Cloudflare Workers」範本 + D1:Edit；首次建立自訂域名還需要該 zone 的 DNS:Edit |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 後台右側的 Account ID |
| Variable | `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| Variable | `ACCESS_AUD` | 上面抄下的 AUD tag（64 位 hex） |

`ACCESS_*` 刻意是 variables 而不是 secrets：它們不敏感，而且放 variables 才能在
workflow 裡檢查非空。**兩個都空時 Worker 會走 open 分支 = 全站無防護**，所以
`deploy.yml` 在部署前硬性檢查，缺一個就 fail。

### 日常

push 到 `main` 即部署：`deploy.yml` 會先跑 typecheck / lint / test，再套用 D1
migration，最後 `wrangler deploy --var ACCESS_…`。順序是硬性的 —— migration 必須
先於 deploy，否則新 Worker 會打到舊 schema。

**不要**在 Cloudflare 後台把這支 Worker 連上 GitHub repo（Workers Builds）：
那會變成第二個部署來源，和 GitHub Actions 互相覆蓋。

### 憑證盤點

瀏覽器端**沒有任何憑證**。Supabase URL + anon key 與 Google Maps key 都已退場
（後者原本只靠 HTTP referrer 限制保護，而 referrer 是瀏覽器自願送出的標頭、
可任意偽造，不是安全邊界）。

`GOOGLE_MAPS_API_KEY` 是唯一的 Worker secret。`.dev.vars` 只在本機、已 gitignore。

## 從 Supabase 遷移（一次性）

```bash
# 1. 匯出。service role key 只活在這一次 shell 裡，絕不進 repo / GitHub Secrets
SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
    node scripts/export-supabase.mjs        # → migration/dump.json

# 2. 先對本地 D1 演練
npm run db:migrate:local
node scripts/import-d1.mjs --local          # → migration/seed.sql，再灌進去
node scripts/verify-migration.mjs --local

# 3. 確認全綠之後對正式環境重放同一份 SQL
npm run db:migrate:remote
node scripts/import-d1.mjs --remote
node scripts/verify-migration.mjs --remote
```

`migration/` 已 gitignore。匯入全部是 `insert or replace`，跑到一半斷掉直接重跑即可。

`users` 表取代 `auth.users`，沿用 Supabase 原本的 UUID，所以既有資料的 `user_id`
一列都不用改。驗收腳本會檢查筆數、JSON 欄位合法性、JSON 值抽樣深度比對、
`user_id` 孤兒、時間格式，以及杯編號的大小寫碰撞。

人工驗收：開 `#/records` 對筆數，各開一個場次、一家有筆記的店、一筆有
`defects_tags` 與風味輪的記錄。

遷移完成並實際用過一陣子之後再收尾：停用 Supabase 專案、輪替 service role key、
把 Google Maps key 的 HTTP referrer 限制改掉（呼叫方變成 Worker，沒有 referer）。

## Lint 規則

規則設定刻意保守（ESLint `recommended` + Stylelint `recommended` + typescript-eslint
`recommended`），只擋真實錯誤、不挑剔風格。
