// End-to-end 共用：#173 brief 定案的色盤（期望值直接照規格寫，不從 CSS 讀回來），
// 以及用 API 塞假資料的小工具。
export const PALETTE = {
    F: { bg: '#dcdcdf', fg: '#374151', tint: '#f0f0f2', ink: '#374151' },
    D: { bg: '#4a545d', fg: '#ffffff', tint: '#e2edf8', ink: '#4a545d' },
    C: { bg: '#286037', fg: '#ffffff', tint: '#d5f5da', ink: '#286037' },
    B: { bg: '#1f5781', fg: '#ffffff', tint: '#d0f0ff', ink: '#1f5781' },
    A: { bg: '#5a467d', fg: '#ffffff', tint: '#f0e4ff', ink: '#5a467d' },
    S: { bg: '#78431b', fg: '#ffffff', tint: '#ffe3cc', ink: '#78431b' },
    SS: { bg: '#823834', fg: '#ffffff', tint: '#ffdfda', ink: '#823834' },
};

export function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export const KEYS = ['aroma', 'flavor', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel', 'balance', 'cleanness'];

// 新制沖煮紀錄：8 項全 0，風味補到指定分數（80 + Σ）。
export async function createCupping(request, beanName, score) {
    const evaluations = Object.fromEntries(KEYS.map(k => [k, { score: 0, notes: '' }]));
    evaluations.flavor.score = score - 80;
    const res = await request.post('/api/records/cupping', {
        data: {
            bean_name: beanName,
            bean_type: 'single',
            coe_total: score,
            coe_tier_id: null,
            evaluations,
            observation: {},
            schema_version: 4,
        },
    });
    if (!res.ok()) throw new Error(`create cupping ${res.status()}: ${await res.text()}`);
    return (await res.json()).id;
}

export async function style(locator, prop) {
    return locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
}

export async function noHorizontalScroll(page) {
    return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
