# 多租戶第二階段 — 決策紀錄（ADR-style）

- 日期：2026-08-26
- 對應設計：`2026-08-26-multitenant-rls-shop-split-design.md`
- 前一階段決策：`2026-07-11-google-auth-login-decisions.md`

長格式的「為什麼這樣做」審計軌跡。設計文件的決策表只給結論，這裡給推導。

---

## D1 — 隔離粒度與 anon 權限

- **背景**：`coffee` 四張表的 policy 都是 `for all to public using (true) with check (true)`。
  anon key 出現在前端 bundle，等於任何人都能 CRUD 全部資料。
- **替代方案**：
  - 只改 policy 成 `user_id = auth.uid()` — 夠用，但 grant 仍開給 anon，多一層失誤面。
  - policy + `revoke all ... from anon` — 雙保險；policy 寫錯時 grant 還會擋。
- **選擇**：**policy 收緊 + 回收 anon grant**，policy 一律 `to authenticated`。
- **影響**：README section A 與 H 都要含 revoke；`alter default privileges` 也要 revoke，
  否則之後新建的表又會自動開給 anon。
- **驗證**：`curl` 用 anon key 打 `/rest/v1/cupping_records` 應回空或 401。**待部署後驗**。

## D2 — 未登入的前端行為

- **背景**：RLS 收緊後未登入查詢會回 `[]`。技術上「安全」了，但畫面是一片空清單。
- **替代方案**：
  - 只擋寫入，讀取顯示空狀態 — 改動最小，但空清單看起來像「資料不見了」，是最糟的失敗模式。
  - 全站 gate 到登入提示 — 多一個 `renderAccessGate`，語意明確。
- **選擇**：**全站 gate**。`renderAccessGate(root)` 回傳 true 代表已接手渲染，呼叫端直接 return。
- **影響**：六個資料 view 各加一行；`renderCloudWarning` 的舊 guard 一併收編進同一個函式。
- **驗證**：`tests/auth-gate.test.js` —— 每個 view 未登入時渲染「請先登入」，
  且 stub `ensureSupabase` 後確認**完全沒被呼叫**。**已綠**。

## D3 — bootstrap 競態（⭐ 差點漏掉的坑）

- **背景**：`initAuth()` 原本是 fire-and-forget，`renderRoute()` 不等它。RLS 開著的時候
  這無所謂（反正讀得到）；**收緊後**首屏 `state.user` 還是 null，已登入者會先看到「請先登入」。
- **替代方案**：
  - 維持不等，靠 `onAuthStateChange` 補一次重繪 — 會閃一下錯誤畫面，且 `INITIAL_SESSION`
    與 `getSession` 會各觸發一次重繪，開場重複拉資料。
  - bootstrap `await initAuth()` 後才首次 render — 多一個「載入中」畫面，但狀態一次到位。
- **選擇**：**await**。另加 `authBootstrapped` 旗標讓 `setSessionUser` 在 bootstrap 期間不重繪，
  並比對 uid 才重繪（濾掉 `TOKEN_REFRESHED`）。`hashchange` 也改到 auth 就緒後才掛。
- **影響**：`app.js` Init 區塊；首屏多一個「載入中…」。
- **驗證**：測試 harness 已 await `load` + 一個 macrotask，18 支測試全綠代表沒把 bootstrap 弄壞。
  線上需人工確認登入後重整不會閃「請先登入」。**部分待驗**。

## D4 — 店家的共享邊界（⭐ user 拍板）

- **背景**：問「店家要隔離到什麼程度」，user 答「**店家的評價是獨立的，但店家的清單是可以分享的**」。
- **替代方案**：
  - 店家完全私有 — 隔離最乾淨，但每個使用者要各自重建同一份咖啡廳清單。
  - 完全共享含可改 — 最接近現況，但別人能改/刪你的資料。
  - 共享 registry + 評價私有 — 符合 user 的原話。
- **選擇**：**共享 registry + 評價私有**。`shops` 對所有登入者 select/insert/update；
  delete 限 `created_by`。
- **影響**：`shops.user_id` 語意從「擁有者」變「建立者」→ 更名 `created_by`，
  api 層 `stampUserId` 分岔出 `stampCreatedBy`。
- **驗證**：`tests/auth-session.test.js` 驗 `stampCreatedBy` 不寫 `user_id`。**已綠**。

## D5 — 共享店家的 cascade 資料毀損缺口（⭐ 我提出、user 改了框架）

- **背景**：`tasting_records.shop_id` 是 `ON DELETE CASCADE`。店家一旦共享，A 刪掉自己建的店家
  會連帶刪掉 B 的品鑑記錄 —— 而 **RLS 擋不住 FK cascade**（cascade 走 referential integrity
  trigger，不吃 policy）。
- **我提的替代方案**：DB trigger 擋下 / 先不處理只記錄 / 改 SET NULL。
- **user 的回答**：三個都不選，改成「**改成獨立的兩個 table，店家資訊與店家品鑑是分開的**」。
- **選擇**：照 user 的框架 —— 不是「擋住 cascade」，而是「兩張表本來就該獨立」。
  FK 改成 `ON DELETE RESTRICT`（`cupping_records` 也一併，理由一致）。
- **影響**：刪店家的 UI 從「警告會連坐刪除」改成「有記錄就不給刪」；
  另接 `23503` FK violation，處理「別人的記錄擋著、但 RLS 讓我看不到」的情況。
- **驗證**：線上刪一家有記錄的店家應被 DB 擋下並出現錯誤 toast。**待部署後驗**。

## D6 — `intro` 與店家體驗的歸屬（⭐ 本次最大的結構改動）

