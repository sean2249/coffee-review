import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// RLS 收緊後未登入的 anon 讀不到任何列。前端必須先擋，否則使用者只會看到
// 一片空清單、以為資料不見了。這裡鎖住「擋板有出現」且「完全沒發查詢」。
const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };

let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({ supabaseConfig: CLOUD }));
});

function gateFor(viewName, ...args) {
    const root = doc.getElementById('app');
    win[viewName](root, ...args);
    return root.innerHTML;
}

describe('renderAccessGate', () => {
    it('shows the cloud warning when cloud is not configured', async () => {
        const { window: w, document: d } = await loadApp(); // no supabaseConfig
        const root = d.getElementById('app');
        expect(w.renderAccessGate(root)).toBe(true);
        expect(root.innerHTML).toContain('尚未設定雲端');
    });

    it('shows the sign-in prompt when cloud is ready but nobody is signed in', () => {
        win.setSessionUser(null);
        const root = doc.getElementById('app');
        expect(win.renderAccessGate(root)).toBe(true);
        expect(root.innerHTML).toContain('請先登入');
        expect(doc.getElementById('gate-signin')).not.toBe(null);
    });

    it('lets the view through once signed in', () => {
        win.setSessionUser({ id: 'user-1' });
        const root = doc.getElementById('app');
        root.innerHTML = '';
        expect(win.renderAccessGate(root)).toBe(false);
        expect(root.innerHTML).toBe(''); // gate wrote nothing — caller renders
    });
});

describe('data views are gated when logged out', () => {
    const views = [
        ['viewRecordsList', []],
        ['viewNewModePicker', []],
        ['viewRecordDetail', [{ mode: 'cupping', recordId: 'r1' }]],
        ['viewForm', [{ mode: 'cupping', recordId: null }]],
        ['viewShopsList', []],
        ['viewShopDetail', ['shop-1']],
    ];

    for (const [name, args] of views) {
        it(`${name} renders the sign-in prompt instead of data`, () => {
            win.setSessionUser(null);
            const html = gateFor(name, ...args);
            expect(html).toContain('請先登入');
        });

        it(`${name} issues no Supabase query while logged out`, async () => {
            win.setSessionUser(null);
            let called = false;
            win.ensureSupabase = () => { called = true; return Promise.resolve(null); };
            gateFor(name, ...args);
            await new Promise(r => setTimeout(r, 0));
            expect(called).toBe(false);
        });
    }
});
