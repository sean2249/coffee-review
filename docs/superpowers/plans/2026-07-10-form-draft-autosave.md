# 表單草稿自動儲存（localStorage）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增／編輯記錄時，使用者輸入的內容 debounce 300ms 後自動寫入 localStorage；再次進入同一表單路由時，若偵測到未過期草稿，顯示內嵌 banner 讓使用者選擇還原或刪除；成功送出或按刪除草稿後清除；超過 7 天自動失效。（GitHub issue #17）

**Architecture:** 不新寫一套 `serializeForm`／`restoreForm`，而是**重用既有的 `buildFormPayload(mode)`**（已把整張表單——含 chip、radio、風味輪、CoE、scale slider——序列化成 record 形狀物件）當序列化器，並把 `loadRecordIntoForm` 的「把 record 套進 DOM」那段抽成 `applyRecordToForm(mode, r)` 當還原器。草稿即「一份 record 形狀的 payload」，與正式存檔／讀檔走同一條路徑，避免第二套序列化邏輯漂移。草稿寫入採 **baseline diff**：進場時對乾淨表單拍一張 baseline，只有偏離 baseline 才寫草稿，改回原狀則清除——這樣 pristine 表單不會被誤存成草稿。

**Tech Stack:** Vanilla ES2022（`app.js` classic script）、localStorage、Vitest + jsdom（`tests/`）、Bootstrap utility class + `styles.css` token。無 build、無 framework。

---

## Key design decisions

| # | 決策 | 為何 | 待 user 確認 |
|---|---|---|---|
| D1 | 重用 `buildFormPayload` / 抽 `applyRecordToForm` 當序列化／還原器，**不**照 issue 字面新寫 `serializeForm`/`restoreForm` | DRY：省掉重複 ~130 行、且草稿與正式存檔共用同一 round-trip，chip／風味輪／CoE 自動涵蓋，不會兩套邏輯漂移 | ✅ 待確認（偏離 issue 實作提示的措辭，但等價達成需求） |
| D2 | 草稿寫入採 baseline diff（偏離才存、改回即清） | 避免 pristine 新表單或 prefill shop 被誤存成草稿，導致每次進 `#/new/cupping` 都跳還原 banner | — |
| D3 | 監聽 form 的 `input` + `change` + `click` 三事件觸發 debounce | chip／風味輪／CoE／分數是 click 互動（不發 input 事件），單靠 input/change 抓不到 | — |
| D4 | localStorage 讀寫全包 try/catch，失敗靜默降級 | 隱私模式／配額滿時不能讓表單壞掉 | — |
| D5 | key = `coffee-review:draft:new/<mode>` 或 `coffee-review:draft:<mode>/<id>` | 依 issue 建議；new 與各 id 天然隔離 | — |
| D6 | 存 `{schema:1, savedAt, mode, payload}`；讀取時檢查 schema 與 7 天 TTL，過期／壞掉即刪 | 版本演進保護 + 過期保護（驗收條件） | — |

> 註：本專案的 `-decisions.md` 慣例僅在 `superpowers:brainstorming` 產出 design doc 時觸發；本次為 writing-plans，故決策記錄內嵌於此表，不另開 decisions 檔。

## File Structure

- **Modify `app.js`**
  - 新增 `~app.js:260` 附近一個「Form draft autosave」區塊：常數 + `draftKey` / `writeDraft` / `readDraft` / `clearDraft` / `formatDraftAge` / `showDraftBanner` / `setupDraftAutosave`。
  - 重構 `loadRecordIntoForm`（app.js:2961）：抽出 `applyRecordToForm(mode, r)`（純套 DOM，無 await／api）。
  - `viewForm`（app.js:1362）尾端呼叫 `setupDraftAutosave(mode, recordId)`。
  - `submitForm`（app.js:2873）成功分支清草稿 + 取消 pending debounce。
- **Modify `styles.css`**：新增 `/* ───── Draft banner ───── */` 區塊。
- **Create `tests/draft-storage.test.js`**：涵蓋 key 推導、round-trip、id 隔離、7 天過期、壞 JSON／schema 不符、缺 key。
- **Modify `sw.js`**：`VERSION` `v7` → `v8`，強制使用者換到新 app shell。

