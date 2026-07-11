# Google 登入 + 個人 tab — 決策紀錄（ADR-style）

- 日期：2026-07-11
- 對應設計：`2026-07-11-google-auth-login-design.md`
- Issue：[#78](https://github.com/sean2249/coffee-review/issues/78)

長格式的「為什麼這樣做」審計軌跡。設計文件的決策表只給結論，這裡給推導。

---

## D1 — 登入是否管到資料（open access → 綁 owner）

- **背景**：現況三表 RLS 全是 `open access`（README:174-180，CLAUDE.md 標「未經要求別動」）。
  user 揭露真正目標：要把 app 轉成「能提供給他人」的多租戶服務，不只是個人登入。
- **替代方案**：
  - A：登入純顯示狀態，完全不 gate 資料 — 最小改動，但無法往多租戶走。
  - B：登入後綁 owner + 收緊 RLS + 加 user_id — 一步到位，但安全關鍵、且會鎖到既有資料。
- **選擇**：方向採 B（gate 資料），但**分階段**落地（見 D2）。
- **影響**：三表需加 `user_id`；RLS 未來要重寫；README 要補多租戶說明。
- **驗證**：user 明確回「B，因為我想轉換服務類型，做成能提供給他人」。**已確認**。

## D2 — 本次改動切線（分階段的哪一刀）

- **背景**：「轉多租戶」= 登入 + user_id + RLS 重寫 + 回填 + 寫入帶 user_id，遠大於「只做登入」。
  一次全做且開 RLS，會讓現有 null-owner 舊資料與未登入使用者被鎖在門外。
- **替代方案**：
  - 只做登入基礎（RLS 開、不加 user_id）— 最乾淨，但沒開始累積歸屬。
  - 登入 + 完整資料隔離（含強制 RLS）— 一次到底，安全關鍵、有鎖死風險。
  - 登入 + user_id 但先不強制 RLS — 累積歸屬、不承擔鎖死風險。
- **選擇**：**登入 + user_id 但先不強制 RLS**。
- **影響**：三表加 nullable `user_id`；insert 蓋章；回填舊資料；RLS 留到下個 change。
- **驗證**：user 選「登入 + user_id 但先不強制 RLS」。**已確認**。

## D3 — `user_id` 蓋章位置

- **背景**：寫入 payload 由 `buildFormPayload`（app.js:2945）產出，而該輸出會被**草稿功能序列化**
  （app.js:381/399，`JSON.stringify(buildFormPayload(mode))`）。若把 `user_id` 放進去，草稿快照會混入身分。
- **替代方案**：
  - 放 `buildFormPayload` — 集中，但污染草稿快照、且 update 也會誤帶。
  - 放 API insert 層（`createCupping`/`createTasting`/`createShop`）— 草稿乾淨、只在新增時蓋。
- **選擇**：**API insert 層**蓋章；update 不動 owner。
- **影響**：改 api 物件的三個 create 函式；`buildFormPayload` 與草稿邏輯零改動。
- **驗證**：草稿測試不受影響仍綠；insert 單元測試驗證帶/不帶 user_id。

## D4 — 未登入時的寫入行為

- **背景**：RLS 這次不強制，未登入技術上仍可寫。要不要 UI 擋下？
- **替代方案**：
  - 允許，`user_id = null` — 行為與現況一致，最小改動。
  - 前端擋，要登入才能新增 — 減少 null-owner 資料，但改動新增流程、與「只做登入」相衝。
- **選擇**：**允許，`user_id` 留 null**。
- **影響**：insert 蓋章用 `state.user?.id ?? null`；新增流程不加 gate。
- **驗證**：user 選「允許（user_id 留 null）」。**已確認**。

## D5 — 舊資料回填識別方式

- **背景**：回填需要 owner 的 auth uid，但 uid 只有在該帳號**首次 Google 登入後**才存在於 `auth.users`。
- **替代方案**：
  - 硬編 uid 進 migration — 登入前拿不到、易錯。
  - SQL 用 email 查 `auth.users` 後 UPDATE — 免硬編，但需先登入一次。
- **選擇**：**email 查 uid 的一次性 UPDATE**（`sean22492249@gmail.com`）。
- **影響**：落地順序需「user 登入一次 → 我跑回填」；回填只填 `user_id IS NULL` 的列。
- **驗證**：回填後 `select count(*) where user_id is null` 應為 0（假設無其他未登入寫入）。**待執行時驗**。

## D6 — 線上 DB 改動執行者

- **背景**：加 `user_id` 欄與回填要動線上 Supabase。有 Supabase MCP 可用。
- **選擇**：**我用 MCP `apply_migration` / SQL 執行，動線上庫前逐步跟 user 確認**。
- **影響**：落地順序第 3、4 步由我執行；README 仍保留等效 SQL 供他人自架。
- **驗證**：user 選「我用 MCP 執行（推薦）」。**已確認**。

## D7 — session bootstrap 時機

- **背景**：現行 `ensureSupabase`（app.js:487）是 lazy，只在需要時建 client。但 OAuth 回跳需在**載入時**
  就有 client 跑 `detectSessionInUrl`，否則接不住 token；session 還原也需開場就做。
- **替代方案**：
  - 維持 lazy，只在進個人 tab 才 init — 回跳後若首頁不是個人 tab 會漏接 token。
  - Bootstrap 時 eager `initAuth()`（若 `isCloudReady`）— 穩定接住回跳與還原。
- **選擇**：**bootstrap eager init**。
- **影響**：新增 `initAuth()` 於啟動流程；`onAuthStateChange` 驅動 `state.user` 與個人 tab 重繪。
- **驗證**：登入回跳後不論落在哪頁，`state.user` 都應被設定；個人 tab 顯示已登入態。

## D8 — 個人 tab 是否放分析 placeholder

- **背景**：issue 提到數據分析，但本次 scope 排除。
- **選擇**：**不放 placeholder**，個人 tab 這次只有登入區塊。
- **驗證**：user 選「不放（推薦）」。**已確認**。

---

## 需 user 特別留意

- **D2/D4 的直接後果**：本次上線後，**未登入者仍可讀寫全部資料**（RLS 未收緊）。這是刻意的過渡態，
  真正的存取隔離在下一個 change。若你預期「上線就能給別人用且互不可見」，那要提前到下個 change。
- **落地依賴 infra（D6 前的 D5）**：Google provider 設定（Google Cloud + Supabase Dashboard）我無法代做，
  需要你操作；且回填前你必須先用 `sean22492249@gmail.com` 登入一次。
