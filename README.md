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

-- 開放 PostgREST 存取。**刻意不含 anon** —— 本 schema 的資料一律需要登入，
-- 連 schema usage 都不給，未登入者連表都解析不到（RLS 之外的第二道防線）。
-- 日後新增表/序列也不會漏掉：default privileges 同樣不含 anon。
grant usage on schema coffee to authenticated, service_role;
grant all on all tables    in schema coffee to authenticated, service_role;
grant all on all sequences in schema coffee to authenticated, service_role;
alter default privileges in schema coffee
    grant all on tables to authenticated, service_role;
alter default privileges in schema coffee
    grant all on sequences to authenticated, service_role;

-- shops — 店家公共 registry（所有登入者共享）
-- 身分由 google_place_id 定義；name / location / lat / lng 全部是 Google Places 的
-- 投影，App 不提供手動輸入，只能透過「從 Google 重新同步」更新。
-- name 刻意「不」設 unique：不同分店本來就可能同名（例：星巴克）。
create table coffee.shops (
    id                      uuid primary key default gen_random_uuid(),
    name                    text not null,
    location                text,
    google_place_id         text not null unique,
    lat                     numeric,
    lng                     numeric,
    google_data_fetched_at  timestamptz,
    created_by              uuid references auth.users(id),   -- 建立者註記，不參與存取控制
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);
create index shops_name_idx on coffee.shops(lower(name));
-- google_place_id 的 unique 已自動建索引，不需額外 create index

-- 店家身分不可變：擋掉「把一家店偷換成另一個 Google 地點」。
create or replace function coffee.shops_freeze_place_id()
returns trigger language plpgsql
set search_path = ''      -- 不碰任何表，固定空 search_path（Supabase linter 要求）
as $$
begin
    if new.google_place_id is distinct from old.google_place_id then
        raise exception 'google_place_id is immutable';
    end if;
    return new;
end;
$$;
create trigger shops_freeze_place_id
    before update on coffee.shops
    for each row execute function coffee.shops_freeze_place_id();

create or replace function coffee.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger shops_touch_updated_at
    before update on coffee.shops
    for each row execute function coffee.touch_updated_at();

-- cupping_records — 杯測 (自家沖煮 / 豆評估)。shop_id 選填。私有：只有 owner 讀得到。
-- bean_type: 'single' (單品) | 'blend' (配方豆)
--   配方豆時 origin / process 留空，改用 blend_composition 描述組成。
create table coffee.cupping_records (
    id                 uuid primary key default gen_random_uuid(),
    -- restrict：店家與記錄是兩張獨立的表，刪店家不得改動或摧毀任何人的記錄
    shop_id            uuid references coffee.shops(id) on delete restrict,
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
    schema_version     int   not null default 3,
    user_id            uuid references auth.users(id),
    created_at         timestamptz not null default now()
);
create index cupping_shop_id_idx    on coffee.cupping_records(shop_id);
create index cupping_created_at_idx on coffee.cupping_records(created_at desc);

-- tasting_records — 品鑑「這次喝的那一杯」。shop_id 必填。私有：只有 owner 讀得到。
-- 店家體驗（氛圍 / 設施 / 風格 / 材質 / 服務 / 餐點 / 飲料）不在這裡，見 shop_notes。
-- bean_type: 'single' (單品) | 'blend' (配方豆)
create table coffee.tasting_records (
    id                uuid primary key default gen_random_uuid(),
    shop_id           uuid not null references coffee.shops(id) on delete restrict,
    title             text,
    visit_date        date,
    item_ordered      text,
    price             numeric,
    bean_name         text,
    bean_type         text check (bean_type in ('single', 'blend')),
    brewing_method    text,
    defects           text,
    notes             text,
    coe_total         numeric,
    coe_tier_id       text,
    evaluations       jsonb not null default '{}'::jsonb,
    observation       jsonb not null default '{}'::jsonb,
    schema_version    int   not null default 5,
    user_id           uuid references auth.users(id),
    created_at        timestamptz not null default now()
);
create index tasting_shop_id_idx    on coffee.tasting_records(shop_id);
create index tasting_created_at_idx on coffee.tasting_records(created_at desc);

