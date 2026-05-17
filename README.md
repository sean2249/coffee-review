# Coffee Review

[![Deploy](https://github.com/sean2249/coffee-review/actions/workflows/deploy.yml/badge.svg)](https://github.com/sean2249/coffee-review/actions/workflows/deploy.yml)
[![Lint](https://github.com/sean2249/coffee-review/actions/workflows/lint.yml/badge.svg)](https://github.com/sean2249/coffee-review/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

個人用咖啡杯測記錄工具，視覺呈現參考 **CoE (Cup of Excellence)** 國際精品咖啡比賽格式，但評分流程做了個人化客製：使用者直接決定總分，下方各項僅供對照印象。

**線上 Demo**：<https://sean2249.github.io/coffee-review/>

## Project Purpose

提供一個簡單實用的網頁，讓人可以記錄、評估、整理咖啡品飲心得，並匯出 Markdown 方便分享或存檔。

## 評分流程

1. **CoE 總分（主分數，74-96）** — 使用者**直接輸入**，不是用下方項目加總。
   - 透過「兩段式徽章選擇」介面：先點徽章 → 再點該區間的分數
   - 預設：選中「一般精品（便利商店等級）」徽章 + 分數 82
2. **8 項細評（參考分，4-8，預設 5）** — 風味、酸質、甜度、口感、尾韻、乾淨度、平衡、整體。**不影響總分**，純粹給使用者對照各面向印象。
3. **香氣 Aroma** — **觀察項，不計分**。可記錄乾香 / 濕香文字，並從風味輪勾選關鍵詞。
4. **瑕疵記錄 / 最終備註** — 自由文字。

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

> 每個非神級區間都包含「該區間上限 + 0.5」的天花板分數（例如 76.5 仍歸「劣」、77 起跳「凡」），用來表達「快要進入下一級」的細微感受。

## 功能

- 沖煮參數 / 咖啡資訊 欄位（沖煮參數預設收合）
- 風味輪漸進披露：點 L1 才展開 L2，點 L2 才展開 L3
- 口感重量/質地、尾韻長度/質地 多選
- 拍照辨識咖啡豆名（Tesseract.js 繁中 OCR）
- Supabase 雲端儲存：多筆記錄、可命名、可刪除
- Markdown 匯出 + 一鍵複製

## Supabase 雲端儲存設定

紀錄統一存在自家 Supabase。**若你的免費 project 已用盡，可以與其他專案共用**：所有資料放在獨立 schema 即可隔離。

### 1. Supabase Dashboard 操作

A. **建立 schema（與其他專案共用 Supabase 時必要）**

到 SQL Editor 執行：

```sql
-- gen_random_uuid() 需要 pgcrypto extension
create extension if not exists pgcrypto;

-- 建立獨立 schema
create schema if not exists coffee;

-- 開放 PostgREST 與 anon 角色存取（不開放就連不上）
grant usage on schema coffee to anon, authenticated, service_role;
grant all on all tables in schema coffee to anon, authenticated, service_role;
grant all on all sequences in schema coffee to anon, authenticated, service_role;
alter default privileges in schema coffee
    grant all on tables to anon, authenticated, service_role;
alter default privileges in schema coffee
    grant all on sequences to anon, authenticated, service_role;

-- 紀錄表（自己沖煮）
create table coffee.coffee_records (
  id uuid primary key default gen_random_uuid(),
  title text,
  name text,
  origin text,
  process text,
  roast text,
  grind text,
  water_temp text,
  ratio text,
  method text,
  extraction_time text,
  shop_name text,            -- 豆源店家
  defects text,
  notes text,
  coe_total numeric,
  coe_tier_id text,
  evaluations jsonb,
  observation jsonb,
  schema_version int,
  created_at timestamptz default now()
);
create index coffee_records_shop_name_idx on coffee.coffee_records (shop_name);

-- 紀錄表（店家探訪）
create table coffee.visit_records (
  id uuid primary key default gen_random_uuid(),
  title text,
  shop_name text,
  shop_location text,
  visit_date date,
  item_ordered text,
  price numeric,
  atmosphere_notes text,
  decor_notes text,
  service_notes text,
  photo_paths text[] default '{}',
  defects text,
  notes text,
  coe_total numeric,
  coe_tier_id text,
  evaluations jsonb,
  observation jsonb,
  schema_version int default 1,
  created_at timestamptz default now()
);

-- 開啟 RLS 並設定政策（個人用 = open access；多人用務必改）
alter table coffee.coffee_records enable row level security;
create policy "open access" on coffee.coffee_records
    for all using (true) with check (true);

alter table coffee.visit_records enable row level security;
create policy "open access" on coffee.visit_records
    for all using (true) with check (true);

-- Storage bucket：店家探訪照片
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', true)
on conflict (id) do nothing;
create policy "visit-photos read"   on storage.objects for select
    using (bucket_id = 'visit-photos');
create policy "visit-photos write"  on storage.objects for insert
    with check (bucket_id = 'visit-photos');
create policy "visit-photos update" on storage.objects for update
    using (bucket_id = 'visit-photos');
create policy "visit-photos delete" on storage.objects for delete
    using (bucket_id = 'visit-photos');
```

B. **曝光 schema 給 API**：Dashboard → Settings → API → 找 *Exposed schemas* → 加入 `coffee`。否則前端會 404。

C. **取得連線資訊**：Settings → API 複製 *Project URL* 與 *anon public key*。

### 2. 前端配置

連線資訊**不放在 repo**，避免公開暴露。兩種來源擇一：

**A. 本地開發 / 本機跑測試**

```bash
cp config.example.js config.js
# 編輯 config.js 填入 url + anonKey
```

`config.js` 已寫進 `.gitignore`，不會 commit。

**B. 部署到 GitHub Pages**

在 repo Settings 加 2 個 secret：

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_...`（或舊版 anon JWT）|

Settings → Pages → Source 選 **GitHub Actions**。

之後 push 到 `main` 時 `.github/workflows/deploy.yml` 會：
1. 用 secret 產生 `config.js`
2. 把整個專案 upload 為 Pages artifact
3. 自動部署

最終 URL 通常是 `https://<username>.github.io/<repo>/`。

> 進階：如果想 schema/table/bucket 也走 secret，把 workflow 裡的
> `config.js` 產生段加上對應的 secret 即可。

### ⚠️ 安全提醒

`anon key` 會出現在前端 JS bundle 中，任何能打開頁面的人都拿得到。上面的 `open access` 政策表示
*只要有 anon key 的人都能 CRUD 全部資料*。這對純私人、未公開部署的工具是合理的；只要頁面公開可
存取（例如 GitHub Pages），請改用下面的 **檢視/登入模式**。

## 檢視模式 + 登入寫入

前端內建兩種狀態：

- **檢視模式（預設）** — 任何人都能讀資料、匯出 Markdown，但 `儲存`／`刪除` 按鈕會隱藏。
- **登入模式** — 點頁首右上角 `登入`，用 Supabase Auth 的 Email + 密碼登入後解鎖寫入。session
  存在 `localStorage`，token 會自動 refresh，等同「記住登入」的 cookie 效果，下次造訪不必再登入。

要啟用這個機制，請到 Supabase Dashboard 跑下面的 SQL，把寫入 / 刪除限制給 `authenticated` 角色，
讀取維持公開：

```sql
-- coffee_records：讀公開、寫需登入
drop policy if exists "open access" on coffee.coffee_records;
create policy "public read" on coffee.coffee_records
    for select using (true);
create policy "auth write" on coffee.coffee_records
    for insert to authenticated with check (true);
create policy "auth update" on coffee.coffee_records
    for update to authenticated using (true) with check (true);
create policy "auth delete" on coffee.coffee_records
    for delete to authenticated using (true);

-- visit_records：同上
drop policy if exists "open access" on coffee.visit_records;
create policy "public read" on coffee.visit_records
    for select using (true);
create policy "auth write" on coffee.visit_records
    for insert to authenticated with check (true);
create policy "auth update" on coffee.visit_records
    for update to authenticated using (true) with check (true);
create policy "auth delete" on coffee.visit_records
    for delete to authenticated using (true);

-- visit-photos bucket：讀公開、寫/改/刪需登入
drop policy if exists "visit-photos read"   on storage.objects;
drop policy if exists "visit-photos write"  on storage.objects;
drop policy if exists "visit-photos update" on storage.objects;
drop policy if exists "visit-photos delete" on storage.objects;
create policy "visit-photos read" on storage.objects for select
    using (bucket_id = 'visit-photos');
create policy "visit-photos write" on storage.objects for insert to authenticated
    with check (bucket_id = 'visit-photos');
create policy "visit-photos update" on storage.objects for update to authenticated
    using (bucket_id = 'visit-photos');
create policy "visit-photos delete" on storage.objects for delete to authenticated
    using (bucket_id = 'visit-photos');
```

然後到 Dashboard 建立你的 admin 帳號：

1. **Authentication → Providers**：確認 *Email* provider 為 enabled。把 *Confirm email* 關掉
   會方便些（個人 admin 帳號）。
2. **Authentication → Users → Add user → Create new user**：輸入 email + password，勾選
   *Auto Confirm User*。
3. （建議）**Authentication → Providers → Email → Disable new user signups**：關掉註冊，避免
   有人用同一個 Supabase project 自己開帳號獲得寫入權限。

接著回到網頁，點右上角 `登入`，輸入剛才那組 email / 密碼即可解鎖儲存功能。

> **進階：多人共用 Supabase**
>
> 若每個使用者只能看自己的資料，把上面的 `for select using (true)` 改成
> `using (user_id = auth.uid())`，並在表上加 `user_id uuid references auth.users(id)` 欄位。

## GitHub OAuth + 白名單（推薦）

Email/密碼方案的問題是：anon key 公開，且 `to authenticated` 只擋「沒登入」，沒擋「誰能登入」
— 如果 Supabase project 開放註冊，任何人註冊就能寫入。下面的 GitHub OAuth + 白名單機制把
「能寫入的人」收斂到一份明確清單，註冊不註冊都不影響。

設計：登入流走 Supabase 的 GitHub OAuth provider，RLS 寫入政策改為檢查 `auth.uid()` 是否
在 `coffee.allowed_user_ids` 白名單裡。前端登入後會 probe 白名單，未授權的帳號直接被踢回
檢視模式，避免「假裝登入成功 + 後續 save 一直 403」的爛 UX。

### 1. 建 GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**：

- **Application name**：自取
- **Homepage URL**：你的網站 URL，例如 `https://你的帳號.github.io/coffee-review/`
- **Authorization callback URL**：**Supabase 的 callback**，不是你的網站！格式為
  `https://<你的-project-ref>.supabase.co/auth/v1/callback`
  （在 Supabase Dashboard → Project Settings → API 找得到 project ref）

建好之後拿 **Client ID** 與 **Client Secret**。

### 2. Supabase Dashboard 設定

- **Authentication → Providers → GitHub**：Enable，貼上剛剛的 Client ID / Secret，Save。
- **Authentication → URL Configuration**：
  - *Site URL*：`https://你的帳號.github.io/coffee-review/`
  - *Redirect URLs*：再加同樣的 URL 一次到 allowlist（前端顯式傳 `redirectTo` 時要在這裡才會放行）

### 3. SQL：建白名單表 + 收緊政策

到 SQL Editor 跑下面這段（會取代前一段「檢視模式 + 登入寫入」裡的 `auth write/update/delete`
政策）：

```sql
-- 白名單表 + 自讀政策（給前端 probe 用）+ FK cascade
create table coffee.allowed_user_ids (
    id uuid primary key references auth.users(id) on delete cascade,
    note text,
    added_at timestamptz default now()
);
alter table coffee.allowed_user_ids enable row level security;
-- 只開「讀自己那一筆」：沒人能列出別人，但能 probe 自己在不在
create policy "self read" on coffee.allowed_user_ids
    for select to authenticated using (id = (select auth.uid()));

-- coffee_records：取代原本的 to authenticated
drop policy if exists "auth write"  on coffee.coffee_records;
drop policy if exists "auth update" on coffee.coffee_records;
drop policy if exists "auth delete" on coffee.coffee_records;
create policy "whitelisted write" on coffee.coffee_records
    for insert to authenticated
    with check ((select auth.uid()) in (select id from coffee.allowed_user_ids));
create policy "whitelisted update" on coffee.coffee_records
    for update to authenticated
    using      ((select auth.uid()) in (select id from coffee.allowed_user_ids))
    with check ((select auth.uid()) in (select id from coffee.allowed_user_ids));
create policy "whitelisted delete" on coffee.coffee_records
    for delete to authenticated
    using      ((select auth.uid()) in (select id from coffee.allowed_user_ids));

-- visit_records：同上
drop policy if exists "auth write"  on coffee.visit_records;
drop policy if exists "auth update" on coffee.visit_records;
drop policy if exists "auth delete" on coffee.visit_records;
create policy "whitelisted write" on coffee.visit_records
    for insert to authenticated
    with check ((select auth.uid()) in (select id from coffee.allowed_user_ids));
create policy "whitelisted update" on coffee.visit_records
    for update to authenticated
    using      ((select auth.uid()) in (select id from coffee.allowed_user_ids))
    with check ((select auth.uid()) in (select id from coffee.allowed_user_ids));
create policy "whitelisted delete" on coffee.visit_records
    for delete to authenticated
    using      ((select auth.uid()) in (select id from coffee.allowed_user_ids));

-- visit-photos storage：同上
drop policy if exists "visit-photos write"  on storage.objects;
drop policy if exists "visit-photos update" on storage.objects;
drop policy if exists "visit-photos delete" on storage.objects;
create policy "visit-photos write" on storage.objects for insert to authenticated
    with check (
        bucket_id = 'visit-photos'
        and (select auth.uid()) in (select id from coffee.allowed_user_ids)
    );
create policy "visit-photos update" on storage.objects for update to authenticated
    using (
        bucket_id = 'visit-photos'
        and (select auth.uid()) in (select id from coffee.allowed_user_ids)
    );
create policy "visit-photos delete" on storage.objects for delete to authenticated
    using (
        bucket_id = 'visit-photos'
        and (select auth.uid()) in (select id from coffee.allowed_user_ids)
    );
```

### 4. 首次登入 → 加白名單

1. 開網頁，點右上角「登入」，按「用 GitHub 登入」走完授權
2. 回到網站時會看到 toast「此帳號未獲授權寫入，已切回檢視模式」— 預期行為，因為還沒加白名單
3. 回 Supabase SQL Editor 撈剛剛建立的 user UUID：

   ```sql
   select id, email, raw_user_meta_data->>'user_name' as github_login
   from auth.users
   order by created_at desc limit 5;
   ```

4. 把 UUID 插進白名單：

   ```sql
   insert into coffee.allowed_user_ids (id, note)
   values ('貼上你剛查到的 UUID', '你的 GitHub 帳號');
   ```

5. 再回網站點一次「用 GitHub 登入」（或重新整理）— 這次會成功進入編輯模式

> Email/密碼路徑仍可使用作為 fallback；若不需要，可把 modal 內的 email/password 表單拿掉。
>
> 本機開發（`python3 -m http.server`）無法跑 GitHub OAuth（callback URL 沒設本機），請在本機改用
> email/密碼登入測試。

## Using GitHub Pages

You can use GitHub Pages to create a simple, viewable website for your coffee reviews. The `index.html` in this repository is a starting point.

To set up GitHub Pages:
1.  Go to your repository on GitHub.
2.  Click on the "Settings" tab.
3.  In the left sidebar, click on "Pages".
4.  Under "Build and deployment", for the "Source", select "Deploy from a branch".
5.  Under "Branch", select `main` (or your default branch) and `/ (root)` folder, then click "Save".
6.  Your site will be published at an address like `https://sean2249.github.io/coffee-review/`.

You can edit the `index.html` file to add your reviews and they will appear on your new website.

## 開發者：Lint

PR 與 push 到 `main` 時，GitHub Actions 會跑 ESLint（JS）+ Stylelint（CSS）以避免語法錯誤或未定義變數進入正式環境（`.github/workflows/lint.yml`）。本地驗證：

```bash
npm install
npm run lint         # 跑全部
npm run lint:js      # 只跑 ESLint
npm run lint:css     # 只跑 Stylelint
```

規則設定刻意保守（ESLint `recommended` + Stylelint `recommended`），只擋真實錯誤、不挑剔風格。