- **背景**：D4 定案後，`shops.intro` 卡在錯的一側（個人標註躺在共享表上）；
  而店家體驗（氛圍/設施/風格/材質/服務/餐點/飲料）躺在 `tasting_records` 裡，
  跟「這次點的那一杯」綁死。user 明說「shops 為公共 registry，但介紹屬於個人標註。
  tasting_records 同時需要將店家品鑑分開」。
- **替代方案**：
  - `intro` 搬到 `shop_notes`、店家體驗留在 tasting — 只解一半，體驗仍無法脫離單次到訪。
  - 兩者都搬到 `shop_notes`，每人每店一筆 — 語意正確：氛圍/設施不會每次來重評。
  - 店家體驗自成一表、intro 再一表 — 兩張表 grain 完全相同（per user × shop），沒理由拆。
- **選擇**：**合成一張 `shop_notes`**，grain = (shop_id, user_id)。
- **影響**：`tasting_records` 掉 13 欄、`schema_version` → 5；品鑑表單移除「探訪心得」card；
  品鑑詳情頁改成往店家頁的連結；店家頁新增「我的店家筆記」卡（唯讀/編輯兩態）。
- **驗證**：`tests/tasting-payload-split.test.js` 鎖住 13 個欄位不會回到 tasting payload；
  `tests/shop-note.test.js` 驗編輯器 round-trip。**已綠**。線上需比對遷移後逐欄資料。

## D7 — 一次做到底 vs 分兩刀（⭐ 我建議分刀，user 選一次到底）

- **背景**：D6 定案後，本次改動從「加 RLS」膨脹成「加 RLS + 跨 schema 遷移 + 表單/三頁重構」。
- **我的建議**：**分兩刀**。Phase 1 只收 RLS（且 shops 也先收成 owner-only，零外洩風險），
  Phase 2 再拆表並把 shops 放寬。理由：user 回報的外洩問題能立刻修好，不用等整個重構完成。
- **user 的選擇**：**一次做到底**。
- **選擇**：照 user 決定，一刀到底。
- **影響**：外洩修復被綁在整個重構的部署上；`drop column` 不可逆，需要備份表兜底。
- **驗證**：`coffee._backup_tasting` / `_backup_shops` 在 drop 前建立，驗收後才手動清掉。

## D8 — 店名只能來自 Google Places（⭐ user 在計畫批准前追加）

- **背景**：user 在批准計畫時追加「`coffee.shops` 的 name 一律只能用 google_place 獲得到的名稱，
  不允許修改」。勘查發現**現有 28 家店全部**已有 `google_place_id` + `lat/lng` + `location`，
  所以可以直接強制、沒有 legacy 例外。
- **推導出的連帶決策**：
  - `google_place_id` 加 `not null` —— 它才是店家身分。
  - **移除 `name` 的 UNIQUE** —— 身分改由 place id 定義，不同分店本來就可能同名（星巴克）。
    留著 unique 反而會擋掉合法的第二家分店。
  - 新增店家 modal 縮成純 Places 選取器，三個自由輸入欄位（`sm-name`/`sm-location`/`sm-intro`）全砍。
  - 「編輯店家」不再存在，改成「從 Google 重新同步」。
  - Google Maps API key 從「可選增強」升級為「新增店家的必要條件」。
- **⭐ 重新同步的實作取捨**：既有的 `openPlaceBackfillDialog` 是「用店名+地址重新搜尋 → 列候選 →
  挑一筆覆寫」。直接沿用會讓使用者能挑到**別家店**，等於偷換店家身分。
  改成用既有的 `google_place_id` 直接 `fetchFields` 重抓，不列候選 —— 這才是「同步」的語意，
  程式碼也更短。另加 DB trigger 凍結 `google_place_id` 作為最終防線。
- **影響**：`config.example.js` / README secrets 表要把 Google key 標成必要；
  `23505` 錯誤處理簡化成只剩「這家店已經在清單裡了」。
- **驗證**：`tests/shop-modal-places.test.js` 鎖住「樣板沒有自由輸入欄位」與
  「沒 key 就不能新增」。**已綠**。

## D9 — 落地順序（⭐ 批准後我修正的計畫錯誤）

- **背景**：批准的計畫把 `drop column` / `rename` 放在前端部署**之前**。
  但線上舊前端還會送那些欄位，PostgREST 會直接拒絕所有寫入；讀取也會因為 RLS 提前收緊而全空。
  （section G 當初的警告是針對 **additive** 改動，順序剛好相反。）
- **選擇**：**additive DB（建表 + 遷移 + 備份）→ 前端部署 → destructive DB（drop/rename/FK）→ RLS**。
- **影響**：README section H 明確標出 H-4/H-5/H-6 是「部署新前端之後才執行」。
- **驗證**：部署後線上版功能正常，才跑 H-4 之後的步驟。**待執行**。

---

## 需 user 特別留意

- **`drop column` 不可逆**：H-1 會先建 `coffee._backup_tasting` / `_backup_shops`，
  驗收完成後要記得手動清掉，不然會一直躺在 schema 裡。
- **Google Places 查無此店就建不了店家**：小店 / 新店 / 快閃店可能不在 Places 裡。
  D8 把「手動補一筆」的逃生口關掉了。若日後遇到，需要另開一個決策。
- **shops 的 update 對所有登入者開放**：RLS 無法驗證寫進去的值真的來自 Places API，
  防線是「UI 不提供手動輸入」+「trigger 凍結 place id」。直接打 REST 的人仍能改店名。
- **舊 PWA 快取**：`sw.js` VERSION 已 bump 到 v10，但仍可能有 client 停在舊版一小段時間，
  屆時他們會看到空清單。這是收 RLS 的必然，未做相容層。
