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

    // 對照表那幾行（.t-* { … }）以外，沒有任何地方讀 --t1-* … --t7-*（含帶後備值的寫法）。
    it('--t1-* … --t7-* 只在對照表裡被讀（元件不自己對 t-* 上色）', () => {
        const paletteLine = /^\.t-[a-z]+\s*\{[^}]*\}$/gm;
        expect(CSS.match(paletteLine) || []).toHaveLength(7);
        const elsewhere = CSS.replace(paletteLine, '').match(/var\(--t\d-[a-z]+\b/g) || [];
        expect(elsewhere).toEqual([]);
    });

    // 色碼或 rgb()/rgba() 都算抄（#181 抓到的類型色就是 rgba(192, 140, 42, …)）。
    it('色盤的底色只出現在 :root（元件沒有抄一份，hex 或 rgb 都不行）', () => {
        const rootBlock = CSS.match(/:root\s*\{[^}]*\}/)[0];
        const palette = [...rootBlock.matchAll(/--t\d-bg:\s*#([0-9a-fA-F]{6})/g)].map(m => m[1].toLowerCase());
        expect(palette).toHaveLength(7);
        const outside = CSS.replace(/:root\s*\{[^}]*\}/g, '').toLowerCase();
        for (const hex of palette) {
            expect(outside, hex).not.toContain(`#${hex}`);
            const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
            // 逗號或空白分隔都算：rgb(192, 140, 42) / rgb(192 140 42 / 10%)
            expect(outside, `rgb ${r},${g},${b}`).not.toMatch(new RegExp(`rgba?\\(\\s*${r}[\\s,]+${g}[\\s,]+${b}\\b`));
        }
    });

    // 元件不能自己對某一級上色（.tier-badge.t-like { … } 這種覆寫），巢狀在 @media 裡也一樣。
    it('每個 .t-* 只出現在對照表那一行', () => {
        for (const t of win.eval('totalScoreTiers')) {
            const hits = CSS.match(new RegExp(`\\.${t.cssClass}(?![\\w-])`, 'g')) || [];
            expect(hits, t.cssClass).toHaveLength(1);
            expect(CSS, t.cssClass).toMatch(new RegExp(`\\n\\.${t.cssClass}\\s*\\{\\s*--tier-bg:`));
        }
    });

    // jsdom 算不出樣式，所以直接看規則：每個顯示等級的元件都要讀 --tier-bg。
    it.each([
        '.record-card-medal', '.filter-tier-row .filter-chip', '.filter-tier-row .filter-chip.selected',
        '.stats-dist-medal', '.stats-dist-bar', '.reveal-cup-medal:not(.is-empty)',
        '.score-bar', '.score-ring-text', '.tier-badge', '.tier-glow',
    ])('%s 讀 --tier-bg', selector => {
        const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = CSS.match(new RegExp(`(?:^|\\n|,\\s*)${esc}\\s*[,{][^}]*\\}`));
        expect(rule?.[0], selector).toMatch(/var\(--tier-bg\b/);
    });
});

describe('顯示等級的地方都掛 cssClass', () => {
    const detail = coe => {
        const el = doc.createElement('div');
        el.innerHTML = win.renderRecordDetail('cupping', {
            id: 'r1', schema_version: 4, coe_total: coe, coe_tier_id: 'like', evaluations: {}, observation: {},
        });
        return el;
    };

    it('詳情頁的等級：淡底＋色字的膠囊，字母＋中文，依分數歸級（不看舊的 coe_tier_id）', () => {
        const el = detail(84);
        const badge = el.querySelector('.coe-card .tier-badge');
        expect([...badge.classList]).toEqual(expect.arrayContaining(['t-c', 'is-tint']));
        expect(badge.querySelector('.tier-badge-letter').textContent).toBe('C');
        expect(badge.textContent).toBe('C優良');
        expect(badge.classList.contains('tier-glow')).toBe(false);
        expect(el.innerHTML).not.toMatch(/style="color:/);
    });

    it('A 以上在詳情頁有光暈', () => {
        expect(detail(90).querySelector('.coe-card .tier-badge').classList.contains('tier-glow')).toBe(true);
        expect(detail(95).querySelector('.coe-card .tier-badge').classList.contains('tier-glow')).toBe(true);
    });

    function scoreBarFor(flavor) {
        doc.body.insertAdjacentHTML('beforeend', '<div id="scoreBar"></div>');
        win.eval(`adjustmentFields.forEach(f => { adjustState.values[f.key] = 0; });
            adjustState.values.flavor = ${flavor}; renderScoreBar();`);
        const bar = doc.getElementById('scoreBar');
        const out = { cls: [...bar.classList], style: bar.getAttribute('style') || '', ring: bar.querySelector('.score-ring-text').textContent };
        bar.remove();
        return out;
    }

    it('分數面板評完後掛等級的 cssClass，環裡是字母，不用行內底色', () => {
        const bar = scoreBarFor(4); // 84 → C
        expect(bar.cls).toContain('t-c');
        expect(bar.cls).not.toContain('tier-glow');
        expect(bar.ring).toBe('C');
        expect(bar.style).not.toContain('--tier-color');
    });

    it('分數面板 A 以上加光暈', () => {
        const bar = scoreBarFor(10); // 90 → A
        expect(bar.cls).toEqual(expect.arrayContaining(['t-a', 'tier-glow']));
    });
});
