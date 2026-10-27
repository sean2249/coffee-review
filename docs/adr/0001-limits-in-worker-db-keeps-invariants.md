# 上限放在 Worker，資料庫只放不變式

SQLite 不能修改既有的 CHECK，改一個上限就得重建整張表（新建、搬資料、刪舊表、改名），而且正式 D1 在部署時自動套用；CHECK 擋下的寫入也只會變成 500，前端分不出原因。所以 `brew_plans`（#145）的粉量 ≤ 100 g、說明 ≤ 500 字、水溫 0–100°C、步驟數與字數上限都只在 Worker 驗（400 + 訊息），SQL 只留永遠成立的規則：`dose_g > 0`、名稱非空白、`json_valid`、`target_seconds > 0`。這與 `0001` / `0002` 的慣例一致——它們的 CHECK 只有列舉值、`json_valid`、非空字串，沒有任何數值或字數上限。

「同一人不能同名（不分大小寫）」同理寫成獨立的 `unique index (user_id, name collate nocase)`，不用欄位 collation 加表上的 `unique`：要改規則時 drop / create index 即可，不必重建表。

**不要「順手補上」缺的 CHECK**——看到 `dose_g` 沒有上限是刻意的，規則在 Worker 的 `normalizePlan`。
