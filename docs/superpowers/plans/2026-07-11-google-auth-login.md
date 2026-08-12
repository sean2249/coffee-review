# Google 登入 + 個人 tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 coffee-review 加上 Google 登入與底部「個人」tab，並在新增記錄/店家時把資料綁到登入者（未登入為 null），作為多租戶轉換第一階段。

**Architecture:** 在 `app.js`（vanilla、all-in-one classic script）新增一段 Auth section：session 生命週期用 Supabase JS 內建 auth（PKCE、`detectSessionInUrl` 皆預設），登入狀態存 `state.user`。個人 tab 是新路由 `#/me`。`user_id` 只在 API **insert** 層蓋章，不碰 `buildFormPayload`（保護草稿序列化）。RLS 這次不動。

**Tech Stack:** Vanilla ES2022（無 build）、Supabase JS v2（動態 import）、Bootstrap 5.3、Vitest + jsdom。

## Global Constraints

- 縮排 **4 spaces**、JS 用 **single quote**、ESLint 允許處補 trailing comma。
- UI 字串一律 **zh-TW**，勿翻英。
- 所有寫入 `innerHTML` 的 user/DB 字串必須先 `escapeHtml(...)`（helper 在 app.js:257）。
- CSS section banner 用 `/* ───── Title ──── */` 風格；style token 優先 `var(--accent)` 等。
- Supabase JS import 鎖定版本 `@supabase/supabase-js@2.110.0`（勿改回浮動 `@2`）。
- 動到 `APP_SHELL` 或想讓使用者換掉舊 cache → bump `sw.js` VERSION。
- 測試在 jsdom 無網路跑：`isCloudReady()` 為 false，任何 render 不得因缺雲端而丟錯。
- `user_id` 蓋在 API insert 層，**不進 `buildFormPayload`**；update 路徑不動 owner。
- 頂層 `function` 宣告才會變成 window 屬性（供測試存取）；`const`/`let` 不會。要被測的邏輯用 `function` 宣告。

---

## File Structure

- `app.js`
  - 新 `state.user` 欄位（app.js:228 的 `state` 物件）。
  - 新 **Auth section**（api 物件後，app.js:636 之後）：`currentUserId` / `setSessionUser` / `stampUserId` / `signInWithGoogle` / `signOutUser` / `initAuth`。
  - api insert 蓋章：`createRecord`（app.js:611）、`createShop`（app.js:547）。
  - 個人 view：`accountMarkup` + `viewAccount`（放在 Auth section 附近）。
  - Router：`renderRoute`（app.js:675）加 `me` 分支、`updateTabbarActive`（app.js:704）加 `/me`。
  - Bootstrap：`DOMContentLoaded`（app.js:3830）呼叫 `initAuth()`。
- `index.html`：tabbar（index.html:28-38）加第 4 顆「個人」。
- `styles.css`：`.account-card` / `.account-avatar` 小樣式。
- `sw.js`：VERSION `v8` → `v9`。
- `README.md`：Google provider 設定步驟 + 多租戶 `user_id` 升級 SQL 段。
- `tests/auth-session.test.js`（新）：`currentUserId` / `setSessionUser` / `stampUserId`。
- `tests/account-view.test.js`（新）：`accountMarkup` 三態 + `#/me` 路由渲染。
- 線上 Supabase（MCP，最後）：三表加 `user_id` + 回填。

---

## Task 1: Auth session 核心 + `user_id` 蓋章

**Files:**
- Modify: `app.js:228`（`state` 加 `user: null`）
- Modify: `app.js:636` 之後（新增 Auth section）
- Modify: `app.js:547`（`createShop` insert 蓋章）、`app.js:611`（`createRecord` insert 蓋章）
- Test: `tests/auth-session.test.js`

**Interfaces:**
- Produces:
  - `currentUserId(): string | null` — 目前登入者 id，未登入回 null。
  - `setSessionUser(user: object|null): void` — 設 `state.user`；若正停在 `#/me` 則 `renderRoute()`。
  - `stampUserId(payload: object): object` — 回傳 `{ ...payload, user_id: currentUserId() }`，不變更輸入。
  - `signInWithGoogle(): Promise<void>` / `signOutUser(): Promise<void>` — 走 Supabase auth；未設定雲端時 no-op。
  - `initAuth(): Promise<void>` — bootstrap 呼叫；還原 session + 訂閱 `onAuthStateChange`。
- Consumes: `ensureSupabase`、`isCloudReady`、`parseHash`、`renderRoute`、`showErrorToast`、`escapeHtml`（皆為 app.js 既有全域）。

- [ ] **Step 1: Write the failing tests**

