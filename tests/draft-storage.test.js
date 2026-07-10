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
