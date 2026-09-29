-- 杯測場次的進度：setup（設定編號）→ scoring（評分）→ reveal（揭曉、填豆子資訊）。
-- 只會往前走；reveal 仍可修改任何欄位，所以 Worker 不依 stage 擋寫入。
-- 既有場次都是一次填完的，default 'reveal' 讓它們直接打開在揭曉頁。
alter table cupping_sessions
    add column stage text not null default 'reveal' check (stage in ('setup', 'scoring', 'reveal'));
