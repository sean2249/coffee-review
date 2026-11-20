-- 沖煮記錄的「所依計劃」（#147，docs/adr/0004）：存計劃 id 與名稱，參數另抄進既有的
-- method / grind / water_temp / ratio / extraction_time。
-- 不設 FK：內建手沖法不在 DB（id 是 app.js 的字串），計劃也可以照刪，記錄靠抄下來的名稱顯示。
alter table cupping_records add column brew_plan_id text;
alter table cupping_records add column brew_plan_name text;
