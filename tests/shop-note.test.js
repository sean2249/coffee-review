import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 店家體驗（環境/設施/風格/材質/服務/餐點/飲料）已從 tasting_records 搬到
// coffee.shop_notes —— 每人每店一筆，不再綁在單次到訪上。

let win, doc;

// 掛一個店家筆記編輯器（intro textarea + initTagSections 產生的 widget）。
async function mountEditor(note = null) {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: '<main id="app"></main><textarea id="sn-intro"></textarea><div id="sections"></div>',
    }));
    win.initTagSections(doc.getElementById('sections'));
    if (note) win.applyShopNoteToEditor(note);
    return win.buildShopNotePayload;
}

const FULL_NOTE = {
    intro: '常來的口袋名單',
    ambience_axes: { quiet_lively: 1, bright_dim: 3, spacious_cozy: 2 },
    facilities: ['有插座', 'Wi-Fi'],
    space_style: '日式',
    space_materials: ['木質', '植栽'],
    service_ratings: { greeting: 2, speed: 3 },
    menu_food: ['甜點'],
    drink_types: ['手沖/單品'],
    ambience_notes: '角落很安靜',
    style_notes: '木頭調',
    service_notes: '出杯快',
};

describe('buildShopNotePayload', () => {
    it('returns an empty-but-well-formed note for a fresh editor', async () => {
        const build = await mountEditor();
        const p = build();
        expect(p.intro).toBe(null);
        expect(p.ambience_axes).toEqual({ quiet_lively: null, bright_dim: null, spacious_cozy: null });
        expect(p.service_ratings).toEqual({ greeting: null, speed: null });
        expect(p.facilities).toEqual([]);
        expect(p.space_style).toBe(null);
        expect(p.schema_version).toBe(1);
    });

    it('defaults 飲料類型 to 義式咖啡 on a fresh note', async () => {
        const build = await mountEditor();
        expect(build().drink_types).toEqual(['義式咖啡']);
    });

    it('round-trips a full note through the editor', async () => {
        const build = await mountEditor(FULL_NOTE);
        const p = build();
        for (const k of Object.keys(FULL_NOTE)) {
            expect(p[k], `field ${k}`).toEqual(FULL_NOTE[k]);
        }
    });

    it('carries custom chip values that are not in the preset list', async () => {
        const build = await mountEditor({ ...FULL_NOTE, space_style: '海島風', menu_food: ['滷味'] });
        const p = build();
        expect(p.space_style).toBe('海島風');
        expect(p.menu_food).toEqual(['滷味']);
    });

    it('never writes shop_id / user_id — the api layer owns those', async () => {
        const build = await mountEditor(FULL_NOTE);
        const p = build();
        expect(p).not.toHaveProperty('shop_id');
        expect(p).not.toHaveProperty('user_id');
    });
});

describe('renderShopNoteSections', () => {
    beforeEach(async () => { ({ window: win } = await loadApp()); });

    it('renders nothing for a null note', () => {
        expect(win.renderShopNoteSections(null)).toBe('');
    });

    it('renders nothing when every experience field is empty', () => {
        expect(win.renderShopNoteSections({ intro: '只有介紹' })).toBe('');
    });

    it('renders the axis labels rather than raw numbers', () => {
        const html = win.renderShopNoteSections(FULL_NOTE);
        expect(html).toContain('安靜');   // quiet_lively: 1
        expect(html).toContain('昏黃');   // bright_dim: 3
        expect(html).toContain('有插座');
        expect(html).toContain('出杯快');
    });

    it('still shows schema_version<=3 legacy tags under a （舊版）heading', () => {
        const html = win.renderShopNoteSections({ legacy_atmosphere_tags: ['安靜', '好聊天'] });
        expect(html).toContain('（舊版）');
        expect(html).toContain('好聊天');
    });

    it('escapes note text', () => {
        const html = win.renderShopNoteSections({ ...FULL_NOTE, service_notes: '<img src=x>' });
        expect(html).not.toContain('<img src=x>');
        expect(html).toContain('&lt;img');
    });
});

describe('renderShopNoteCard', () => {
    beforeEach(async () => { ({ window: win } = await loadApp()); });

    it('offers 新增 and an empty state when there is no note yet', () => {
        const html = win.renderShopNoteCard(null);
        expect(html).toContain('還沒有這家店的筆記');
        expect(html).toContain('新增');
    });

    it('offers 編輯 and shows the intro once a note exists', () => {
        const html = win.renderShopNoteCard(FULL_NOTE);
        expect(html).toContain('編輯');
        expect(html).toContain('常來的口袋名單');
    });
});