建立 `tests/auth-session.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

let win;
beforeEach(async () => { ({ window: win } = await loadApp()); });

describe('currentUserId / setSessionUser', () => {
    it('returns null when logged out', () => {
        win.setSessionUser(null);
        expect(win.currentUserId()).toBe(null);
    });

    it('returns the user id when logged in', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.currentUserId()).toBe('user-1');
    });
});

describe('stampUserId', () => {
    it('adds user_id = null when logged out', () => {
        win.setSessionUser(null);
        expect(win.stampUserId({ bean_name: 'x' })).toEqual({ bean_name: 'x', user_id: null });
    });

    it('adds the logged-in user id', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.stampUserId({ bean_name: 'x' })).toEqual({ bean_name: 'x', user_id: 'user-1' });
    });

    it('does not mutate the input payload', () => {
        win.setSessionUser({ id: 'user-1' });
        const p = { a: 1 };
        win.stampUserId(p);
        expect(p).toEqual({ a: 1 });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- auth-session`
Expected: FAIL（`win.setSessionUser is not a function` 等）。

- [ ] **Step 3: Add `user: null` to state**

在 `app.js` 的 `state` 物件（app.js:228-237）末欄後加一行：

```js
    knownItems: [],     // distinct item_ordered strings from past tasting records
    knownItemsLoaded: false,
    user: null,         // 目前登入者（Supabase session user）或 null
};
```

- [ ] **Step 4: Add the Auth section**

在 api 物件結尾（`};`，app.js:636）之後、`refreshShopsCache` 之前，插入：

```js

// ─── Auth (Google OAuth session) ─────────────────────────────────────────────
// 登入純為多租戶鋪路：本階段不強制 RLS，未登入照樣可讀寫。
function currentUserId() {
    return state.user?.id ?? null;
}

function setSessionUser(user) {
    state.user = user || null;
    // 若正停在個人頁，登入狀態變化要即時反映到 UI。
    if (parseHash().parts[0] === 'me') renderRoute();
}

// 新增時蓋上擁有者；未登入為 null。刻意不放進 buildFormPayload，避免污染草稿快照。
function stampUserId(payload) {
    return { ...payload, user_id: currentUserId() };
}

async function signInWithGoogle() {
    const sb = await ensureSupabase();
    if (!sb) return;
    // 回跳到 app 根（origin+pathname）；PKCE 的 ?code= 落在 query，不干擾 hash router。
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
    });
    if (error) showErrorToast('登入失敗：' + (error.message || error));
}

async function signOutUser() {
    const sb = await ensureSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) showErrorToast('登出失敗：' + (error.message || error));
}

async function initAuth() {
    if (!isCloudReady()) return;
    const sb = await ensureSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    setSessionUser(data?.session?.user ?? null);
    sb.auth.onAuthStateChange((_event, session) => {
        setSessionUser(session?.user ?? null);
    });
}
```

- [ ] **Step 5: Stamp user_id at the insert layer**

`createShop`（app.js:550-551）改 insert：

```js
        const { data, error } = await sb.from(SUPABASE_CONFIG.shopsTable)
            .insert(stampUserId(payload)).select().single();
```

`createRecord`（app.js:615）改 insert：

```js
        const { data, error } = await sb.from(table).insert(stampUserId(payload)).select().single();
```

