import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 記錄列表全文搜尋（#19）：searchHit 的欄位與順序、與其他篩選 AND、場次 / 攤平杯、
// ?q= 與舊 ?shop= 的讀回、無結果畫面、「符合：」提示行的 escape，以及輸入時的請求次數。
let win, doc;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const jasmine = 'x__l1-floral__l2-茉莉';
const floral = 'x__l1-floral';

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
    win.setSessionUser({ id: 'u1' });
    win.eval(`state.shops = [{ id: 'shop-a', name: '甲咖啡' }]; state.shopsLoaded = true;`);
});

describe('searchHit — 每個欄位各自命中', () => {
    const base = { id: 'r', _type: 'cupping' };
    it.each([
        ['標題', { title: 'Zeta 晨間' }],
        ['豆名', { bean_name: 'Zeta' }],
        ['品項', { _type: 'tasting', item_ordered: 'Zeta 拿鐵' }],
        ['產地', { origin: 'Zeta 產區' }],
        ['處理法', { process: 'Zeta 水洗' }],
        ['配方', { blend_composition: 'Zeta 50%' }],
        ['烘焙度', { roast: 'Zeta 淺焙' }],
        ['香氣備註', { observation: { aroma: { notes: 'Zeta 很香' } } }],
        ['乾香', { observation: { aroma: { dryAroma: 'Zeta 堅果' } } }],
        ['濕香', { observation: { aroma: { wetAroma: 'Zeta 焦糖' } } }],
        ['備註', { notes: '尾段 Zeta' }],
        ['瑕疵', { defects: 'Zeta 澀' }],
    ])('%s', (label, extra) => {
        const hit = win.searchHit({ ...base, ...extra }, 'zeta');
        expect(hit.label).toBe(label);
        expect(hit.value.toLowerCase()).toContain('zeta');
    });

    it('店家名稱', () => {
        expect(win.searchHit({ ...base, shop_id: 'shop-a' }, '甲咖').label).toBe('店家');
    });

    it('店家清單沒載入時只略過店家，其他欄位照常比對', () => {
        win.eval('state.shopsLoaded = false;');
        expect(win.searchHit({ ...base, shop_id: 'shop-a' }, '甲咖')).toBeNull();
        expect(win.searchHit({ ...base, shop_id: 'shop-a', notes: '甲咖' }, '甲咖').label).toBe('備註');
    });

    it('已選風味名稱（含祖先層）', () => {
        const r = { ...base, evaluations: { flavor: { score: 7, flavors: [floral, jasmine] } } };
        expect(win.searchHit(r, '茉莉')).toEqual({ label: '風味', value: '茉莉', flavor: true });
        expect(win.searchHit(r, '花香').label).toBe('風味');
    });

    it('香氣的風味名稱與 chip 值', () => {
        const r = { ...base, observation: { aroma: { flavors: [jasmine], intensity: '飽滿', persistence: '長' } } };
        expect(win.searchHit(r, '茉莉')).toEqual({ label: '香氣', value: '茉莉', flavor: true });
        expect(win.searchHit(r, '飽滿')).toEqual({ label: '香氣', value: '飽滿', flavor: true });
        expect(win.searchHit(r, '長')).toEqual({ label: '香氣', value: '長', flavor: true });
    });

    it('不分大小寫', () => {
        expect(win.searchHit({ ...base, bean_name: 'Geisha' }, 'geisha').label).toBe('豆名');
    });

    it('依固定順序只回第一個命中的欄位', () => {
        expect(win.searchHit({ ...base, bean_name: 'Zeta', notes: 'Zeta' }, 'zeta').label).toBe('豆名');
    });

    it('不比對評分項目的備註與瑕疵 chip', () => {
        const r = { ...base, evaluations: { acidity: { score: 6, notes: 'Zeta' } }, defects_tags: ['Zeta'] };
        expect(win.searchHit(r, 'zeta')).toBeNull();
    });
});

