import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// Worker 的每個查詢都帶 and user_id = ?，未登入時什麼都讀不到。前端必須先擋，
// 否則使用者只會看到一片空清單、以為資料不見了。
// 這裡鎖住「擋板有出現」且「完全沒打 API」。
let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
});

function gateFor(viewName, ...args) {
    const root = doc.getElementById('app');
    win[viewName](root, ...args);
    return root.innerHTML;
}

describe('renderAccessGate', () => {
    it('shows the sign-in prompt when nobody is signed in', () => {
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
        ['viewSessionForm', [{ sessionId: null }]],
        ['viewSessionForm', [{ sessionId: 's1' }]],
        ['viewSessionDetail', ['s1']],
    ];

    for (const [name, args] of views) {
        it(`${name} renders the sign-in prompt instead of data`, () => {
            win.setSessionUser(null);
            const html = gateFor(name, ...args);
            expect(html).toContain('請先登入');
        });

        it(`${name} issues no API request while logged out`, async () => {
            win.setSessionUser(null);
            let called = false;
            win.apiFetch = () => { called = true; return Promise.resolve(null); };
            gateFor(name, ...args);
            await new Promise(r => setTimeout(r, 0));
            expect(called).toBe(false);
        });
    }
});