（`updateShop` / `updateRecord` **不動**。）

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- auth-session`
Expected: PASS（5 個 test 綠）。

- [ ] **Step 7: Lint**

Run: `npm run lint:js`
Expected: 無 error。

- [ ] **Step 8: Commit**

```bash
git add app.js tests/auth-session.test.js
git commit -m "feat(auth): #78 Google session 核心 + insert 蓋 user_id"
```

---

## Task 2: 個人 view（`accountMarkup` + `viewAccount`）+ 路由

**Files:**
- Modify: `app.js`（Auth section 內加 `accountMarkup` + `viewAccount`）
- Modify: `app.js:675`（`renderRoute` 加 `me` 分支）、`app.js:704`（`updateTabbarActive` 加 `/me`）
- Test: `tests/account-view.test.js`

**Interfaces:**
- Consumes: `renderCloudWarning`（app.js:1005）、`isCloudReady`、`escapeHtml`、`state.user`、`signInWithGoogle`、`signOutUser`。
- Produces:
  - `accountMarkup({ cloudReady: boolean, user: object|null }): string` — 個人頁 HTML（三態）。
  - `viewAccount(root: HTMLElement): void` — 寫入 `root.innerHTML` 並綁登入/登出按鈕。

- [ ] **Step 1: Write the failing tests**

建立 `tests/account-view.test.js`：

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;
beforeAll(async () => { ({ window: win } = await loadApp()); });

describe('accountMarkup', () => {
    it('shows the cloud-not-configured warning when cloud is not ready', () => {
        const html = win.accountMarkup({ cloudReady: false, user: null });
        expect(html).toContain('尚未設定雲端');
    });

    it('shows a Google sign-in button when cloud ready but logged out', () => {
        const html = win.accountMarkup({ cloudReady: true, user: null });
        expect(html).toContain('id="account-signin"');
        expect(html).toContain('使用 Google 登入');
    });

    it('shows account info and a sign-out button when logged in', () => {
        const html = win.accountMarkup({
            cloudReady: true,
            user: { email: 'a@b.com', user_metadata: { full_name: 'Sean', avatar_url: 'https://x/y.png' } },
        });
        expect(html).toContain('id="account-signout"');
        expect(html).toContain('Sean');
        expect(html).toContain('a@b.com');
        expect(html).toContain('https://x/y.png');
    });

    it('escapes user-provided fields', () => {
        const html = win.accountMarkup({
            cloudReady: true,
            user: { email: 'x', user_metadata: { full_name: '<b>hack</b>', avatar_url: '' } },
        });
        expect(html).not.toContain('<b>hack</b>');
    });
});

describe('#/me route', () => {
    it('renders viewAccount (cloud-not-ready state) at #/me', async () => {
        win.location.hash = '#/me';
        await new Promise(r => setTimeout(r, 0));
        expect(win.document.getElementById('app').innerHTML).toContain('尚未設定雲端');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- account-view`
Expected: FAIL（`win.accountMarkup is not a function`）。

- [ ] **Step 3: Add `accountMarkup` + `viewAccount`**

在 Task 1 的 Auth section 內（`initAuth` 之後）加：

```js

// ─── View: 個人 ──────────────────────────────────────────────────────────────
function accountMarkup({ cloudReady, user }) {
    if (!cloudReady) return renderCloudWarning();
    if (!user) {
        return `<div class="card account-card"><div class="card-body text-center">
            <i class="bi bi-person-circle account-avatar-placeholder"></i>
            <h3 class="card-title">個人</h3>
            <p class="text-muted">登入以綁定你的記錄與店家。</p>
            <button class="btn btn-primary" id="account-signin">
                <i class="bi bi-google me-2"></i>使用 Google 登入
            </button>
        </div></div>`;
    }
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || '';
    const avatar = meta.avatar_url || '';
    const email = user.email || '';
    return `<div class="card account-card"><div class="card-body text-center">
        ${avatar
            ? `<img class="account-avatar" src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer">`
            : '<i class="bi bi-person-circle account-avatar-placeholder"></i>'}
        ${name ? `<h3 class="card-title">${escapeHtml(name)}</h3>` : ''}
        ${email ? `<p class="text-muted account-email">${escapeHtml(email)}</p>` : ''}
        <button class="btn btn-outline-secondary" id="account-signout">
            <i class="bi bi-box-arrow-right me-2"></i>登出
        </button>
    </div></div>`;
}

function viewAccount(root) {
    root.innerHTML = accountMarkup({ cloudReady: isCloudReady(), user: state.user });
    document.getElementById('account-signin')?.addEventListener('click', signInWithGoogle);
    document.getElementById('account-signout')?.addEventListener('click', signOutUser);
}
```

- [ ] **Step 4: Wire the route**

`renderRoute`（app.js:693-698）在 `shops` 分支之後、`else` 之前插入：

```js
    } else if (parts[0] === 'me') {
        viewAccount(root);
    } else {
        viewNotFound(root);
    }
```

`updateTabbarActive`（app.js:707-709）加一行：

```js
    if (first === 'new') activeRoute = '/new';
    else if (first === 'shops') activeRoute = '/shops';
    else if (first === 'me') activeRoute = '/me';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- account-view`
Expected: PASS（5 個 test 綠）。

- [ ] **Step 6: Lint + full suite**

Run: `npm run lint:js && npm test`
Expected: lint 無 error；全測試綠（既有測試不受影響）。

- [ ] **Step 7: Commit**

```bash
git add app.js tests/account-view.test.js
git commit -m "feat(auth): #78 個人頁 view + #/me 路由"
```

---

## Task 3: index.html tabbar「個人」+ bootstrap initAuth + 樣式 + sw bump

**Files:**
- Modify: `index.html:28-38`（tabbar 加第 4 顆）
- Modify: `app.js:3830`（`DOMContentLoaded` 呼叫 `initAuth()`）
- Modify: `styles.css`（`.account-card` / `.account-avatar` 樣式）
- Modify: `sw.js:6`（VERSION bump）
- Test: 沿用 `tests/account-view.test.js` 的 `#/me` 路由測試 + 全 suite。