describe('杯測場次', () => {
    const session = {
        id: 's1', _type: 'session', title: '週末場', notes: '朋友帶來的豆', created_at: '2026-06-20T00:00:00Z',
        cups: [
            { id: 'k1', code: 'A', bean_name: '肯亞 AA' },
            { id: 'k2', code: 'B', bean_name: '範例莊園 藝伎' },
        ],
    };

    it('場次標題 / 備註或任一杯命中就顯示場次，杯命中帶杯編號', () => {
        expect(win.searchHit(session, '週末').label).toBe('標題');
        expect(win.searchHit(session, '朋友').label).toBe('備註');
        expect(win.searchHit(session, '藝伎')).toEqual({ label: '豆名', value: '範例莊園 藝伎', cupCode: 'B' });
        expect(win.searchHit(session, '巴拿馬')).toBeNull();
    });

    it('分組模式下只留命中的杯；場次標題 / 備註命中則每杯都留', () => {
        const flat = win.rowsForGrouping([session]);
        win.hydrateFilterFromQuery({ q: '藝伎' });
        expect(win.applyAdvancedFilters(flat).map(r => r.id)).toEqual(['k2']);
        win.hydrateFilterFromQuery({ q: '朋友' });
        const hits = win.applyAdvancedFilters(flat);
        expect(hits.map(r => r.id)).toEqual(['k1', 'k2']);
        expect(win.searchHit(hits[0], '朋友').label).toBe('場次備註');
        expect(win.searchHit(hits[0], '週末').label).toBe('場次標題');
    });

    it('場次卡的提示行前面有杯編號', () => {
        const card = doc.createElement('div');
        card.innerHTML = win.renderRecordCard(session, '藝伎');
        expect(card.querySelector('.record-card-hit').textContent).toBe('符合：B · 豆名「範例莊園 藝伎」');
    });
});

describe('與其他篩選 AND', () => {
    const rows = [
        { id: 'a', _type: 'cupping', bean_name: 'Geisha', coe_tier_id: 'recommend', created_at: '2026-06-10T00:00:00Z' },
        { id: 'b', _type: 'cupping', bean_name: 'Geisha', coe_tier_id: 'common', created_at: '2026-06-10T00:00:00Z' },
        { id: 'c', _type: 'cupping', bean_name: 'Bourbon', coe_tier_id: 'recommend', created_at: '2026-06-10T00:00:00Z' },
        { id: 'd', _type: 'cupping', bean_name: 'Geisha', coe_tier_id: 'recommend', created_at: '2026-05-01T00:00:00Z' },
    ];

    it('搜尋字 + 徽章 + 日期', () => {
        win.hydrateFilterFromQuery({ q: 'geisha', tier: 'recommend', from: '2026-06-01' });
        expect(win.applyAdvancedFilters(rows).map(r => r.id)).toEqual(['a']);
    });
});

describe('?q= 讀回與序列化', () => {
    it('q 寫回 hash，不再寫 shop', () => {
        win.hydrateFilterFromQuery({ q: '  藝伎 ' });
        win.syncFilterToHash();
        expect(decodeURIComponent(win.location.hash)).toBe('#/records?q=藝伎');
        expect(win.hasAnyFilter()).toBe(true);
    });

    it('舊的 ?shop= 讀成 q', () => {
        win.hydrateFilterFromQuery({ shop: '範例' });
        win.syncFilterToHash();
        expect(decodeURIComponent(win.location.hash)).toBe('#/records?q=範例');
    });
});

