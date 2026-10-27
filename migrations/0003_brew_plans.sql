-- brew_plans — 沖煮計劃表（#143）。私有，每人各自一份。
-- 內建手沖法是 app.js 的常數，不在這張表。
-- 粉水比 / 總水量 / 斷水次數 / 總時間都由 steps 算出，不存。
-- steps：依時間排序的步驟陣列，兩種：
--   { type: 'pour', at_seconds, to_g, bloom?, water_temp?, note? }  to_g 是累計水量（注到 X g）
--   { type: 'wait', until_seconds, note? }                           等到第 N 秒
--   時間都是從開始算起的秒數（絕對時間）。Worker 驗形狀，這裡只驗是 JSON。
-- 上限（粉量 ≤ 100、說明 ≤ 500、水溫 0–100）與水溫必填刻意不寫進 CHECK / not null：
-- SQLite 改這些要重建整張表，所以只在 Worker 驗（docs/adr/0001）。
create table brew_plans (
    id              text primary key,
    user_id         text not null references users(id),
    name            text not null check (length(trim(name)) > 0),
    description     text,
    dripper         text,
    grind           text,
    dose_g          real not null check (dose_g > 0),
    water_temp      real,
    steps           text not null default '[]' check (json_valid(steps)),
    schema_version  integer not null default 1,
    created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- 同一人不能同名（不分大小寫；去頭尾空白由 Worker 做）。寫成獨立 index 而不是表上的
-- unique，改規則時 drop / create index 即可，不必重建表。
create unique index brew_plans_user_name_uq on brew_plans(user_id, name collate nocase);
create index brew_plans_user_updated_idx on brew_plans(user_id, updated_at desc);