**Interfaces:**
- Consumes: `initAuth`（Task 1）、`viewAccount`（Task 2）。
- Produces: 無新函式（整合與資產）。

- [ ] **Step 1: Add the 「個人」tab to index.html**

`index.html` tabbar（index.html:35-37 的店家 anchor 之後）加：

```html
        <a class="tabbar-btn" data-route="/shops" href="#/shops">
            <span class="tabbar-btn-pill"><i class="bi bi-shop"></i><span>店家</span></span>
        </a>
        <a class="tabbar-btn" data-route="/me" href="#/me">
            <span class="tabbar-btn-pill"><i class="bi bi-person-circle"></i><span>個人</span></span>
        </a>
    </nav>
```

（`.tabbar` 是 `display:flex`、`.tabbar-btn` 是 `flex:1`，第 4 顆自動均分為 1/4 寬，無需改 CSS 版面。）

- [ ] **Step 2: Call initAuth on bootstrap**

`app.js` 的 `DOMContentLoaded`（app.js:3830-3833）改為：

```js
document.addEventListener('DOMContentLoaded', () => {
    if (!location.hash) location.hash = '#/records';
    initAuth();
    renderRoute();
});
```

（`initAuth` 是 async fire-and-forget：未設定雲端時立即 return，不阻塞首次 render；登入狀態由 `onAuthStateChange` 事後更新。測試環境 `isCloudReady()` 為 false 故不觸網。）

- [ ] **Step 3: Add account styles**

`styles.css` 找到 tabbar 樣式區塊尾（app.js 無關；styles.css:109 之後、`/* ───── Cards ── */` banner 之前不要插）——改在 Cards 區塊後找一個合適位置，或直接在檔案尾新增一段 banner：

```css
/* ───── Account (個人) ────────────────────────────────────────────────── */
.account-card { max-width: 22rem; margin: 2rem auto; }
.account-avatar {
    width: 5rem; height: 5rem; border-radius: 50%;
    object-fit: cover; margin-bottom: 0.75rem;
}
.account-avatar-placeholder {
    font-size: 4rem; color: var(--text-muted); line-height: 1;
    display: block; margin-bottom: 0.5rem;
}
.account-email { word-break: break-all; }
```

- [ ] **Step 4: Bump sw.js VERSION**

`sw.js:6`：

```js
const VERSION = 'v9';
```

- [ ] **Step 5: Run full suite + lint**

Run: `npm run lint && npm test`
Expected: 全綠（`#/me` 路由測試仍通過；stylelint 無 error）。

- [ ] **Step 6: Commit**

```bash
git add index.html app.js styles.css sw.js
git commit -m "feat(auth): #78 個人 tab + bootstrap initAuth + 樣式 (sw v9)"
```

---

## Task 4: README — Google provider 設定 + 多租戶 SQL 段

**Files:**
- Modify: `README.md`（Supabase 設定區塊 D/E 升級段之後，比照既有格式）

**Interfaces:** 文件；無程式介面。

- [ ] **Step 1: Add the multi-tenant upgrade section to README**

在 README.md 既有的「E. 升級到 v3」段之後，新增一段（比照 D/E 的 `alter table ... add column if not exists` 格式）：

````markdown
F. **升級到多租戶第一階段（#78：加 `user_id`）**：在 SQL Editor 執行：

```sql
alter table coffee.cupping_records add column if not exists user_id uuid references auth.users(id);
alter table coffee.tasting_records add column if not exists user_id uuid references auth.users(id);
alter table coffee.shops           add column if not exists user_id uuid references auth.users(id);
```

回填既有資料給某帳號（該帳號需先用 Google 登入過一次，`auth.users` 才有列）：

```sql
update coffee.cupping_records c set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and c.user_id is null;
update coffee.tasting_records t set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and t.user_id is null;
update coffee.shops s set user_id = u.id
    from auth.users u where u.email = '你的登入信箱' and s.user_id is null;
```

> RLS 本階段**仍維持 open access**（未登入照樣可讀寫）；真正的每列存取隔離留待後續。

**啟用 Google 登入**：Supabase Dashboard → Authentication → Providers → Google，
填入 Google Cloud OAuth 的 Client ID / Secret；Authentication → URL Configuration
的 *Redirect URLs* 加入本機 static server（如 `http://localhost:8000`）與
GitHub Pages 網址（如 `https://<user>.github.io/coffee-review/`）。
Google Cloud Console 的 OAuth *Authorized redirect URI* 需填
`https://<project-ref>.supabase.co/auth/v1/callback`。
````