describe('提示行', () => {
    it('備註含 HTML 時逐字顯示，不變成標籤', () => {
        const card = doc.createElement('div');
        card.innerHTML = win.renderRecordCard({ id: 'r', _type: 'cupping', notes: '<b>a&b</b>' }, 'a&b');
        const line = card.querySelector('.record-card-hit');
        expect(line.textContent).toBe('符合：備註「<b>a&b</b>」');
        expect(line.querySelector('b')).toBeNull();
        expect(line.querySelector('mark.search-hit').textContent).toBe('a&b');
    });

    it('風味命中用「標籤 名稱」格式', () => {
        const card = doc.createElement('div');
        card.innerHTML = win.renderRecordCard({
            id: 'r', _type: 'cupping', evaluations: { flavor: { flavors: [jasmine] } },
        }, '茉莉');
        expect(card.querySelector('.record-card-hit').textContent).toBe('符合：風味 茉莉');
    });

    it('超過 20 字時取命中處前後 8 字，被截掉的那側加「…」，換行壓成空白', () => {
        const snippet = win.renderHitSnippet('一二三四五六七八九十\n一二三四五六七八九十茉莉一二三四五六七八九十', '茉莉');
        expect(snippet).toBe('…三四五六七八九十<mark class="search-hit">茉莉</mark>一二三四五六七八…');
        expect(win.renderHitSnippet('尾段有茉莉花香', '茉莉')).toBe('尾段有<mark class="search-hit">茉莉</mark>花香');
    });

    it('沒傳 kw（店家頁）就沒有提示行', () => {
        win.hydrateFilterFromQuery({ q: 'geisha' });
        const card = doc.createElement('div');
        card.innerHTML = win.renderRecordCard({ id: 'r', _type: 'cupping', bean_name: 'Geisha' });
        expect(card.querySelector('.record-card-hit')).toBeNull();
    });
});

// ─── 掛上整個列表頁 ──────────────────────────────────────────────────────────
const ROWS = [
    { id: 'g', _type: 'cupping', bean_name: 'Geisha', created_at: '2026-06-10T00:00:00Z' },
    { id: 'k', _type: 'cupping', bean_name: 'Kenya', created_at: '2026-06-09T00:00:00Z' },
];
const SEARCH_ROWS = [
    ...ROWS,
    { id: 'n', _type: 'cupping', bean_name: 'Bourbon', notes: '有 geisha 的影子', created_at: '2026-06-08T00:00:00Z' },
];

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

// records：依 path 決定回應（值或 promise）。回傳所有 /api/records 請求。
function stubApi(records) {
    const seen = [];
    win.apiFetch = (path) => {
        if (path.startsWith('/api/shops')) return Promise.resolve([{ id: 'shop-a', name: '甲咖啡' }]);
        if (path.startsWith('/api/records')) {
            seen.push(path);
            return Promise.resolve(records(path));
        }
        throw new Error(`unexpected apiFetch: ${path}`);
    };
    return seen;
}

const byFlag = path => (path.includes('withSearch=1') ? SEARCH_ROWS : ROWS);
const root = () => doc.getElementById('app');
const cardTitles = () => [...doc.querySelectorAll('.record-card-title')].map(el => el.textContent);
const decodedHash = () => decodeURIComponent(win.location.hash);

async function typeQ(value) {
    const el = doc.getElementById('filter-q');
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(250);
}

