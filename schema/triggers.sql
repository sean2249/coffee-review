-- D1 的 /query API 端點無法解析 create trigger（begin…end 裡的分號會讓它回
-- "incomplete input"），而 `wrangler d1 migrations apply` 只走那個端點 ——
-- 所以 trigger 不能放在 migrations/ 裡，必須改用 `d1 execute --file`（/import 端點）。
--
-- 這個檔案要能重複套用：用 if not exists，不要改成 drop + create。
-- 本機、vitest 的 worker 測試、deploy.yml 三處都會套用同一份，不會 drift。
-- 新增 trigger 時：一個檔案一條語句，這裡不做任何語句切割。

-- 店家身分不可變：擋掉「把一家店偷換成另一個 Google 地點」。
-- Worker 的欄位白名單（SHOP_UPDATE_COLS）是第一道，這個 trigger 是第二道。
-- `is not` 是 SQLite 的 is distinct from。
create trigger if not exists shops_freeze_place_id
before update on shops for each row
when new.google_place_id is not old.google_place_id
begin
    select raise(abort, 'google_place_id is immutable');
end;