-- shop_notes — 我對這家店的個人筆記（介紹 + 店家體驗）。每人每店一筆，完全私有。
-- 店家本身是共享的，「對店家的評價」不是 —— 所以這些欄位不放在 shops 上。
create table coffee.shop_notes (
    id                     uuid primary key default gen_random_uuid(),
    shop_id                uuid not null references coffee.shops(id) on delete cascade,
    user_id                uuid not null references auth.users(id),
    intro                  text,                                -- 個人介紹 / 備註
    ambience_axes          jsonb  not null default '{}'::jsonb, -- {quiet_lively, bright_dim, spacious_cozy} 各 1-3 或 null
    facilities             text[] not null default '{}',        -- 設施多選
    space_style            text,                                -- 空間風格 (單選，可自訂)
    space_materials        text[] not null default '{}',        -- 材質多選
    service_ratings        jsonb  not null default '{}'::jsonb, -- {greeting, speed} 各 1-3 或 null
    menu_food              text[] not null default '{}',        -- 餐點 (可自訂)
    drink_types            text[] not null default '{}',        -- 飲料類型 (可自訂)
    ambience_notes         text,
    style_notes            text,
    service_notes          text,
    -- 舊版多選標籤 (tasting schema_version <= 3 遷移而來)：唯讀保留
    legacy_atmosphere_tags text[] not null default '{}',
    legacy_decor_tags      text[] not null default '{}',
    legacy_service_tags    text[] not null default '{}',
    schema_version         int    not null default 1,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    unique (shop_id, user_id)
);
create index shop_notes_shop_id_idx on coffee.shop_notes(shop_id);
create trigger shop_notes_touch_updated_at
    before update on coffee.shop_notes
    for each row execute function coffee.touch_updated_at();

-- RLS — 每列隔離。記錄與筆記只有 owner 讀得到；店家是共享 registry。
-- anon 一律無權：上面的 grant 區塊本來就沒給它任何權限，policy 再擋一層。
alter table coffee.shops           enable row level security;
alter table coffee.shop_notes      enable row level security;
alter table coffee.cupping_records enable row level security;
alter table coffee.tasting_records enable row level security;

-- 店家：所有登入者可讀、可新增、可更新（更新的唯一路徑是「從 Google 重新同步」，
-- 寫進去的值來自 Places API 而非使用者輸入）。只有建立者可刪，且上面的 FK
-- restrict 會讓還有記錄的店家刪不掉。
create policy "shops readable"   on coffee.shops for select to authenticated using (true);
create policy "shops insertable" on coffee.shops for insert to authenticated with check (auth.uid() is not null);
create policy "shops updatable"  on coffee.shops for update to authenticated using (true) with check (true);
create policy "shops deletable"  on coffee.shops for delete to authenticated using (created_by = auth.uid());

-- 記錄與筆記：只有 owner。
create policy "own notes"   on coffee.shop_notes      for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own cupping" on coffee.cupping_records for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasting" on coffee.tasting_records for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
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
create policy "tags readable" on coffee.tags for select to authenticated using (true);
grant all on coffee.tags to authenticated, service_role;

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
-- google_place_id 的 unique 已自動建索引，不需額外 create index
```

F. **升級到 v4（探訪心得重構：氣氛量表 / 設施 / 風格 / 材質 / 服務量表）**：在 SQL Editor 執行：

```sql
alter table coffee.tasting_records
    add column if not exists ambience_axes   jsonb  not null default '{}'::jsonb,
    add column if not exists facilities      text[] not null default '{}',
    add column if not exists space_style     text,
    add column if not exists space_materials text[] not null default '{}',
    add column if not exists service_ratings jsonb  not null default '{}'::jsonb,
    add column if not exists menu_food       text[] not null default '{}',
    add column if not exists drink_types     text[] not null default '{}';

