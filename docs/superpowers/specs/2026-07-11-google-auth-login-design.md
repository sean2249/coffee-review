# Google 登入 + 個人 tab（多租戶第一階段）— 設計

- 日期：2026-07-11
- Issue：[#78](https://github.com/sean2249/coffee-review/issues/78)
- 狀態：設計待 user 覆核

## 目標與範圍

把 app 從「單人 open-access」往「多租戶服務（可提供給他人）」轉換的**第一階段**。
本次只做**登入基礎 + 資料歸屬累積**，不強制存取控制、不做數據分析頁。

**本次要做**

1. Google 登入 / 登出 + session 還原（底部新增「個人」tab）。
2. `cupping_records` / `tasting_records` / `shops` 三表加 `user_id`（nullable，`references auth.users(id)`）。
3. 新增記錄/店家時在 **API insert 層**蓋 `user_id`：已登入帶 uid、未登入帶 null。**編輯不改 owner**。
4. 把現有舊資料回填給 `sean22492249@gmail.com`。

**本次不做（後續 change）**

- RLS 收緊（維持 open access — 未登入照樣可讀寫，行為與現在相同）。
- 個人數據分析頁（店家數、杯測/品鑑統計、各種分析）。個人 tab 這次**不放** placeholder。

## 決策摘要

| 決策 | 選擇 | 理由 |
|---|---|---|
| 登入位置 | 底部 tabbar 第 4 顆「個人」→ `#/me` | 對齊 issue「下面區塊」 |
| 登入是否 gate 資料 | 這次**不**強制 RLS | 風險最低；先累積歸屬不鎖門 |
| `user_id` 蓋章位置 | API **insert** 層，非 `buildFormPayload` | 不污染草稿序列化；update 不動 owner |
| 未登入寫入 | 允許，`user_id = null` | 行為與現況一致，改動最小 |
| 舊資料回填 | 靠 email 查 `auth.users` 一次性 UPDATE | 免硬編 uid；需先登入一次 |
| 線上 DB 改動 | 我用 Supabase MCP 執行，動庫前逐步確認 | — |
| session bootstrap | 載入時 eager init（若 `isCloudReady`） | 需接住 OAuth redirect + 還原 session |

詳細取捨審計軌跡見 `2026-07-11-google-auth-login-decisions.md`。

## 架構

在 `app.js`（既有 all-in-one 結構）新增一段 **Auth section**，比照現有 `/* ─── Title ─── */`
banner 風格。不引框架、不改 build，沿用 Supabase JS 內建 auth。

### 元件邊界

**Auth 模組（app.js 內新 section）**
- 職責：管理 session 生命週期、暴露 `state.user`、驅動個人 tab 重繪。
- 介面：`initAuth()`（bootstrap 呼叫一次）、`signInWithGoogle()`、`signOutUser()`、`currentUserId()`。
- 依賴：`ensureSupabase()`、`state`、`renderRoute`/`viewAccount`。

**個人 view（`viewAccount`）**
- 職責：依 `state.user` + `isCloudReady()` 渲染登入區塊三態。
- 介面：`viewAccount(root)`（比照其他 `viewXxx`）。
- 依賴：`state.user`、auth 模組的 sign-in/out。

**API insert 蓋章**
- 職責：insert 時附 `user_id`。
- 範圍：`createCupping` / `createTasting` / `createShop`（update 不動）。

## Session 生命週期

- **Bootstrap**：現行 `ensureSupabase` 是 lazy；auth 需在載入時就跑一次。`initAuth()`：
  若 `isCloudReady()` → 建 client → `getSession()` → 寫 `state.user` →
  註冊 `onAuthStateChange` 更新 `state.user`，若目前停在 `#/me` 則重繪。
- `createClient` 沿用預設 auth 選項（`persistSession` / `autoRefreshToken` /
  `detectSessionInUrl` 皆預設開），保留既有 `db.schema`，並**明確指定 `auth.flowType: 'pkce'`**。
  （supabase-js v2 預設是 implicit flow，token 會落在 URL hash 撞到本 app 的 hash router；
  PKCE 改帶 `?code=` 在 query，才不干擾路由。）
- **登入**：`signInWithOAuth({ provider:'google', options:{ redirectTo: origin+pathname } })`。
  回跳帶 `?code=` 在 query string（不干擾 hash router），`detectSessionInUrl`
  自動換 token 並清 URL；`onAuthStateChange` 觸發 `SIGNED_IN` → 更新 UI。
- **登出**：`signOut()` → `onAuthStateChange` 觸發 `SIGNED_OUT`。

## 個人 tab（`#/me`）

- `index.html` tabbar 加第 4 顆 `data-route="/me"`「個人」（`bi-person-circle`）。
- `updateTabbarActive` 加 `/me` 分支；`renderRoute` 加 `parts[0] === 'me'` → `viewAccount`。
- `viewAccount(root)` 三態：
  1. `!isCloudReady()` → 顯示「尚未設定雲端」提示（測試環境走這條，不會爆）。
  2. 未登入 → 「使用 Google 登入」按鈕。
  3. 已登入 → 頭像（`user_metadata.avatar_url`）＋名稱（`full_name`/`name`）＋email ＋「登出」。

## 資料模型

三表各加 `user_id uuid references auth.users(id)`（nullable，預設 null）。

蓋章位置在 API insert：

```js
// createCupping / createTasting / createShop（示意）
.insert({ ...payload, user_id: currentUserId() })   // 已登入=uid，未登入=null
```

`buildFormPayload` / update 路徑**不動**。RLS 這次不改。

## 舊資料回填

一次性，靠 email 查 uid（需 `sean22492249@gmail.com` 先登入一次讓 `auth.users` 有列）：

```sql
update coffee.cupping_records c set user_id = u.id
  from auth.users u where u.email = 'sean22492249@gmail.com' and c.user_id is null;
update coffee.tasting_records t set user_id = u.id
  from auth.users u where u.email = 'sean22492249@gmail.com' and t.user_id is null;
update coffee.shops s set user_id = u.id
  from auth.users u where u.email = 'sean22492249@gmail.com' and s.user_id is null;
```

## 落地順序

1. **User（infra，我做不到）**：Google Cloud 建 OAuth client（consent screen + credentials）→
   Supabase Dashboard → Auth → Providers 開 Google、填 client id/secret；
   URL Configuration 加 redirect URL（本機 static server origin + GitHub Pages URL）。
   → 寫成 README 步驟。
2. **我（code）**：auth section、個人 tab、insert 蓋 `user_id`、README SQL 段、
   bump `sw.js` VERSION、加測試。
3. **我（線上 DB，動庫前確認）**：Supabase MCP `apply_migration` 加三個 `user_id` 欄。
4. **User 登入一次** → **我**跑回填 SQL（MCP）。

## 錯誤處理

- `isCloudReady()` 為 false（測試/未設定）：個人 tab 顯示未設定提示，不呼叫 auth API。
- OAuth 失敗 / 使用者取消：停在個人 tab 未登入態，不阻斷其他頁面。
- session 過期：`autoRefreshToken` 自動續；失敗則 `onAuthStateChange` → 未登入態。

## 測試（Vitest / jsdom，無網路）

- 既有測試：`buildFormPayload` 不變 → 不受影響。
- 新增：
  - `viewAccount` 在無雲端（jsdom 預設）渲染「未設定」態，不丟錯。
  - insert 蓋 `user_id`：mock client，已登入帶 uid、未登入帶 null；update 不帶。
- Lint：新 section 遵守 4-space、single quote、既有 banner 風格。

## 影響檔案

- `index.html`：tabbar 加「個人」。
- `app.js`：auth section、`viewAccount`、路由 + `updateTabbarActive`、insert 蓋章。
- `sw.js`：VERSION bump（app-shell 內容變動）。
- `README.md`：Google provider 設定步驟 + 多租戶升級 SQL 段。
- `config.example.js`：無需改（url/anonKey 已足夠 auth 用）。
- 線上 Supabase：三表加 `user_id`（MCP）。
- `tests/`：新增上述兩支測試。
