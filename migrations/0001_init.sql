-- coffee-review 的 D1 schema。由 README 的 Postgres schema 逐表翻譯而來。
--
-- 三個全域的翻譯規則：
--   uuid        -> text（id 由 Worker 或前端的 crypto.randomUUID() 產生）
--   timestamptz -> text，一律 ISO-8601 UTC 帶毫秒與 Z。格式必須一致：
--                  app.js 用 localeCompare 排序合併後的 created_at，混格式就排錯。
--   text[] / jsonb -> text，存 JSON 字面值，配 json_valid() 約束。
--                  編解碼只在 Worker 的 lib/json.ts 做，wire 上的形狀與 PostgREST
--                  相同，所以 app.js 讀 record.defects_tags 仍然拿到陣列。
--
-- RLS 沒有對應物：隔離改由 Worker 在每一個 query 上寫 `and user_id = ?` 強制。

-- users — 取代 auth.users。遷移腳本沿用 Supabase 的 UUID 灌入，
-- 所以既有資料的 user_id 一列都不用改。Worker 以 Access JWT 的 email 查這張表。
create table users (
    id          text primary key,
    email       text not null unique collate nocase,
    created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- shops — 店家公共 registry（所有登入者共享）。
-- name / location / lat / lng 全部是 Google Places 的投影，App 不提供手動輸入。
-- name 刻意「不」設 unique：不同分店本來就可能同名。
create table shops (
    id                      text primary key,
    name                    text not null,
    location                text,
    google_place_id         text not null unique,
    lat                     real,
    lng                     real,
    google_data_fetched_at  text,
    created_by              text references users(id),   -- 建立者註記，不參與存取控制
    created_at              text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index shops_name_idx on shops(lower(name));

-- 店家身分不可變的 trigger（shops_freeze_place_id）在 schema/triggers.sql，
-- 不在這裡：D1 的 /query 端點無法解析 create trigger，而 migrations apply 只走
-- 那個端點。那份檔案由 db:migrate:* 與 deploy.yml 以 d1 execute --file 一併套用。

-- updated_at 沒有 trigger：Worker 的兩個 update 語句（updateShop / upsertShopNote）
-- 自己寫入。after-update trigger 改同一張表會引出遞迴問題，換不到任何好處。

-- cupping_records — 沖煮（自家沖煮 / 豆評估；表名沿用舊稱）。shop_id 選填。私有。
-- bean_type: 'single'（單品）| 'blend'（配方豆）
create table cupping_records (
    id                 text primary key,
    -- restrict：店家與記錄是兩張獨立的表，刪店家不得改動或摧毀任何人的記錄
    shop_id            text references shops(id) on delete restrict,
    title              text,
    bean_name          text,
    bean_type          text check (bean_type is null or bean_type in ('single', 'blend')),
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
    defects_tags       text not null default '[]' check (json_valid(defects_tags)),
    notes              text,
    coe_total          real,
    coe_tier_id        text,
    evaluations        text not null default '{}' check (json_valid(evaluations)),
    observation        text not null default '{}' check (json_valid(observation)),
    -- tag_ids：欄位保留與線上一致，但 app 沒有任何讀取路徑，所以不建索引
    -- （Postgres 那邊的 gin index 沒有 SQLite 對應物，也沒有必要）。
    tag_ids            text not null default '[]' check (json_valid(tag_ids)),
    schema_version     integer not null default 3,
    user_id            text references users(id),
    created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index cupping_user_created_idx on cupping_records(user_id, created_at desc);
create index cupping_shop_id_idx      on cupping_records(shop_id);

-- tasting_records — 品鑑「這次喝的那一杯」。shop_id 必填。私有。
-- 店家體驗（氛圍 / 設施 / 風格 / 材質 / 服務 / 餐點 / 飲料）不在這裡，見 shop_notes。
create table tasting_records (
    id                text primary key,
    shop_id           text not null references shops(id) on delete restrict,
    title             text,
    visit_date        text,
    item_ordered      text,
    price             real,
    bean_name         text,
    bean_type         text check (bean_type is null or bean_type in ('single', 'blend')),
    brewing_method    text,
    defects           text,
    defects_tags      text not null default '[]' check (json_valid(defects_tags)),
    notes             text,
    coe_total         real,
    coe_tier_id       text,
    evaluations       text not null default '{}' check (json_valid(evaluations)),
    observation       text not null default '{}' check (json_valid(observation)),
    tag_ids           text not null default '[]' check (json_valid(tag_ids)),
    schema_version    integer not null default 5,
    user_id           text references users(id),
    created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index tasting_user_created_idx on tasting_records(user_id, created_at desc);
create index tasting_shop_id_idx      on tasting_records(shop_id);

-- cupping_sessions — 杯測場次（一場多杯，每杯以編號識別）。私有。
-- code_style 只決定「新增一杯」帶入的編號。
-- id 由前端產生（crypto.randomUUID），存檔整批可重送。
create table cupping_sessions (
    id              text primary key,
    session_date    text,                -- 表單預設今天；null 時顯示 fallback created_at
    title           text,
    notes           text,
    code_style      text not null default 'manual' check (code_style in ('manual', 'number', 'letter')),
    schema_version  integer not null default 1,
    user_id         text not null references users(id),
    created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    unique (id, user_id)                 -- 杯的複合 FK 目標
);
create index cupping_sessions_user_created_idx on cupping_sessions(user_id, created_at desc);

-- cupping_session_cups — 場次裡的每一杯（一個編號 = 一支豆）。coe_total null = 未評分。
-- 刻意沒有 tag_ids：與線上一致，記錄標籤只掛在沖煮 / 品鑑兩張表上。
create table cupping_session_cups (
    id                 text primary key,
    session_id         text not null,
    -- not null：composite FK 是 MATCH SIMPLE，任一欄 null 就不檢查
    user_id            text not null references users(id),
    position           integer not null,
    code               text not null check (trim(code) <> ''),
    shop_id            text references shops(id) on delete restrict,
    bean_name          text,
    bean_type          text check (bean_type is null or bean_type in ('single', 'blend')),
    origin             text,
    process            text,
    blend_composition  text,
    roast              text,
    defects            text,
    defects_tags       text not null default '[]' check (json_valid(defects_tags)),
    notes              text,
    coe_total          real,
    coe_tier_id        text,
    evaluations        text not null default '{}' check (json_valid(evaluations)),
    observation        text not null default '{}' check (json_valid(observation)),
    schema_version     integer not null default 1,
    created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    -- 複合 FK：杯只能掛在同一個 owner 的場次下，刪場次時 cascade 也只帶走自己的杯。
    foreign key (session_id, user_id)
        references cupping_sessions(id, user_id) on delete cascade,
    -- SQLite 沒有 deferrable constraint，所以這裡是逐列檢查的一般 unique。
    -- 存檔改成「整批刪光再整批插入」（見 Worker 的 PUT /api/sessions/:id），
    -- 刪除與插入之間不存在任何編號，A 與 B 互換在結構上就不可能撞到。
    -- 區分大小寫；前端驗證不分大小寫，與原本一致。
    unique (session_id, code)
);
create index cupping_session_cups_shop_id_idx on cupping_session_cups(shop_id);

-- shop_notes — 我對這家店的個人筆記（介紹 + 店家體驗）。每人每店一筆，完全私有。
-- 店家本身是共享的，「對店家的評價」不是，所以這些欄位不放在 shops 上。
create table shop_notes (
    id                     text primary key,
    shop_id                text not null references shops(id) on delete cascade,
    user_id                text not null references users(id),
    intro                  text,
    -- {quiet_lively, bright_dim, spacious_cozy} 各 1-3 或 null
    ambience_axes          text not null default '{}' check (json_valid(ambience_axes)),
    facilities             text not null default '[]' check (json_valid(facilities)),
    space_style            text,
    space_materials        text not null default '[]' check (json_valid(space_materials)),
    -- {greeting, speed} 各 1-3 或 null
    service_ratings        text not null default '{}' check (json_valid(service_ratings)),
    menu_food              text not null default '[]' check (json_valid(menu_food)),
    drink_types            text not null default '[]' check (json_valid(drink_types)),
    ambience_notes         text,
    style_notes            text,
    service_notes          text,
    -- 舊版多選標籤（tasting schema_version <= 3 遷移而來）：唯讀保留
    legacy_atmosphere_tags text not null default '[]' check (json_valid(legacy_atmosphere_tags)),
    legacy_decor_tags      text not null default '[]' check (json_valid(legacy_decor_tags)),
    legacy_service_tags    text not null default '[]' check (json_valid(legacy_service_tags)),
    schema_version         integer not null default 1,
    created_at             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    unique (shop_id, user_id)
);
create index shop_notes_shop_id_idx on shop_notes(shop_id);

-- tags — 記錄標籤（記錄以 tag_ids 參照）。目前 app 沒用到，保留與既有資料庫一致。
create table tags (
    id          text primary key,
    name        text not null unique,
    color       text not null default '#6c757d',
    icon        text,
    is_builtin  integer not null default 0,
    sort_order  integer not null default 0,
    created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

insert into tags (id, name, color, icon, is_builtin, sort_order) values
    ('11111111-1111-1111-1111-000000000001', '最愛',   '#e0245e', 'bi-star-fill',        1, 1),
    ('11111111-1111-1111-1111-000000000002', '想再試', '#1d9bf0', 'bi-arrow-repeat',     1, 2),
    ('11111111-1111-1111-1111-000000000003', '不推薦', '#71767b', 'bi-hand-thumbs-down', 1, 3),
    ('11111111-1111-1111-1111-000000000004', '已下單', '#00ba7c', 'bi-bag-check-fill',   1, 4)
on conflict (id) do nothing;