alter table coffee.tasting_records alter column schema_version set default 4;
```

舊欄位 `atmosphere_tags` / `decor_tags` / `service_tags` 保留為 legacy（唯讀）：既有紀錄的標籤
仍會在詳情頁以「（舊版）」標示顯示，新紀錄則改寫入上述 v4 欄位、不再寫入這三欄。

G. **升級到多租戶第一階段（#78：加 `user_id`）**：在 SQL Editor 執行：

> ⚠️ 這段 `alter table` 必須在**部署新前端之前**先跑。前端 insert 會帶上 `user_id`，
> 欄位不存在時 PostgREST 會拒絕所有新增。此欄為 nullable、additive，提前套用對現行版本零影響。

```sql
alter table coffee.cupping_records add column if not exists user_id uuid references auth.users(id);
alter table coffee.tasting_records add column if not exists user_id uuid references auth.users(id);
alter table coffee.shops           add column if not exists user_id uuid references auth.users(id);
```

回填既有資料給某帳號（該帳號需先用 Google 登入過一次，`auth.users` 才有列）：

```sql
update coffee.cupping_records c set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and c.user_id is null;
update coffee.tasting_records t set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and t.user_id is null;
update coffee.shops s set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and s.user_id is null;
```

> RLS 本階段**仍維持 open access**（未登入照樣可讀寫）；真正的每列存取隔離見下方 section H。

H. **升級到多租戶第二階段（RLS 收緊 + 店家/品鑑拆表）**

這一刀做三件事：(1) 每列存取隔離 —— 未登入什麼都讀不到；(2) `shops` 變成純 Google Places
投影的公共 registry，個人標註搬到新的 `shop_notes`；(3) 店家體驗欄位從 `tasting_records`
搬到 `shop_notes`（每人每店一筆，而不是每次到訪一筆）。

> ⚠️ **執行順序很重要**。additive 的部分（H-1 ~ H-3）可以先跑；`drop column` 與
> RLS 收緊（H-4 ~ H-6）**必須等新前端部署完**才能執行 —— 舊前端還會送已刪除的欄位，
> 提前跑會讓線上版所有寫入被 PostgREST 拒絕、所有讀取變空白。

**H-1 建表 + 備份**

```sql
create table if not exists coffee.shop_notes (
    id                     uuid primary key default gen_random_uuid(),
    shop_id                uuid not null references coffee.shops(id) on delete cascade,
    user_id                uuid not null references auth.users(id),
    intro                  text,
    ambience_axes          jsonb  not null default '{}'::jsonb,
    facilities             text[] not null default '{}',
    space_style            text,
    space_materials        text[] not null default '{}',
    service_ratings        jsonb  not null default '{}'::jsonb,
    menu_food              text[] not null default '{}',
    drink_types            text[] not null default '{}',
    ambience_notes         text,
    style_notes            text,
    service_notes          text,
    legacy_atmosphere_tags text[] not null default '{}',
    legacy_decor_tags      text[] not null default '{}',
    legacy_service_tags    text[] not null default '{}',
    schema_version         int    not null default 1,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    unique (shop_id, user_id)
);
create index if not exists shop_notes_shop_id_idx on coffee.shop_notes(shop_id);
create trigger shop_notes_touch_updated_at
    before update on coffee.shop_notes
    for each row execute function coffee.touch_updated_at();

-- drop column 前的安全網，驗收完再手動清掉
create table coffee._backup_tasting as select * from coffee.tasting_records;
create table coffee._backup_shops   as select * from coffee.shops;
```

**H-2 回填遺漏的 owner**（未登入時新增的列 `user_id` 是 null，收緊後會對所有人隱形）

```sql
update coffee.cupping_records c set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and c.user_id is null;
update coffee.tasting_records t set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and t.user_id is null;
update coffee.shops s set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and s.user_id is null;
-- 驗證：三張表都應該回 0
select count(*) from coffee.cupping_records where user_id is null;
select count(*) from coffee.tasting_records where user_id is null;
select count(*) from coffee.shops           where user_id is null;
```

**H-3 把店家體驗搬進 shop_notes**

沒有店家體驗資料的品鑑不會產生筆記。同一個 (店家, 使用者) 有多筆品鑑時，取最新一筆。

```sql
insert into coffee.shop_notes (
    shop_id, user_id, ambience_axes, facilities, space_style, space_materials,
    service_ratings, menu_food, drink_types, ambience_notes, style_notes, service_notes,
    legacy_atmosphere_tags, legacy_decor_tags, legacy_service_tags)