describe('列表頁', () => {
    it('只有一個搜尋框，placeholder 是新的文字', async () => {
        stubApi(byFlag);
        await win.viewRecordsList(root(), {});
        const inputs = doc.querySelectorAll('.filter-bar input[type="search"]');
        expect(inputs).toHaveLength(1);
        expect(inputs[0].placeholder).toBe('搜尋豆名、店家、風味、備註…');
        expect(doc.getElementById('filter-shop-kw')).toBeNull();
    });

    it('沒有搜尋字時不帶 withSearch；第一次輸入發一次帶旗標的請求，之後改字只重繪', async () => {
        const seen = stubApi(byFlag);
        await win.viewRecordsList(root(), {});
        expect(seen).toEqual(['/api/records?type=all']);

        await typeQ('Geisha');
        await wait(0);
        expect(seen).toEqual(['/api/records?type=all', '/api/records?type=all&withSearch=1']);
        expect(cardTitles()).toEqual(['Geisha', 'Bourbon']);
        expect(decodedHash()).toBe('#/records?q=Geisha');

        await typeQ('Kenya');
        await typeQ('');
        expect(seen).toHaveLength(2);
        expect(cardTitles()).toEqual(['Geisha', 'Kenya', 'Bourbon']);
        expect(win.location.hash).toBe('#/records');
    });

    it('第一個搜尋請求在途時繼續打字，不再發請求', async () => {
        const pending = deferred();
        const seen = stubApi(path => (path.includes('withSearch=1') ? pending.promise : ROWS));
        await win.viewRecordsList(root(), {});

        await typeQ('gei');
        await typeQ('geis');
        expect(seen).toHaveLength(2);

        pending.resolve(SEARCH_ROWS);
        await wait(0);
        expect(cardTitles()).toEqual(['Geisha', 'Bourbon']);
        expect(seen).toHaveLength(2);
    });

    it('較早的無旗標回應晚到，不會蓋掉搜尋結果', async () => {
        const lean = deferred();
        const search = deferred();
        const seen = stubApi(path => (path.includes('withSearch=1') ? search.promise : lean.promise));
        const mounted = win.viewRecordsList(root(), {});
        await wait(0);

        await typeQ('geisha');
        expect(seen).toEqual(['/api/records?type=all', '/api/records?type=all&withSearch=1']);

        search.resolve(SEARCH_ROWS);
        await wait(0);
        lean.resolve(ROWS);
        await mounted;
        // Bourbon 只靠備註命中：備註只有搜尋回應裡才有。
        expect(cardTitles()).toEqual(['Geisha', 'Bourbon']);

        await typeQ('影子');
        expect(cardTitles()).toEqual(['Bourbon']);
        expect(seen).toHaveLength(2);
    });

    it('重新整理（帶 ?q=）時搜尋框與結果都還在', async () => {
        const seen = stubApi(byFlag);
        await win.viewRecordsList(root(), { q: 'geisha' });
        expect(doc.getElementById('filter-q').value).toBe('geisha');
        expect(seen).toEqual(['/api/records?type=all&withSearch=1']);
        expect(cardTitles()).toEqual(['Geisha', 'Bourbon']);
    });

    it('舊網址 ?shop= 讀進搜尋框並改寫成 ?q=', async () => {
        stubApi(byFlag);
        win.history.replaceState(null, '', '#/records?shop=' + encodeURIComponent('範例'));
        await win.viewRecordsList(root(), { shop: '範例' });
        expect(doc.getElementById('filter-q').value).toBe('範例');
        expect(decodedHash()).toBe('#/records?q=範例');
    });

    it('搜尋無結果：專屬空畫面，清除搜尋只清 q', async () => {
        stubApi(byFlag);
        await win.viewRecordsList(root(), { type: 'cupping', q: '<無此豆>', tier: 'recommend', sort: 'score-asc' });
        const empty = doc.querySelector('.empty-state');
        expect(empty.querySelector('.bi-search')).not.toBeNull();
        expect(empty.textContent).toContain('找不到含「<無此豆>」的記錄');
        expect(empty.textContent).toContain('換個關鍵字，或清除搜尋看看');

        doc.getElementById('records-clear-search').click();
        expect(doc.getElementById('filter-q').value).toBe('');
        expect(win.location.hash).toBe('#/records?type=cupping&tier=recommend&sort=score-asc');
        expect(doc.querySelector('.empty-state').textContent).toContain('找不到符合條件的記錄');
    });

    it('沒有搜尋字時沿用原本兩種空畫面', async () => {
        stubApi(() => []);
        await win.viewRecordsList(root(), { type: 'tasting' });
        expect(doc.querySelector('.empty-state').textContent).toContain('找不到符合條件的記錄');
        await win.viewRecordsList(root(), {});
        expect(doc.querySelector('.empty-state').textContent).toContain('還沒有記錄');
    });

    it('進階篩選「清除全部」清空搜尋字，保留排序 / 分組', async () => {
        if (!win.requestAnimationFrame) win.requestAnimationFrame = cb => setTimeout(cb, 0);
        stubApi(byFlag);
        await win.viewRecordsList(root(), { q: 'geisha', tier: 'common', sort: 'score-asc', group: 'shop' });
        doc.getElementById('filter-adv-btn').click();
        doc.getElementById('filter-clear-all').click();
        expect(doc.getElementById('filter-q').value).toBe('');
        expect(win.location.hash).toBe('#/records?sort=score-asc&group=shop');
    });
});