**測試涵蓋界線（誠實說明）：** 純儲存層（key／round-trip／隔離／過期）用 Vitest 單元測。debounce 計時、banner UI、chip／風味輪序列化 round-trip 因 `viewForm` 被 `isCloudReady()` gate 擋住（jsdom 無 `SUPABASE_CONFIG`），改用瀏覽器手動驗證（Task 5）。

---

### Task 1: 草稿儲存層（純 helper）+ 單元測試

**Files:**
- Modify: `app.js`（在 `escapeHtml` 之後、`~app.js:300` 附近新增區塊）
- Test: `tests/draft-storage.test.js`（新建）

- [ ] **Step 1: 寫失敗測試** — 建立 `tests/draft-storage.test.js`

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 表單草稿儲存層（app.js）：draftKey / writeDraft / readDraft / clearDraft。
// 鎖定 key 推導、round-trip、不同記錄隔離、7 天過期、壞資料防護。

let win;

beforeEach(async () => {
    ({ window: win } = await loadApp());
    win.localStorage.clear();
});

describe('draftKey', () => {
    it('新記錄用 new/<mode>', () => {
        expect(win.draftKey('cupping', null)).toBe('coffee-review:draft:new/cupping');
        expect(win.draftKey('tasting', null)).toBe('coffee-review:draft:new/tasting');
    });
    it('編輯用 <mode>/<id>', () => {
        expect(win.draftKey('cupping', 'abc')).toBe('coffee-review:draft:cupping/abc');
    });
});

describe('write/read/clear round-trip', () => {
    it('寫入後讀回相同 payload', () => {
        const key = win.draftKey('cupping', null);
        win.writeDraft(key, 'cupping', { bean_name: '耶加雪菲', notes: 'x' });
        const got = win.readDraft(key);
        expect(got.mode).toBe('cupping');
        expect(got.payload).toEqual({ bean_name: '耶加雪菲', notes: 'x' });
        expect(typeof got.savedAt).toBe('number');
    });

    it('不同記錄互不干擾', () => {
        const k1 = win.draftKey('cupping', 'id-1');
        const k2 = win.draftKey('cupping', 'id-2');
        win.writeDraft(k1, 'cupping', { bean_name: 'A' });
        win.writeDraft(k2, 'cupping', { bean_name: 'B' });
        expect(win.readDraft(k1).payload.bean_name).toBe('A');
        expect(win.readDraft(k2).payload.bean_name).toBe('B');
    });

    it('clearDraft 後讀回 null', () => {
        const key = win.draftKey('tasting', null);
        win.writeDraft(key, 'tasting', { item_ordered: '手沖' });
        win.clearDraft(key);
        expect(win.readDraft(key)).toBeNull();
    });

    it('缺 key 回 null', () => {
        expect(win.readDraft('coffee-review:draft:new/cupping')).toBeNull();
    });
});