select distinct on (t.shop_id, t.user_id)
    t.shop_id, t.user_id, t.ambience_axes, t.facilities, t.space_style, t.space_materials,
    t.service_ratings, t.menu_food, t.drink_types, t.atmosphere_notes, t.decor_notes, t.service_notes,
    t.atmosphere_tags, t.decor_tags, t.service_tags
from coffee.tasting_records t
where t.user_id is not null
  and (t.ambience_axes <> '{}'::jsonb or t.facilities <> '{}' or t.space_style is not null
       or t.space_materials <> '{}' or t.service_ratings <> '{}'::jsonb or t.menu_food <> '{}'
       or t.drink_types <> '{}' or t.atmosphere_notes is not null or t.decor_notes is not null
       or t.service_notes is not null or t.atmosphere_tags <> '{}' or t.decor_tags <> '{}'
       or t.service_tags <> '{}')
order by t.shop_id, t.user_id, t.created_at desc
on conflict (shop_id, user_id) do nothing;

-- 驗證：筆數應等於「有店家體驗資料的 (店家, 使用者) 組合數」，且逐欄抽查對得起來
select count(*) from coffee.shop_notes;
```

**H-4 ⚠️ 部署新前端之後才執行：拿掉搬走的欄位**

```sql
alter table coffee.tasting_records
    drop column ambience_axes, drop column facilities, drop column space_style,
    drop column space_materials, drop column service_ratings, drop column menu_food,
    drop column drink_types, drop column atmosphere_notes, drop column decor_notes,
    drop column service_notes, drop column atmosphere_tags, drop column decor_tags,
    drop column service_tags;
alter table coffee.tasting_records alter column schema_version set default 5;
alter table coffee.shops drop column intro;   -- 個人標註已改由 shop_notes.intro 承載
```

**H-5 ⚠️ 部署新前端之後才執行：店家改成 Google Places 投影**

```sql
alter table coffee.shops rename column user_id to created_by;   -- 語意：建立者，不參與存取控制
alter table coffee.shops alter column google_place_id set not null;
alter table coffee.shops drop constraint shops_name_key;        -- 不同分店可以同名

-- 店家身分不可變
create or replace function coffee.shops_freeze_place_id()
returns trigger language plpgsql
set search_path = ''      -- 不碰任何表，固定空 search_path（Supabase linter 要求）
as $$
begin
    if new.google_place_id is distinct from old.google_place_id then
        raise exception 'google_place_id is immutable';
    end if;
    return new;
end;
$$;
create trigger shops_freeze_place_id
    before update on coffee.shops
    for each row execute function coffee.shops_freeze_place_id();

-- 兩張表獨立：刪店家不得改動或摧毀任何人的記錄
alter table coffee.tasting_records drop constraint tasting_records_shop_id_fkey;
alter table coffee.tasting_records add  constraint tasting_records_shop_id_fkey
    foreign key (shop_id) references coffee.shops(id) on delete restrict;
alter table coffee.cupping_records drop constraint cupping_records_shop_id_fkey;
alter table coffee.cupping_records add  constraint cupping_records_shop_id_fkey
    foreign key (shop_id) references coffee.shops(id) on delete restrict;
```

**H-6 ⚠️ 最後一步：收緊 RLS**

執行後未登入就再也讀不到任何資料。policy 與 grant 雙保險。

```sql
drop policy if exists "open access" on coffee.shops;
drop policy if exists "open access" on coffee.cupping_records;
drop policy if exists "open access" on coffee.tasting_records;
drop policy if exists "open access" on coffee.tags;

-- 舊安裝當初把 table / sequence / schema usage 都 grant 給 anon 了，這裡要全部收回。
-- 只收 table 是不夠的：default privileges 沒收乾淨的話，日後新增的表或序列
-- 又會自動開給 anon。
revoke all on all tables    in schema coffee from anon;
revoke all on all sequences in schema coffee from anon;
revoke usage on schema coffee from anon;
alter default privileges in schema coffee revoke all on tables    from anon;
alter default privileges in schema coffee revoke all on sequences from anon;

