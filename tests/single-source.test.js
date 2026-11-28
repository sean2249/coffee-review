import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 同一個意義只留一個來源（#181）。等級顏色在 tier-palette.test.js；這裡是同一類的其他幾處：
// 記錄類型的顏色與名稱、錯誤色、README 的徽章表。

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const README = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
// :root 區塊以外的 CSS（token 只能在 :root 定義）。
const CSS_OUTSIDE_ROOT = CSS.replace(/:root\s*\{[^}]*\}/g, '');

let win, doc;
beforeAll(async () => {
    ({ window: win, document: doc } = await loadApp());
});

describe('記錄類型的顏色', () => {
    it('類型標籤讀 :root 的類型 token', () => {
        for (const type of ['cupping', 'tasting', 'session']) {
            expect(CSS, type).toMatch(new RegExp(`--type-${type}-bg:`));
            expect(CSS, type).toMatch(new RegExp(`--type-${type}-fg:`));
        }
    });

    it('元件裡沒有寫死的顏色值（含抄來的等級色）', () => {
        const rules = CSS_OUTSIDE_ROOT.match(/\.record-card-type-badge[^{]*\{[^}]*\}/g) || [];
        expect(rules.length).toBeGreaterThan(0);
        for (const rule of rules) expect(rule).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    });
});

describe('錯誤 / 危險色', () => {
    it('紅色只在 :root 定義成 token', () => {
        for (const red of ['#b42318', '#b03a36', '#842029', '#d9534f', '#f5c2c0', '#fef3f3']) {
            expect(CSS_OUTSIDE_ROOT.toLowerCase(), red).not.toContain(red);
        }
        expect(CSS).toMatch(/--danger:/);
    });

    it('Bootstrap 的紅（.btn-danger、.btn-outline-danger、.text-danger）也讀 --danger', () => {
        expect(CSS).toMatch(/--bs-danger:\s*var\(--danger\)/);
        // --bs-danger-rgb 只能寫成數字：要和 --danger 的色碼一致。
        const hexMatch = CSS.match(/--danger:\s*#([0-9a-fA-F]{6})\b/);
        const tripleMatch = CSS.match(/--bs-danger-rgb:\s*(\d+),\s*(\d+),\s*(\d+)/);
        expect(hexMatch, '--danger 要是 6 位數 hex').toBeTruthy();
        expect(tripleMatch, '--bs-danger-rgb 要是三個數字').toBeTruthy();
        const rgb = [0, 2, 4].map(i => parseInt(hexMatch[1].slice(i, i + 2), 16));
        expect(tripleMatch.slice(1).map(Number)).toEqual(rgb);
        const rule = sel => CSS.match(new RegExp(`\\n\\.${sel}\\s*\\{[^}]*\\}`))?.[0] || '';
        for (const v of ['bg', 'border-color', 'hover-bg', 'hover-border-color', 'active-bg',
            'active-border-color', 'disabled-bg', 'disabled-border-color']) {
            expect(rule('btn-danger'), v).toMatch(new RegExp(`--bs-btn-${v}:\\s*var\\(--danger`));
        }
        for (const v of ['color', 'border-color', 'hover-bg', 'hover-border-color', 'active-bg',
            'active-border-color', 'disabled-color', 'disabled-border-color']) {
            expect(rule('btn-outline-danger'), v).toMatch(new RegExp(`--bs-btn-${v}:\\s*var\\(--danger`));
        }
        for (const sel of ['btn-danger', 'btn-outline-danger']) {
            expect(rule(sel), sel).toMatch(/--bs-btn-focus-shadow-rgb:\s*var\(--bs-danger-rgb\)/);
        }
        // 元件直接讀 --danger；var(--bs-danger) 只留給 Bootstrap 自己（-rgb 給 focus ring 用）。
        expect(CSS_OUTSIDE_ROOT).not.toMatch(/var\(--bs-danger(?!-rgb)\b/);
    });
});

// 名稱和 TYPE_LABELS 一字不差不代表有讀它：暫時改掉 TYPE_LABELS，畫面要跟著變。
describe('記錄類型的名稱都來自 TYPE_LABELS', () => {
    const RENAMED = { cupping: '改名甲', tasting: '改名乙', session: '改名丙' };
    function withRenamedLabels(fn) {
        const original = win.eval('({ ...TYPE_LABELS })');
        win.eval(`Object.assign(TYPE_LABELS, ${JSON.stringify(RENAMED)})`);
        return Promise.resolve(fn()).finally(() => win.eval(`Object.assign(TYPE_LABELS, ${JSON.stringify(original)})`));
    }

    it('新增記錄的模式選擇', () => withRenamedLabels(() => {
        const el = doc.createElement('div');
        el.innerHTML = win.newModePickerOptions();
        const shown = [...el.querySelectorAll('.new-mode-picker-label')].map(s => s.textContent);
        expect(shown).toEqual([RENAMED.cupping, RENAMED.tasting, RENAMED.session]);
    }));

    it('記錄篩選的類型 chip', () => withRenamedLabels(async () => {
        win.setSessionUser({ id: 'u1' });
        win.apiFetch = () => Promise.resolve([]);
        win.location.hash = '#/records';
        await new Promise(r => setTimeout(r, 50));
        for (const type of ['cupping', 'tasting', 'session']) {
            expect(doc.querySelector(`[data-filter-type="${type}"]`).textContent.trim(), type).toBe(RENAMED[type]);
        }
    }));
});

describe('README 的徽章表', () => {
    it('每一列都和 totalScoreTiers 一致（徽章名、全稱、敘述）', () => {
        for (const t of win.eval('totalScoreTiers')) {
            const row = README.split('\n').find(l => l.startsWith(`| ${t.medal} |`));
            expect(row, t.id).toBeTruthy();
            const cells = row.split('|').map(c => c.trim());
            expect(cells[2], t.id).toBe(t.badgeName);
            expect(cells[3], t.id).toBe(t.name);
            expect(cells[5], t.id).toBe(t.description);
        }
    });
});
