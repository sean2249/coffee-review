# Coffee Review

個人用咖啡杯測記錄工具，視覺呈現參考 **CoE (Cup of Excellence)** 國際精品咖啡比賽格式，但評分流程做了個人化客製：使用者直接決定總分，下方各項僅供對照印象。

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

-- 紀錄表
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
  defects text,
  notes text,
  coe_total numeric,
  coe_tier_id text,
  evaluations jsonb,
  observation jsonb,
  schema_version int,
  created_at timestamptz default now()
);

-- 開啟 RLS 並設定政策（個人用 = open access；多人用務必改）
alter table coffee.coffee_records enable row level security;
create policy "open access" on coffee.coffee_records
    for all using (true) with check (true);
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
*只要有 anon key 的人都能 CRUD 全部資料*。這對個人用工具是合理的；若有以下情況請強化：

- **準備分享頁面或公開部署**：把 RLS 政策改為 `auth.uid()` 比對，並啟用 Supabase Auth（Email / OAuth）。
- **多人共用一個 Supabase**：每筆記錄存 `user_id`，policy 限制 `user_id = auth.uid()`。

```sql
-- 多人版本範例
drop policy "open access" on coffee.coffee_records;
alter table coffee.coffee_records add column user_id uuid references auth.users(id);
create policy "own rows only" on coffee.coffee_records
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

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
