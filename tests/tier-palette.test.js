import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 等級（徽章）顏色只有一個來源：styles.css 的 --t1-bg … --t7-bg，經由「.t-<id> → --tier-bg /
// --tier-fg」這一張對照表給所有元件用。JS 只給 tier.cssClass，不帶顏色。曾經分數面板和
// 詳情頁用了另一套 tier.color，銀牌變成純灰、跟徽章對不上（#169 之後）。

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

let win, doc;
beforeAll(async () => {
    ({ window: win, document: doc } = await loadApp());
});

describe('等級顏色只有一個來源', () => {
    it('totalScoreTiers 不帶顏色，只有 cssClass', () => {
        for (const t of win.eval('totalScoreTiers')) {
            expect(t, t.id).not.toHaveProperty('color');
            expect(t.cssClass, t.id).toMatch(/^t-/);
        }
    });

    it('app.js 不讀 tier 的 .color', () => {
        expect(APP.match(/\b\w*[Tt]ier\.color\b/g) || []).toEqual([]);
    });

    it('每個 cssClass 在對照表裡都有 --tier-bg / --tier-fg', () => {
        for (const t of win.eval('totalScoreTiers')) {
            const rule = new RegExp(`\\.${t.cssClass}\\s*\\{[^}]*--tier-bg:[^}]*--tier-fg:`);
            expect(CSS, t.cssClass).toMatch(rule);
        }
    });

    // `\b` 讓 var(--t4-bg, …) 這種帶後備值的寫法也算一次。
    it('--t1-bg … --t7-bg 只在對照表裡被引用一次（元件不自己對 t-* 上色）', () => {
        for (let n = 1; n <= 7; n++) {
            expect(CSS.match(new RegExp(`var\\(--t${n}-bg\\b`, 'g')) || [], `--t${n}-bg`).toHaveLength(1);
            expect(CSS.match(new RegExp(`var\\(--t${n}-fg\\b`, 'g')) || [], `--t${n}-fg`).toHaveLength(1);
        }
    });

    it('色盤的色碼只出現在 :root（元件沒有抄一份）', () => {
        const rootBlock = CSS.match(/:root\s*\{[^}]*\}/)[0];
        const palette = [...rootBlock.matchAll(/--t\d-bg:\s*(#[0-9a-fA-F]{6})/g)].map(m => m[1].toLowerCase());
        expect(palette).toHaveLength(7);
        const outside = CSS.replace(/:root\s*\{[^}]*\}/g, '').toLowerCase();
        for (const hex of palette) expect(outside, hex).not.toContain(hex);
    });

    // jsdom 算不出樣式，所以直接看規則：每個顯示等級的元件都要讀 --tier-bg。
    it.each([
        '.record-card-medal', '.tier-medal.selected', '.filter-tier-row .filter-chip.selected',
        '.stats-dist-medal', '.stats-dist-bar', '.reveal-cup-medal:not(.is-empty)',
        '.score-bar', '.score-ring-text', '.tier-badge', '.score-chip-row',
    ])('%s 讀 --tier-bg', selector => {
        const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = CSS.match(new RegExp(`(?:^|\\n|,\\s*)${esc}\\s*[,{][^}]*\\}`));
        expect(rule?.[0], selector).toMatch(/var\(--tier-bg\b/);
    });
});

describe('顯示等級的地方都掛 cssClass', () => {
    it('詳情頁的等級是徽章色的 .tier-badge，沒有行內顏色', () => {
        const el = doc.createElement('div');
        el.innerHTML = win.renderRecordDetail('cupping', {
            id: 'r1', schema_version: 4, coe_total: 84, coe_tier_id: 'like', evaluations: {}, observation: {},
        });
        const badge = el.querySelector('.tier-badge');
        expect(badge.classList.contains('t-like')).toBe(true);
        expect(badge.textContent).toBe('銀牌');
        expect(el.innerHTML).not.toMatch(/style="color:/);
    });

    it('分數面板評完後掛等級的 cssClass，不用行內底色', () => {
        doc.body.insertAdjacentHTML('beforeend', '<div id="scoreBar"></div>');
        win.eval(`adjustmentFields.forEach(f => { adjustState.values[f.key] = 0; });
            adjustState.values.flavor = 4; renderScoreBar();`);
        const bar = doc.getElementById('scoreBar');
        expect(bar.classList.contains('t-like')).toBe(true);
        expect(bar.getAttribute('style') || '').not.toContain('--tier-color');
        doc.getElementById('scoreBar').remove();
    });
});