- [ ] **Step 2: Verify README renders (visual scan)**

Run: `npm run lint` (docs 不受 lint 影響，此步僅確認未破壞其他檔)
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(auth): #78 README Google provider 設定 + 多租戶 SQL"
```

---

## Task 5: 線上 Supabase — 加 `user_id` 欄 + 回填（MCP，含確認 gate）

> **本 task 動到共用的線上資料庫。每個會寫入的步驟前，先向 user 出示將執行的 SQL 並取得同意。**

**Files:** 無 repo 檔案；操作線上 Supabase（Supabase MCP）。

**Interfaces:**
- Consumes: Supabase MCP（`list_projects` / `list_tables` / `apply_migration` / `execute_sql`）。
- 前置：Task 1-3 已合入或可在本機以真實 DB 手測；user 已完成 Google provider 設定（Task 4 的步驟）。

- [ ] **Step 1: 找到 project 與確認現況**

用 `list_projects` 找出 coffee-review 的 project ref，`list_tables`（schema `coffee`）確認三表尚無 `user_id`。
向 user 回報 project ref 與將加的欄位，取得同意。

- [ ] **Step 2: 加 `user_id` 欄（additive，安全）**

取得同意後，`apply_migration`（name 如 `add_user_id_multitenant`）：

```sql
alter table coffee.cupping_records add column if not exists user_id uuid references auth.users(id);
alter table coffee.tasting_records add column if not exists user_id uuid references auth.users(id);
alter table coffee.shops           add column if not exists user_id uuid references auth.users(id);
```

Verify: 再次 `list_tables` 確認三表都有 `user_id`（nullable）。
（此為 additive nullable 欄，對現行 production 程式無影響，可先於程式上線執行。）

- [ ] **Step 3: 等 user 用 `sean22492249@gmail.com` 登入一次**

提示 user：部署/本機跑起來後，用 `sean22492249@gmail.com` 點「使用 Google 登入」完成一次登入，
讓 `auth.users` 產生對應列。等待 user 回報完成。

- [ ] **Step 4: 確認該帳號已存在**

`execute_sql`：

```sql
select id, email from auth.users where email = 'sean22492249@gmail.com';
```

Expected: 回一列。若空 → 回到 Step 3。

- [ ] **Step 5: 回填舊資料（取得同意後）**

向 user 出示以下 SQL 並取得同意，再 `execute_sql`：

```sql
update coffee.cupping_records c set user_id = u.id
    from auth.users u where u.email = 'sean22492249@gmail.com' and c.user_id is null;
update coffee.tasting_records t set user_id = u.id
    from auth.users u where u.email = 'sean22492249@gmail.com' and t.user_id is null;
update coffee.shops s set user_id = u.id
    from auth.users u where u.email = 'sean22492249@gmail.com' and s.user_id is null;
```

- [ ] **Step 6: 驗證回填**

`execute_sql`：

```sql
select
  (select count(*) from coffee.cupping_records where user_id is null) as cupping_null,
  (select count(*) from coffee.tasting_records where user_id is null) as tasting_null,
  (select count(*) from coffee.shops           where user_id is null) as shops_null;
```

Expected: 三個計數皆為 0（假設回填當下沒有其他未登入寫入）。向 user 回報結果。

---

## Self-Review

**Spec coverage：**
- 設計「1. 登入/登出/session」→ Task 1（`signInWithGoogle`/`signOutUser`/`initAuth`）+ Task 3（bootstrap）。✅
- 「2. 個人 tab」→ Task 2（view/route）+ Task 3（tabbar）。✅
- 「3. 三表加 user_id」→ Task 5（線上）+ Task 4（README SQL，供他人自架）。✅
- 「4. insert 蓋章、update 不動」→ Task 1 Step 5。✅
- 「5. 舊資料回填」→ Task 5 Step 3-6。✅
- 「不放分析 placeholder」→ Task 2 未含分析區塊。✅
- 「RLS 不動」→ 全 plan 未改 policy；Task 4 README 明述維持 open access。✅
- 測試（`accountMarkup` 三態、insert 蓋章）→ Task 1/2 測試。✅
- sw VERSION bump → Task 3 Step 4。✅

**Placeholder scan：** 無 TBD/TODO；每個 code step 均含完整程式碼。✅

**Type consistency：** `currentUserId`/`setSessionUser`/`stampUserId`/`accountMarkup`/`viewAccount`/`initAuth` 命名於各 task 一致；`accountMarkup({ cloudReady, user })` 參數形狀在 Task 2 定義並於測試沿用一致。✅
