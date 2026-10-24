import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 對話框開著時背景設成 inert（inertBackground），篩選抽屜與新增記錄類型的焦點
// 移進對話框、關閉後還給開啟者。jsdom 沒有實作 inert 對焦點的影響，只能斷言屬性。

let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: '<main id="app"></main><nav class="tabbar"></nav>',
    }));
    win.showToast('x');
    // jsdom 沒開 pretendToBeVisual 就沒有 requestAnimationFrame；openFilterDrawer 用它加 .show。
    win.requestAnimationFrame = cb => cb();
});

const isInert = sel => doc.querySelector(sel).hasAttribute('inert');
const backdrop = () => doc.querySelector('.modal-backdrop-custom');

function addOpener() {
    const opener = doc.createElement('button');
    opener.type = 'button';
    doc.getElementById('app').appendChild(opener);
    opener.focus();
    return opener;
}

function expectBackgroundInert() {
    expect(isInert('#app')).toBe(true);
    expect(isInert('.tabbar')).toBe(true);
    expect(backdrop().hasAttribute('inert')).toBe(false);
    expect(isInert('#toastMsg')).toBe(false);
}

function expectNoInert() {
    expect(doc.querySelectorAll('[inert]').length).toBe(0);
}

describe('openFilterDrawer', () => {
    it('inerts the background, focuses the close button, and restores both on close', () => {
        const opener = addOpener();
        win.openFilterDrawer();
        expectBackgroundInert();
        expect(doc.activeElement).toBe(backdrop().querySelector('.modal-close'));
        doc.getElementById('filter-drawer-done').click();
        expect(backdrop()).toBeNull();
        expectNoInert();
        expect(doc.activeElement).toBe(opener);
    });
});

describe('openNewRecordPicker', () => {
    it('inerts the background, focuses the first type button, and restores both on close', () => {
        const opener = addOpener();
        win.openNewRecordPicker({ id: 's1', name: '測試咖啡' });
        expectBackgroundInert();
        expect(doc.activeElement).toBe(backdrop().querySelector('.new-mode-picker-btn'));
        backdrop().querySelector('.modal-close').click();
        expect(backdrop()).toBeNull();
        expectNoInert();
        expect(doc.activeElement).toBe(opener);
    });

    it('leaves focus alone on close when the opener was removed', () => {
        const opener = addOpener();
        win.openNewRecordPicker({ id: 's1', name: '測試咖啡' });
        opener.remove();
        backdrop().querySelector('.modal-close').click();
        expectNoInert();
        expect(doc.activeElement).not.toBe(opener);
    });
});

describe('inertBackground — stacked dialogs', () => {
    it('inerts the outer backdrop and restores only what each call set', () => {
        const a = doc.createElement('div');
        doc.body.appendChild(a);
        const restoreA = win.inertBackground(a);
        const b = doc.createElement('div');
        doc.body.appendChild(b);
        const restoreB = win.inertBackground(b);
        expect(a.hasAttribute('inert')).toBe(true);
        expect(b.hasAttribute('inert')).toBe(false);

        b.remove();
        restoreB();
        expect(a.hasAttribute('inert')).toBe(false);
        expect(isInert('#app')).toBe(true);
        expect(isInert('.tabbar')).toBe(true);

        a.remove();
        restoreA();
        expectNoInert();
    });
});