alter table coffee.shop_notes enable row level security;

create policy "shops readable"   on coffee.shops for select to authenticated using (true);
create policy "shops insertable" on coffee.shops for insert to authenticated with check (auth.uid() is not null);
create policy "shops updatable"  on coffee.shops for update to authenticated using (true) with check (true);
create policy "shops deletable"  on coffee.shops for delete to authenticated using (created_by = auth.uid());

create policy "own notes"   on coffee.shop_notes      for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own cupping" on coffee.cupping_records for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasting" on coffee.tasting_records for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tags 目前 app 沒用到，收成登入者唯讀
create policy "tags readable" on coffee.tags for select to authenticated using (true);

-- H-1 的備份表在 PostgREST 曝光的 schema 裡且沒開 RLS ——「任何登入者」都讀得到
-- 遷移前的完整資料（含別人的列）。開 RLS 但不建 policy = 只有 service_role
-- 進得去，rollback 安全網保留、外部一律讀不到。
alter table coffee._backup_tasting_20260826 enable row level security;
alter table coffee._backup_shops_20260826   enable row level security;
revoke all on coffee._backup_tasting_20260826 from anon, authenticated;
revoke all on coffee._backup_shops_20260826   from anon, authenticated;
```

**驗收**：用 anon key 直打 REST 應該拿不到任何資料 —— 因為連 schema usage 都收回了，
預期是 `401` + `permission denied for schema coffee`（而不是空陣列）。

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$SUPABASE_URL/rest/v1/cupping_records?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Accept-Profile: coffee"
```

驗收完成後再手動清掉安全網：

```sql
drop table coffee._backup_tasting_20260826;
drop table coffee._backup_shops_20260826;
```

**啟用 Google 登入**：Supabase Dashboard → Authentication → Providers → Google，
填入 Google Cloud OAuth 的 Client ID / Secret；Authentication → URL Configuration
的 *Redirect URLs* 加入本機 static server（如 `http://localhost:8000`）與
GitHub Pages 網址（如 `https://<user>.github.io/coffee-review/`）。
Google Cloud Console 的 OAuth *Authorized redirect URI* 需填
`https://<project-ref>.supabase.co/auth/v1/callback`。

### 2. 前端配置

連線資訊**不放在 repo**。兩種來源擇一：

**A. 本地開發**

```bash
cp config.example.js config.js
# 編輯 config.js 填入 url + anonKey
```

`config.js` 已寫進 `.gitignore`，不會 commit。

**B. 部署到 GitHub Pages**

在 repo Settings 加以下 secret（三個都是必要的 —— 沒有 `GOOGLE_MAPS_API_KEY` 就無法新增店家）：

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console 啟用 Places API (New) + Maps JavaScript API 後產生的金鑰，**建議設 HTTP referrer 限制**為部署網址 + `http://localhost:*` |

Settings → Pages → Source 選 **GitHub Actions**。
`.github/workflows/deploy.yml` 會在 push `main` 時用 secret 產生 `config.js` 後部署。

### ⚠️ 安全提醒

`anon key` 會出現在前端 JS bundle，任何能打開頁面的人都拿得到 —— 所以安全邊界不能靠它。
本 schema 的 RLS 已收成每列隔離，且 `anon` 角色對 `coffee` schema **連 usage 都沒有**
（表、序列、default privileges 一併不給），未登入者連表都解析不到。
在那之上，記錄與 `shop_notes` 只有 `user_id = auth.uid()` 的人讀得到；`shops` 是共享
registry，只有登入者能讀，而且刪除限建立者。

若你是從舊版（`open access`）升級上來的，務必確認 section H 的 H-6 已經跑過 ——
在那之前，只要有 anon key 的人都能 CRUD 全部資料。

## 開發者：Lint

```bash
npm install
npm run lint         # 跑全部
npm run lint:js      # 只跑 ESLint
npm run lint:css     # 只跑 Stylelint
```

規則設定刻意保守（ESLint `recommended` + Stylelint `recommended`），只擋真實錯誤、不挑剔風格。
