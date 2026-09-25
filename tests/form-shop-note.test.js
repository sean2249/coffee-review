import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 品鑑表單裡的店家筆記卡：沒填過 → 展開讓使用者當場補；填過 → 收合，只提示
// 以前記過什麼。卡片本體直接取自 index.html 的 #tpl-form，避免測試複製一份
// 會跟真實樣板走鐘的 markup。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const FORM_MARKUP = INDEX.split('<template id="tpl-form">')[1].split('</template>')[0];

const NOTE = {
    intro: '常來的口袋名單',
    ambience_axes: { quiet_lively: 1, bright_dim: 3, spacious_cozy: 2 },
    facilities: ['有插座', 'Wi-Fi'],
    space_style: '日式',
    space_materials: ['木質'],
    service_ratings: { greeting: 2, speed: 3 },
    menu_food: ['甜點'],
    drink_types: ['手沖/單品'],
    ambience_notes: '角落很安靜',
    style_notes: null,
    service_notes: null,
    updated_at: '2026-08-01T03:00:00Z',
};

let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({
        // 掛在 #app 外面：app.js 的首次 renderRoute 會清掉 #app 的內容。
        bodyHtml: `<main id="app"></main>${FORM_MARKUP}`,
    }));
    // 這家店還沒有筆記：Worker 對 maybeSingle 的位置回 200 null。
    win.apiFetch = () => Promise.resolve(null);
});

const card = () => doc.getElementById('form-shop-note-card');
const body = () => doc.getElementById('formShopNote');
const toggle = () => doc.getElementById('form-shop-note-toggle');
const status = () => doc.getElementById('form-shop-note-status');

describe('mountFormShopNote', () => {
    it('沒填過 → 展開，狀態標成「還沒填過」', () => {
        win.mountFormShopNote(null);
        expect(body().classList.contains('show')).toBe(true);
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(toggle().classList.contains('collapsed')).toBe(false);
        expect(status().textContent).toContain('還沒填過');
        expect(status().classList.contains('is-empty')).toBe(true);
    });

    it('填過 → 收合，狀態標成「已填寫」加上更新日期', () => {
        win.mountFormShopNote(NOTE);
        expect(body().classList.contains('show')).toBe(false);
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(toggle().classList.contains('collapsed')).toBe(true);
        expect(status().textContent).toContain('已填寫');
        expect(status().textContent).toContain('2026');
        expect(status().classList.contains('is-empty')).toBe(false);
    });

    it('把既有筆記填回編輯器（收合的是過去的紀錄，不是空白表單）', () => {
        win.mountFormShopNote(NOTE);
        expect(doc.getElementById('sn-intro').value).toBe('常來的口袋名單');
        const p = win.buildShopNotePayload();
        expect(p.facilities).toEqual(['有插座', 'Wi-Fi']);
        expect(p.space_style).toBe('日式');
        expect(p.ambience_axes.quiet_lively).toBe(1);
        expect(p.drink_types).toEqual(['手沖/單品']);
    });

    it('換到沒筆記的店家時清掉上一家的內容', () => {
        win.mountFormShopNote(NOTE);
        win.mountFormShopNote(null);
        expect(doc.getElementById('sn-intro').value).toBe('');
        const p = win.buildShopNotePayload();
        expect(p.facilities).toEqual([]);
        expect(p.space_style).toBe(null);
        expect(p.ambience_axes.quiet_lively).toBe(null);
    });
});

describe('formShopNoteIsDirty', () => {
    it('沒掛載過 → 不算 dirty（不會寫出一筆空筆記）', () => {
        expect(win.formShopNoteIsDirty()).toBe(false);
    });

    it('剛掛載、使用者還沒動 → 不算 dirty', () => {
        win.mountFormShopNote(null);
        expect(win.formShopNoteIsDirty()).toBe(false);
        win.mountFormShopNote(NOTE);
        expect(win.formShopNoteIsDirty()).toBe(false);
    });

    it('改了任一欄位 → dirty', () => {
        win.mountFormShopNote(NOTE);
        doc.getElementById('sn-intro').value = '改成別的';
        expect(win.formShopNoteIsDirty()).toBe(true);
    });

    it('點掉一個設施 chip → dirty', () => {
        win.mountFormShopNote(NOTE);
        doc.querySelector('[data-tag-chips="facilities"] .tag-chip.selected').click();
        expect(win.formShopNoteIsDirty()).toBe(true);
    });

    // 換店家會重掛編輯器。host 若沿用同一個節點，initTagSections 的 click 委派
    // 會疊第二層，每次點擊被處理兩次而互相抵銷 —— chip 點了等於沒點。
    it('重掛之後 chip 仍然點得動', () => {
        win.mountFormShopNote(NOTE);
        win.mountFormShopNote(null);
        const chip = doc.querySelector('[data-tag-chips="facilities"] .tag-chip');
        chip.click();
        expect(chip.classList.contains('selected')).toBe(true);
        expect(win.formShopNoteIsDirty()).toBe(true);
    });
});

describe('refreshFormShopNote', () => {
    it('沒選店家 → 整張卡收起來', async () => {
        card().hidden = false;
        await win.refreshFormShopNote('');
        expect(card().hidden).toBe(true);
        expect(win.formShopNoteIsDirty()).toBe(false);
    });

    it('選了店家 → 顯示卡片；讀不到既有筆記時當成沒填過並展開', async () => {
        await win.refreshFormShopNote('shop-1');
        expect(card().hidden).toBe(false);
        expect(body().classList.contains('show')).toBe(true);
        expect(status().textContent).toContain('還沒填過');
    });
});
