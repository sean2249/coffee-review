# Coffee Review

[![Deploy](https://github.com/sean2249/coffee-review/actions/workflows/deploy.yml/badge.svg)](https://github.com/sean2249/coffee-review/actions/workflows/deploy.yml)
[![Lint](https://github.com/sean2249/coffee-review/actions/workflows/lint.yml/badge.svg)](https://github.com/sean2249/coffee-review/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

個人用咖啡記錄工具，視覺呈現參考 **CoE (Cup of Excellence)** 國際精品咖啡比賽格式，但評分流程做了個人化客製：使用者直接決定總分，下方各項僅供對照印象。

**線上 Demo**：<https://sean2249.github.io/coffee-review/>

## 功能總覽

三個主要頁面，hash router 切換：

| 路由 | 頁面 | 說明 |
|------|------|------|
| `#/records` | 記錄列表 | 卡片清單 · 可依 杯測/品鑑 · 店家 篩選 |
| `#/new` | 新增記錄 | 切換 杯測 / 品鑑 兩種模式 |
| `#/shops` | 店家管理 | CRUD 店家，點進去看相關記錄 |
| `#/cupping/<id>` | 杯測詳情 | 同時也是編輯介面 |
| `#/tasting/<id>` | 品鑑詳情 | 同時也是編輯介面 |
| `#/shops/<id>` | 店家詳情 | 顯示該店家的所有相關記錄 |

## 評分流程

1. **CoE 總分（主分數，74-96）** — 使用者**直接輸入**，不是用下方項目加總。
   - 兩段式徽章選擇：先點徽章 → 再點該區間的分數
   - 預設：「卓越銅獎」徽章 + 分數 82
2. **8 項細評（參考分，4-8，預設 5）** — 風味、酸質、甜度、口感、尾韻、乾淨度、平衡、整體。**不影響總分**。
3. **香氣 Aroma** — **觀察項，不計分**。可記錄乾香 / 濕香文字，並從風味輪勾選關鍵詞。
4. **瑕疵記錄 / 最終備註** — 自由文字。

## 杯測 vs 品鑑

| | 杯測 (cupping) | 品鑑 (tasting) |
|---|---|---|
| 用途 | 自家沖煮的詳細評估 | 在咖啡店喝到的飲品記錄 |
| 店家 | 選填（豆源） | 必填 |
| 沖煮參數 | 有（研磨 / 水溫 / 粉水比 ...） | 無 |
| 探訪心得 | 無 | 有（氛圍 / 裝潢 / 服務 chip + 備註） |
| 評分系統 | CoE 8 項 + 風味輪 | 同左 |

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

## Supabase 雲端儲存設定

紀錄統一存在自家 Supabase。**若你的免費 project 已用盡，可以與其他專案共用**：所有資料放在獨立 schema 即可隔離。

### 1. Supabase Dashboard 操作

A. **建立 schema 與資料表**

到 SQL Editor 執行：

```sql
-- gen_random_uuid() 需要 pgcrypto extension
create extension if not exists pgcrypto;

-- 建立獨立 schema
create schema if not exists coffee;

-- 開放 PostgREST 與 anon 角色存取
grant usage on schema coffee to anon, authenticated, service_role;
grant all on all tables    in schema coffee to anon, authenticated, service_role;
grant all on all sequences in schema coffee to anon, authenticated, service_role;
alter default privileges in schema coffee
    grant all on tables to anon, authenticated, service_role;
alter default privileges in schema coffee
    grant all on sequences to anon, authenticated, service_role;

-- shops — 店家主表
create table coffee.shops (
    id                      uuid primary key default gen_random_uuid(),
    name                    text not null unique,
    location                text,
    intro                   text,
    google_place_id         text unique,
    lat                     numeric,
    lng                     numeric,
    google_data_fetched_at  timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);
create index shops_name_idx on coffee.shops(lower(name));
create index shops_google_place_id_idx on coffee.shops(google_place_id);

create or replace function coffee.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger shops_touch_updated_at
    before update on coffee.shops
    for each row execute function coffee.touch_updated_at();

-- cupping_records — 杯測 (自家沖煮 / 豆評估)。shop_id 選填。
-- bean_type: 'single' (單品) | 'blend' (配方豆)
--   配方豆時 origin / process 留空，改用 blend_composition 描述組成。
create table coffee.cupping_records (
    id                 uuid primary key default gen_random_uuid(),
    shop_id            uuid references coffee.shops(id) on delete set null,
    title              text,
    bean_name          text,
    bean_type          text check (bean_type in ('single', 'blend')),
    origin             text,
    process            text,
    blend_composition  text,
    roast              text,
    grind              text,
    water_temp         text,
    ratio              text,
    method             text,
    extraction_time    text,
    defects            text,
    notes              text,
    coe_total          numeric,
    coe_tier_id        text,
    evaluations        jsonb not null default '{}'::jsonb,
    observation        jsonb not null default '{}'::jsonb,
    schema_version     int   not null default 2,
    created_at         timestamptz not null default now()
);
create index cupping_shop_id_idx    on coffee.cupping_records(shop_id);
create index cupping_created_at_idx on coffee.cupping_records(created_at desc);

-- tasting_records — 品鑑 (店家飲品)。shop_id 必填 + cascade delete。
-- bean_type: 'single' (單品) | 'blend' (配方豆)
create table coffee.tasting_records (
    id                uuid primary key default gen_random_uuid(),
    shop_id           uuid not null references coffee.shops(id) on delete cascade,
    title             text,
    visit_date        date,
    item_ordered      text,
    price             numeric,
    bean_name         text,
    bean_type         text check (bean_type in ('single', 'blend')),
    brewing_method    text,
    atmosphere_tags   text[] not null default '{}',
    decor_tags        text[] not null default '{}',
    service_tags      text[] not null default '{}',
    atmosphere_notes  text,
    decor_notes       text,
    service_notes     text,
    defects           text,
    notes             text,
    coe_total         numeric,
    coe_tier_id       text,
    evaluations       jsonb not null default '{}'::jsonb,
    observation       jsonb not null default '{}'::jsonb,
    schema_version    int   not null default 2,
    created_at        timestamptz not null default now()
);
create index tasting_shop_id_idx    on coffee.tasting_records(shop_id);
create index tasting_created_at_idx on coffee.tasting_records(created_at desc);

-- RLS — 個人用 = open access；多人用務必改
alter table coffee.shops             enable row level security;
alter table coffee.cupping_records   enable row level security;
alter table coffee.tasting_records   enable row level security;
create policy "open access" on coffee.shops           for all using (true) with check (true);
create policy "open access" on coffee.cupping_records for all using (true) with check (true);
create policy "open access" on coffee.tasting_records for all using (true) with check (true);
```

B. **曝光 schema 給 API**：Dashboard → Settings → API → 找 *Exposed schemas* → 加入 `coffee`。

C. **取得連線資訊**：Settings → API 複製 *Project URL* 與 *anon public key*。

D. **已部署的舊資料庫升級 (schema v1 → v2)**：若你的 schema 已經跑過 v1，請在 SQL Editor 執行：

```sql
alter table coffee.cupping_records
    add column if not exists bean_type         text check (bean_type in ('single', 'blend')),
    add column if not exists blend_composition text;

alter table coffee.tasting_records
    add column if not exists bean_type text check (bean_type in ('single', 'blend'));
```

舊紀錄 `bean_type` 會是 `NULL`；下次在 App 編輯儲存時會被要求補選類型。

E. **升級到 v3（瑕疵 chip + 標籤系統）**：在 SQL Editor 執行：

```sql
-- #41: defects 拆 chip + 自由備註
alter table coffee.cupping_records
    add column if not exists defects_tags text[] not null default '{}';
alter table coffee.tasting_records
    add column if not exists defects_tags text[] not null default '{}';

-- #27: 標籤系統
create table if not exists coffee.tags (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,
    color       text not null default '#6c757d',
    icon        text,
    is_builtin  boolean not null default false,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now()
);
alter table coffee.tags enable row level security;
create policy "open access" on coffee.tags for all using (true) with check (true);
grant all on coffee.tags to anon, authenticated, service_role;

alter table coffee.cupping_records
    add column if not exists tag_ids uuid[] not null default '{}';
alter table coffee.tasting_records
    add column if not exists tag_ids uuid[] not null default '{}';

create index if not exists cupping_tag_ids_idx
    on coffee.cupping_records using gin(tag_ids);
create index if not exists tasting_tag_ids_idx
    on coffee.tasting_records using gin(tag_ids);

-- 預設 schema_version 升到 3（app 仍會在 payload 顯式寫入 3，default 主要影響直接 INSERT 的人）
alter table coffee.cupping_records alter column schema_version set default 3;
alter table coffee.tasting_records alter column schema_version set default 3;

-- 內建標籤 seed（is_builtin 僅為標記，仍可被刪除）
insert into coffee.tags (id, name, color, icon, is_builtin, sort_order) values
    ('11111111-1111-1111-1111-000000000001', '最愛',   '#e0245e', 'bi-star-fill',        true, 1),
    ('11111111-1111-1111-1111-000000000002', '想再試', '#1d9bf0', 'bi-arrow-repeat',     true, 2),
    ('11111111-1111-1111-1111-000000000003', '不推薦', '#71767b', 'bi-hand-thumbs-down', true, 3),
    ('11111111-1111-1111-1111-000000000004', '已下單', '#00ba7c', 'bi-bag-check-fill',   true, 4)
on conflict (id) do nothing;
```

舊紀錄 `defects_tags` / `tag_ids` 預設為空陣列，向前相容。

**舊資料庫追加 Google Places 欄位**（已建表者，於 SQL Editor 執行）：

```sql
alter table coffee.shops
    add column if not exists google_place_id text unique,
    add column if not exists lat numeric,
    add column if not exists lng numeric,
    add column if not exists google_data_fetched_at timestamptz;
create index if not exists shops_google_place_id_idx on coffee.shops(google_place_id);
```

### 2. 前端配置

連線資訊**不放在 repo**。兩種來源擇一：

**A. 本地開發**

```bash
cp config.example.js config.js
# 編輯 config.js 填入 url + anonKey
```

`config.js` 已寫進 `.gitignore`，不會 commit。

**B. 部署到 GitHub Pages**

在 repo Settings 加以下 secret（前兩個必要，第三個啟用 Google Places 補完才需要）：

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console 啟用 Places API (New) + Maps JavaScript API 後產生的金鑰，**建議設 HTTP referrer 限制**為部署網址 + `http://localhost:*` |

Settings → Pages → Source 選 **GitHub Actions**。
`.github/workflows/deploy.yml` 會在 push `main` 時用 secret 產生 `config.js` 後部署。

### ⚠️ 安全提醒

`anon key` 會出現在前端 JS bundle，任何能打開頁面的人都拿得到。上面的 `open access` 政策表示
*只要有 anon key 的人都能 CRUD 全部資料*。這對個人用工具是合理的；若要分享公開部署或多人共用，請改用 `auth.uid()` 比對 + Supabase Auth。

## 開發者：Lint

```bash
npm install
npm run lint         # 跑全部
npm run lint:js      # 只跑 ESLint
npm run lint:css     # 只跑 Stylelint
```

規則設定刻意保守（ESLint `recommended` + Stylelint `recommended`），只擋真實錯誤、不挑剔風格。
