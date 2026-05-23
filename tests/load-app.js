// Loads app.js as a classic browser script inside a fresh jsdom window.
// Top-level `function` declarations in classic scripts become properties of
// the global object, so the returned `window` exposes tierFromScore,
// decodeFlavorMeta, renderFlavorWheel, toggleFlavor, etc. directly.
//
// We deliberately do NOT set window.SUPABASE_CONFIG, so isCloudReady()
// returns false and any render bails out without touching the network.
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
const APP_JS = fs.readFileSync(path.join(here, '..', 'app.js'), 'utf8');

export async function loadApp({ bodyHtml = '<main id="app"></main>' } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
        url: 'http://localhost/#/none',
        runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
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
