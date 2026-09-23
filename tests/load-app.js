// Loads app.js as a classic browser script inside a fresh jsdom window.
// Top-level `function` declarations in classic scripts become properties of
// the global object, so the returned `window` exposes tierFromScore,
// decodeFlavorMeta, renderFlavorWheel, toggleFlavor, etc. directly.
//
// 沒有任何網路：app.js 只會透過 apiFetch 打同源的 /api/*，而 jsdom 沒有實作
// fetch，所以未 stub 的呼叫會 reject 而不是外連。需要後端的測試自己 stub apiFetch。
//
// Note: app.js registers a DOMContentLoaded handler that ends up calling
// renderRoute, which calls wheelState.clear(). JSDOM fires DOMContentLoaded
// on a microtask after parsing, so if we return synchronously the event
// can fire between a test's beforeEach and the test body — wiping any
// wheelState populated in the hook. We await DOMContentLoaded here so the
// caller can rely on a quiescent app once loadApp resolves.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = fs.readFileSync(path.join(here, '..', 'public', 'app.js'), 'utf8');

export async function loadApp({ bodyHtml = '<main id="app"></main>' } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
        url: 'http://localhost/#/none',
        runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
    // jsdom ships no CSS.escape. app.js uses it to build attribute selectors from
    // user-entered chip values (setChipValues / addCustomChip). Browsers all have it,
    // so this is a harness gap, not an app gap — shim the spec algorithm's common path.
    if (!ctx.CSS) {
        ctx.CSS = { escape: v => String(v).replace(/[^\w-]/gu, c => `\\${c}`) };
    }
    // initAuth 會打 /api/me；jsdom 沒有 fetch，它會 reject 並被 initAuth 吞掉，
    // 留下 state.user = null（未登入）。只靜音那一則，其餘 console.error 照樣浮出來
    // —— 全部靜音會讓測試裡真正的例外變成看不見。
    const realError = ctx.console.error.bind(ctx.console);
    ctx.console.error = (...args) => {
        if (typeof args[0] === 'string' && args[0].startsWith('initAuth 失敗')) return;
        realError(...args);
    };
    vm.runInContext(APP_JS, ctx, { filename: 'app.js' });

    // Let DOMContentLoaded fire (and the renderRoute it triggers complete)
    // before handing control back. After this point no further routing
    // happens unless the test changes location.hash.
    if (ctx.document.readyState !== 'complete') {
        await new Promise(resolve => {
            if (ctx.document.readyState === 'complete') return resolve();
            ctx.window.addEventListener('load', () => resolve(), { once: true });
        });
    }
    // One more macrotask flush so any async render started by DOMContentLoaded
    // settles before we return.
    await new Promise(resolve => setTimeout(resolve, 0));

    return { dom, window: ctx, document: ctx.document };
}
