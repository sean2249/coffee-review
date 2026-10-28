-- 沖煮計劃步驟改存每一步自己的秒數與本次水量（#155，docs/adr/0003 取代 0002）：
--   { type: 'pour', seconds, water_g, bloom?, water_temp?, note? }
--   { type: 'wait', seconds, note? }
-- 正式環境還沒有使用者的計劃，所以不轉換，直接刪掉既有的 v1 列。
-- schema_version 的預設 1 不改（改預設要重建表，見 docs/adr/0001），由存檔時送 2。
delete from brew_plans;
