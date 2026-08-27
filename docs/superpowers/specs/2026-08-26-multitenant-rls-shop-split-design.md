# 多租戶第二階段：RLS 收緊 + 店家/品鑑拆表 — 設計

- 日期：2026-08-26
- 前一階段：`2026-07-11-google-auth-login-design.md`（#78 多租戶第一階段）
- 狀態：已實作，待部署 + 線上 DB 遷移

## 起因

回報：「目前在未登入的情況下，仍可以看到我的記錄」。

這不是 bug，是 #78 刻意留下的過渡態 —— 決策 D2/D4 明載「本次上線後未登入者仍可讀寫全部資料，
真正的每列隔離留待後續 change」。本文件就是那個 change。

## 目標與範圍

**本次要做**

1. RLS 從 `open access` 收成每列隔離；`anon` 對 `coffee` schema 完全無權。
2. 前端未登入 gate：資料頁一律擋在登入提示，不發任何查詢。
3. `coffee.shops` 轉成**公共 registry**：客觀欄位全部是 Google Places 的投影，
   `intro`（個人標註）搬走，`user_id` 更名 `created_by`（不參與存取控制）。
4. 新表 `coffee.shop_notes`：我對這家店的個人筆記 = 個人介紹 + 店家體驗，每人每店一筆。
5. 店家體驗（氛圍 / 設施 / 風格 / 材質 / 服務 / 餐點 / 飲料）從 `tasting_records` 搬到
   `shop_notes` —— 它屬於「我對這家店」，不屬於「這次喝的那一杯」。
6. 店家與記錄的 FK 改成 `ON DELETE RESTRICT`：兩張表獨立，刪店家不得摧毀任何人的記錄。
7. 店名不可手動修改：新增店家 = Google Places 選取器，更新 = 從 Google 重新同步。

**本次不做**

- 個人數據分析頁（仍在 backlog）。
- 跨使用者的店家資料協作機制（例如「回報這家店資料有誤」）。

## 決策摘要

| 決策 | 選擇 | 理由 |
|---|---|---|
| 隔離粒度 | 每列 `user_id = auth.uid()`；`anon` 連 grant 都收回 | policy 與 grant 雙保險 |
| 未登入 UX | 全站 gate 到登入提示 | 空清單會被誤讀成「資料不見了」 |
| 店家歸屬 | 共享 registry，所有登入者可讀/可新增/可更新 | 店家是客觀實體，清單可分享 |
| 店家評價歸屬 | 私有，落在 `shop_notes` | 「店家的評價是獨立的，但清單可以分享」 |
| 店名來源 | 只能來自 Google Places，UI 無自由輸入 | 身分由 `google_place_id` 定義 |
| `name` UNIQUE | 移除 | 不同分店可能同名（星巴克） |
| 店家體驗歸屬 | `shop_notes`，每人每店一筆 | 氛圍/設施不會每次到訪重評 |
| FK delete rule | `RESTRICT`（cupping 也一併） | RLS 擋不住 cascade，這是跨租戶資料毀損缺口 |
| 落地順序 | additive DB → 前端部署 → destructive DB → RLS | 反過來會讓線上舊前端全滅 |

詳細取捨審計軌跡見 `2026-08-26-multitenant-rls-shop-split-decisions.md`。

## 目標 schema

```
coffee.shops              公共 registry（Google Places 投影）
  id, name, location, google_place_id (not null unique), lat, lng,
  google_data_fetched_at, created_by, created_at, updated_at
  → trigger 凍結 google_place_id

coffee.shop_notes         我對這家店（私有，unique(shop_id, user_id)）
  intro, ambience_axes, facilities, space_style, space_materials,
  service_ratings, menu_food, drink_types,
  ambience_notes, style_notes, service_notes,
  legacy_{atmosphere,decor,service}_tags, schema_version

coffee.tasting_records    這次喝的那一杯（私有）— 移除 13 個店家體驗欄，schema_version → 5
coffee.cupping_records    不變（私有）
```

完整 SQL 見 README section A（新裝）與 section H（升級）。

## 前端架構

**Auth gate**：`renderAccessGate(root)` 統一擋板，回傳 `true` 代表已接手渲染。
六個資料 view 開頭各一行。bootstrap 改成 `await initAuth()` → `authBootstrapped = true`
→ 掛 `hashchange` → 首次 `renderRoute()`；`setSessionUser` 比對 uid 後才重繪，
濾掉 `TOKEN_REFRESHED` 這類同人事件。

**店家筆記**：`mountShopNoteCard(host, shopId, note)` 管唯讀/編輯兩態切換。
編輯態沿用原本掛在品鑑表單的 widget —— `initTagSections(container)` 改成吃容器參數，
並自帶 `.notes-toggle` 委派（店家頁沒有 `.record-form` 可掛）。
Payload 由 `buildShopNotePayload()` 組、`applyShopNoteToEditor(note)` 回填，
`intro` 也走 apply（不由樣板插值），避免雙頭馬車。

**店家 modal**：縮成純 Google Places 選取器，沒選 place 前儲存鈕 disabled；
沒有 Maps key 時顯示提示並隱藏儲存鈕。「編輯」按鈕換成「從 Google 重新同步」
（`resyncShopFromGoogle`），用既有 place id 直接 `fetchFields` 重抓（不是重新搜尋挑一家
—— 挑錯等於偷換店家）。**沒有確認 dialog、不預覽差異**：按了就同步，按鈕進 busy 態，
成功靠重繪反映（不跳 toast），只有失敗才 toast。

## 影響檔案

- `app.js`：auth gate、api 兩支 shop_notes 方法 + `stampCreatedBy`、店家筆記卡、
  品鑑表單/詳情頁移除店家體驗、店家 modal 與重新同步
- `index.html`：移除「探訪心得」card 與 modal 的三個自由輸入欄位
- `styles.css`：移除孤兒的 `.shop-card-intro`
- `sw.js`：VERSION v9 → v10
- `README.md`：section A schema 重寫 + 新增 section H 升級指引 + 安全提醒改寫
- `config.example.js`：`GOOGLE_CONFIG` 從「可選」改為「必要」
- `CLAUDE.md`：RLS / 店家不變式改寫
- `tests/`：新增 `auth-gate` / `shop-note` / `shop-modal-places` / `tasting-payload-split`，
  `load-app.js` 加 `supabaseConfig` 選項與 `CSS.escape` shim

## 驗證

見 README section H 的驗收指令，與計畫檔的線上驗證清單。