describe('過期與防護', () => {
    it('超過 7 天回 null 並刪除 key', () => {
        const key = win.draftKey('cupping', null);
        const eightDays = 8 * 24 * 60 * 60 * 1000;
        win.localStorage.setItem(key, JSON.stringify({
            schema: 1, savedAt: Date.now() - eightDays, mode: 'cupping', payload: { bean_name: 'old' },
        }));
        expect(win.readDraft(key)).toBeNull();
        expect(win.localStorage.getItem(key)).toBeNull();
    });

    it('壞掉的 JSON 回 null 並刪除', () => {
        const key = win.draftKey('cupping', null);
        win.localStorage.setItem(key, '{ not json');
        expect(win.readDraft(key)).toBeNull();
        expect(win.localStorage.getItem(key)).toBeNull();
    });

    it('schema 不符回 null 並刪除', () => {
        const key = win.draftKey('cupping', null);
        win.localStorage.setItem(key, JSON.stringify({
            schema: 999, savedAt: Date.now(), mode: 'cupping', payload: {},
        }));
        expect(win.readDraft(key)).toBeNull();
        expect(win.localStorage.getItem(key)).toBeNull();
    });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/draft-storage.test.js`
Expected: FAIL — `win.draftKey is not a function`（helper 尚未實作）

- [ ] **Step 3: 實作 helper** — 在 `app.js` 的 `escapeHtml` 函式之後（`~app.js:300`）插入

```js
// ─── Form draft autosave (localStorage) ──────────────────────────────────────
// 草稿 = 一份 record 形狀的 payload（buildFormPayload 產出、applyRecordToForm 還原）。
// 讀寫全包 try/catch：隱私模式 / 配額滿時靜默降級，不影響表單運作。
const DRAFT_PREFIX = 'coffee-review:draft:';
const DRAFT_SCHEMA = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天過期保護

function draftKey(mode, recordId) {
    return DRAFT_PREFIX + (recordId ? `${mode}/${recordId}` : `new/${mode}`);
}

function writeDraft(key, mode, payload) {
    try {
        localStorage.setItem(key, JSON.stringify({
            schema: DRAFT_SCHEMA,
            savedAt: Date.now(),
            mode,
            payload,
        }));
    } catch { /* localStorage 不可用 → 略過 */ }
}

function readDraft(key) {
    let raw;
    try {
        raw = localStorage.getItem(key);
    } catch { return null; }
    if (!raw) return null;

    let obj;
    try {
        obj = JSON.parse(raw);
    } catch {
        clearDraft(key); // 壞掉的 JSON 直接清掉
        return null;
    }
    if (!obj || obj.schema !== DRAFT_SCHEMA || typeof obj.savedAt !== 'number') {
        clearDraft(key); // 版本不符 / 結構壞掉
        return null;
    }
    if (Date.now() - obj.savedAt > DRAFT_TTL_MS) {
        clearDraft(key); // 過期
        return null;
    }
    return obj; // { schema, savedAt, mode, payload }
}

function clearDraft(key) {
    try {
        localStorage.removeItem(key);
    } catch { /* ignore */ }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/draft-storage.test.js`
Expected: PASS（8 個 it 全綠）

- [ ] **Step 5: Commit**

```bash
git add app.js tests/draft-storage.test.js
git commit -m "feat(draft): localStorage 草稿儲存層 + 單元測試 (#17)"
```

---

### Task 2: 抽出 `applyRecordToForm(mode, r)`（純重構，行為不變）

**Files:**
- Modify: `app.js:2961-3106`（`loadRecordIntoForm`）

- [ ] **Step 1: 重構** — 把 `loadRecordIntoForm` 內「取到 `r` 之後、套進 DOM」那段（現 app.js:2970–3101，從 `// shop —` 到 `updateEstimatedTotalDisplay();`）整段搬到新函式 `applyRecordToForm(mode, r)`。`loadRecordIntoForm` 只保留 fetch + guard + 呼叫。搬移**逐字保留**，不改任何一行套 DOM 邏輯。

改後的 `loadRecordIntoForm`：

```js
async function loadRecordIntoForm(mode, recordId) {
    try {
        const r = await api.getRecord(mode, recordId);
        if (!r) {
            showErrorToast('找不到記錄');
            navigate('/records');
            return;
        }
        applyRecordToForm(mode, r);
    } catch (e) {
        console.error(e);
        showErrorToast('讀取失敗：' + (e.message || e));
    }
}

// 把一份 record 形狀物件（來自 api 或草稿）套進目前掛載的表單 DOM。
function applyRecordToForm(mode, r) {
    // shop — the hidden input holds any id regardless of cache, so a deleted
    // shop's FK is preserved on save; renderShopTriggerLabel shows the fallback.
    const shopSel = document.getElementById('f-shop');
    shopSel.value = r.shop_id || '';
    renderShopTriggerLabel();
    refreshImportBeanForShop(mode, shopSel.value);

    // …（原 app.js:2977–3101 內容原封不動貼到這裡，結尾為）…
    updateEstimatedTotalDisplay();
}
```

> ⚠️ 注意：搬移範圍**不含** `loadRecordIntoForm` 開頭的 `try` / `const r = await api.getRecord` / `if (!r)` guard，也**不含**結尾的 `catch`。只搬 `// shop —`（原 2970）到 `updateEstimatedTotalDisplay();`（原 3101）之間、以及那段開頭的 shop 三行。

- [ ] **Step 2: 跑既有測試確認無回歸**

Run: `npm test`
Expected: PASS（全部既有測試綠；此步無新測試，靠既有套件把關重構等價）

- [ ] **Step 3: Lint**

Run: `npm run lint:js`
Expected: 0 error

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "refactor(form): 抽出 applyRecordToForm 供草稿還原重用 (#17)"
```

---

### Task 3: banner + 自動儲存接線（`setupDraftAutosave`）

**Files:**
- Modify: `app.js`（緊接 Task 1 區塊之後新增 `formatDraftAge` / `showDraftBanner` / `setupDraftAutosave`）
- Modify: `app.js:1362`（`viewForm` 尾端）
- Modify: `app.js:2873`（`submitForm` 成功分支）

- [ ] **Step 1: 新增 banner + autosave 函式** — 接在 Task 1 的 `clearDraft` 之後

```js
function formatDraftAge(savedAt) {
    const diff = Date.now() - savedAt;
    const min = Math.floor(diff / 60000);
    if (min < 1) return '剛剛';
    if (min < 60) return `${min} 分鐘前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小時前`;
    return `${Math.floor(hr / 24)} 天前`;
}

// 內嵌還原列，插在表單最上方（不用 modal）。onRestore / onDiscard 由呼叫端提供。
function showDraftBanner(form, draft, onRestore, onDiscard) {
    form.querySelector('.draft-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'draft-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
        <span class="draft-banner-text">
            <i class="bi bi-clock-history"></i>
            發現未儲存的草稿（${escapeHtml(formatDraftAge(draft.savedAt))}），要還原嗎？
        </span>
        <span class="draft-banner-actions">
            <button type="button" class="btn btn-sm btn-primary" data-draft="restore">還原</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-draft="discard">刪除草稿</button>
        </span>`;
    banner.querySelector('[data-draft="restore"]').addEventListener('click', () => {
        onRestore();
        banner.remove();
        showToast('✓ 已還原草稿');
    });
    banner.querySelector('[data-draft="discard"]').addEventListener('click', () => {
        onDiscard();
        banner.remove();
    });
    form.prepend(banner);
}

// 掛在 viewForm 尾端：進場偵測草稿 → 顯示 banner；並綁 debounce 自動儲存。
function setupDraftAutosave(mode, recordId) {
    const form = document.querySelector('.record-form');
    if (!form) return;
    const key = draftKey(mode, recordId);

    // baseline = 目前乾淨表單的序列化；草稿只在偏離 baseline 後才寫，
    // 改回原狀則清除，避免把 pristine 表單也存成草稿。
    let baseline = JSON.stringify(buildFormPayload(mode));

    const existing = readDraft(key);
    if (existing && existing.payload) {
        showDraftBanner(form, existing,
            () => {
                applyRecordToForm(mode, existing.payload);
                baseline = JSON.stringify(buildFormPayload(mode)); // 還原後以草稿為新 baseline
            },
            () => clearDraft(key),
        );
    }

    let timer = null;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const current = JSON.stringify(buildFormPayload(mode));
            if (current === baseline) {
                clearDraft(key); // 改回原狀 → 不留草稿
            } else {
                writeDraft(key, mode, JSON.parse(current));
            }
        }, 300);
    };

    // input/change 抓原生輸入；click 抓 chip / 風味輪 / CoE / 分數等非輸入互動。
    form.addEventListener('input', schedule);
    form.addEventListener('change', schedule);
    form.addEventListener('click', schedule);

    // 供 submit 成功後清草稿 + 取消尚未觸發的 debounce（避免 clear 後又被寫回）。
    state.currentForm.draftKey = key;
    state.currentForm.cancelDraftSave = () => clearTimeout(timer);
}
```

- [ ] **Step 2: viewForm 尾端呼叫** — `app.js:1408`（`viewForm` 結尾 `}` 之前，即 `if (recordId) { … } else { … }` 區塊之後）加：

```js
    setupDraftAutosave(mode, recordId);
}
```

（即：`recordId` 分支跑完 `loadRecordIntoForm`／或 new 分支設好 label 後，最後一行呼叫；確保 baseline 拍在表單完整初始化／還原之後。）

- [ ] **Step 3: submitForm 成功清草稿** — 修改 `app.js:2919-2928` 的成功分支：

```js
        const payload = buildFormPayload(mode);
        if (recordId) {
            await api.updateRecord(mode, recordId, payload);
            state.currentForm?.cancelDraftSave?.();
            if (state.currentForm?.draftKey) clearDraft(state.currentForm.draftKey);
            showToast('✓ 已更新');
        } else {
            const created = await api.createRecord(mode, payload);
            state.currentForm?.cancelDraftSave?.();
            if (state.currentForm?.draftKey) clearDraft(state.currentForm.draftKey);
            showToast('✓ 已儲存');
            navigate(`/${mode}/${created.id}`);
            return;
        }
```

- [ ] **Step 4: Lint**

Run: `npm run lint:js`
Expected: 0 error（注意 `catch { }` 內都有註解 → 不觸發 `no-empty`；`?.` optional chaining 為 ES2022 合法）

- [ ] **Step 5: 跑全套測試確認無回歸**

Run: `npm test`
Expected: PASS（含 Task 1 的 draft-storage 測試；既有測試不受影響，因 `viewForm` 在無雲端下仍提早 return，autosave 不會被觸發）

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat(draft): 進場還原 banner + debounce 自動儲存 + 送出清草稿 (#17)"
```

---

### Task 4: Draft banner 樣式

**Files:**
- Modify: `styles.css`（檔尾或既有 banner／card 樣式附近新增區塊）

- [ ] **Step 1: 新增樣式** — 用既有 `:root` token（`--accent` #0e4d4d、`--accent-tint`、`--radius-md`、`--text-primary`、`--border`）

```css
/* ───── Draft banner ───── */
.draft-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    margin-bottom: 1rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--accent-tint);
    color: var(--text-primary);
    font-size: 0.9rem;
}

.draft-banner-text i {
    margin-right: 0.35rem;
    color: var(--accent);
}

.draft-banner-actions {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
}
```

- [ ] **Step 2: Lint CSS**

Run: `npm run lint:css`
Expected: 0 error

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(draft): 未儲存草稿還原列樣式 (#17)"
```

---

### Task 5: 瀏覽器手動驗證（cloud-gated，無法單元測）

**前置：** `config.js` 已存在（含 Supabase creds）。用靜態伺服器開啟，勿用 `file://`（會壞 service worker 與動態 import）。

- [ ] **Step 1: 起靜態伺服器**（此 app 無 dev server；用 `.claude/launch.json` 設一個 `python3 -m http.server 8000` 或既有設定，透過 preview_start 啟動）

- [ ] **Step 2: 新增草稿 → 離開 → 返回 → 還原**
  1. 進 `#/new/cupping`，填豆名「測試草稿」、選一個風味輪節點、動一個 CoE 分數、填 notes。
  2. 等 >300ms，點底部 tabbar 切到 `#/records`。
  3. 回 `#/new/cupping` → 預期頂端出現 `.draft-banner`「發現未儲存的草稿（… 前），要還原嗎？」。
  4. 按「還原」→ 預期豆名／風味／分數／notes 全部回填，banner 消失，跳 toast「✓ 已還原草稿」。
  Verify: `preview_snapshot` 確認欄位值 + `preview_console_logs` 無錯。

- [ ] **Step 3: 送出後草稿清除**
  1. 承上，補齊必填後按「儲存」。
  2. 存檔成功後回該路由 / 重進 `#/new/cupping` → 預期**不再**出現 banner。
  Verify: `preview_eval` 讀 `localStorage.getItem('coffee-review:draft:new/cupping')` 應為 `null`。

- [ ] **Step 4: 刪除草稿**
  1. 再造一個新草稿，返回表單看到 banner，按「刪除草稿」。
  2. 預期 banner 消失、重進不再出現。
  Verify: `preview_eval` 讀對應 key 應為 `null`。

- [ ] **Step 5: 不同 id 隔離**
  1. 開兩筆既有杯測記錄 `#/cupping/<idA>`、`#/cupping/<idB>`，各改一處但不存、離開。
  2. 分別重進 → 各自 banner 帶各自內容，互不串。
  Verify: `preview_eval` 確認 `coffee-review:draft:cupping/<idA>` 與 `.../<idB>` 各自獨立。

- [ ] **Step 6: 過期保護（快速驗證）**
  Verify: `preview_eval` 手動塞一筆 `savedAt` 為 8 天前的草稿到某 key，重進該路由 → banner 不出現且 key 被刪。

- [ ] **Step 7: pristine 不誤存**
  進 `#/new/tasting` 什麼都不動就離開 → 重進**不**出現 banner。
  Verify: `preview_eval` 讀 `coffee-review:draft:new/tasting` 應為 `null`。

- [ ] **Step 8: 截圖存證** — `preview_screenshot` 拍 banner 顯示狀態。

---

### Task 6: 更新 sw.js VERSION（推使用者換新 app shell）

**Files:**
- Modify: `sw.js:6`

- [ ] **Step 1: 版本 +1**

```js
const VERSION = 'v8';
```

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump VERSION v8 for draft autosave (#17)"
```

---

## Self-Review

**1. Spec coverage（對照 issue 驗收條件）**
- ✅ 輸入後 debounce 300ms 寫 localStorage → Task 3 Step 1 `schedule`（300ms setTimeout）。
- ✅ key 設計 `coffee-review:draft:<route>`（`new/cupping`、`cupping/<id>`）→ Task 1 `draftKey` + Task 1 測試。
- ✅ 進入同表單路由偵測 draft → 內嵌 banner（非 modal）「發現未儲存草稿，要還原嗎？」→ Task 3 `showDraftBanner` + Task 4 樣式。
- ✅ 成功送出 / 按刪除草稿後清 key → Task 3 Step 3（submit）+ banner「刪除草稿」按鈕。
- ✅ 不同記錄（不同 id）互不干擾 → key 設計 + Task 1 隔離測試 + Task 5 Step 5。
- ✅ 超過 7 天自動清除 → `DRAFT_TTL_MS` + `readDraft` 過期分支 + Task 1 過期測試。
- ✅ 抽出 serialize / restore helper → 以 `buildFormPayload`（序列化）+ `applyRecordToForm`（還原）達成（D1，語意等價 issue 的 `serializeForm`/`restoreForm`）。
- ✅ chip / radio / 風味輪等非標準 input 含在序列化內 → `buildFormPayload` 本就涵蓋（chip 經 `readChipGroup`、風味輪經 `getSelectedFlavorIds`、CoE 經 `coeState`），click 事件觸發存檔（D3）。

**2. Placeholder scan**：無 TBD／TODO／「加上適當錯誤處理」等佔位；每個 code step 均給完整程式碼。

**3. Type consistency**：`draftKey`/`writeDraft`/`readDraft`/`clearDraft`/`applyRecordToForm`/`setupDraftAutosave`/`showDraftBanner`/`formatDraftAge` 命名在各 Task 一致；草稿物件結構 `{schema, savedAt, mode, payload}` 在 write（Task 1）與 read（Task 1）與 banner（`draft.savedAt`、`draft.payload`，Task 3）一致；`state.currentForm.draftKey` / `.cancelDraftSave` 在 setup（Task 3 Step 1）與 submit（Task 3 Step 3）一致。

**待 user 確認：** D1（重用 `buildFormPayload`／`applyRecordToForm` 取代字面上的 `serializeForm`/`restoreForm`）——實作等價且更 DRY，但措辭偏離 issue 提示，執行前值得點頭。
