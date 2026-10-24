import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// showToast / showErrorToast (app.js) 共用 #toastMsg。它是 live region，
// 必須在第一則 toast 之前就以空內容存在，螢幕閱讀器才會念出第一則。

let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
});

function expectLiveRegion(el) {
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('aria-atomic')).toBe('true');
}

describe('toast live region', () => {
    it('exists empty with live-region attributes before any toast', () => {
        const el = doc.getElementById('toastMsg');
        expect(el).not.toBeNull();
        expectLiveRegion(el);
        expect(el.textContent).toBe('');
        expect(el.classList.contains('show')).toBe(false);
    });

    it('showToast and showErrorToast reuse the same node and keep its attributes', () => {
        const el = doc.getElementById('toastMsg');

        win.showToast('✓ 已儲存');
        expect(doc.getElementById('toastMsg')).toBe(el);
        expectLiveRegion(el);
        expect(el.textContent).toBe('✓ 已儲存');
        expect(el.classList.contains('show')).toBe(true);
        expect(el.classList.contains('error')).toBe(false);

        win.showErrorToast('儲存失敗');
        expect(doc.getElementById('toastMsg')).toBe(el);
        expectLiveRegion(el);
        expect(el.textContent).toBe('儲存失敗');
        expect(el.classList.contains('error')).toBe(true);
        expect(doc.querySelectorAll('#toastMsg')).toHaveLength(1);
    });

    it('clears the text after the toast fades out, so no stale message lingers', async () => {
        const el = doc.getElementById('toastMsg');
        win.showToast('✓ 已儲存', 10);
        expect(el.textContent).toBe('✓ 已儲存');
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(el.classList.contains('show')).toBe(false);
        expect(el.textContent).toBe('');
        expectLiveRegion(el);
    });

    it('a new toast during the fade-out is not wiped by the earlier clear', async () => {
        const el = doc.getElementById('toastMsg');
        win.showToast('第一則', 10);
        await new Promise(resolve => setTimeout(resolve, 50));
        win.showErrorToast('儲存失敗');
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(el.textContent).toBe('儲存失敗');
        expect(el.classList.contains('show')).toBe(true);
    });
});
