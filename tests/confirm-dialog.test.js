import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// confirmDialog (app.js) — Promise-based replacement for native confirm().
// These tests lock the resolve semantics (確認 → true; 取消 / Escape /
// backdrop click → false) and that the dialog cleans up after itself.

let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
});

function openDialog(opts) {
    const p = win.confirmDialog(opts);
    const backdrop = doc.querySelector('.modal-backdrop-custom');
    return { p, backdrop };
}

describe('confirmDialog', () => {
    it('renders title/message and resolves true on 確認', async () => {
        const { p, backdrop } = openDialog({
            title: '刪除記錄',
            message: '刪除「耶加雪菲」？此操作無法復原。',
            confirmText: '刪除',
            danger: true,
        });
        expect(backdrop).not.toBeNull();
        expect(backdrop.querySelector('h3').textContent).toBe('刪除記錄');
        expect(backdrop.querySelector('.confirm-dialog-message').textContent)
            .toContain('耶加雪菲');
        const okBtn = backdrop.querySelector('[data-confirm="ok"]');
        expect(okBtn.className).toContain('btn-danger');
        okBtn.click();
        await expect(p).resolves.toBe(true);
        expect(doc.querySelector('.modal-backdrop-custom')).toBeNull();
        expect(doc.body.classList.contains('modal-open-custom')).toBe(false);
    });

    it('resolves false on 取消', async () => {
        const { p, backdrop } = openDialog({ message: 'x' });
        backdrop.querySelector('[data-confirm="cancel"]').click();
        await expect(p).resolves.toBe(false);
        expect(doc.querySelector('.modal-backdrop-custom')).toBeNull();
    });

    it('resolves false on Escape', async () => {
        const { p } = openDialog({ message: 'x' });
        doc.dispatchEvent(new win.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(p).resolves.toBe(false);
        expect(doc.querySelector('.modal-backdrop-custom')).toBeNull();
    });

    it('resolves false on backdrop click, but not on dialog body click', async () => {
        const { p, backdrop } = openDialog({ message: 'x' });
        backdrop.querySelector('.confirm-dialog-message').click();
        expect(doc.querySelector('.modal-backdrop-custom')).not.toBeNull();
        backdrop.click();
        await expect(p).resolves.toBe(false);
    });

    it('escapes HTML in title and renders message as plain text', async () => {
        const { p, backdrop } = openDialog({
            title: '<img src=x onerror=1>',
            message: '<b>bold?</b>\n第二行',
        });
        expect(backdrop.querySelector('h3').textContent).toBe('<img src=x onerror=1>');
        expect(backdrop.querySelector('img')).toBeNull();
        expect(backdrop.querySelector('.confirm-dialog-message b')).toBeNull();
        expect(backdrop.querySelector('.confirm-dialog-message').textContent)
            .toBe('<b>bold?</b>\n第二行');
        backdrop.querySelector('[data-confirm="cancel"]').click();
        await p;
    });
});
