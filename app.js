/* =============================================================================
   Coffee Review — single-page app
   Pages (hash routes):
     #/records             list (filter chips + cards)         [default]
     #/cupping/<id>        edit 杯測
     #/tasting/<id>        edit 品鑑
     #/new                 new record (defaults to cupping)
     #/new/cupping         new 杯測
     #/new/tasting         new 品鑑
     #/shops               shop list / management
     #/shops/<id>          shop detail + linked records
   ========================================================================== */

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_CONFIG = Object.assign({
    url: '',
    anonKey: '',
    schema: 'coffee',
    cuppingTable: 'cupping_records',
    tastingTable: 'tasting_records',
    shopsTable:   'shops',
}, (typeof window !== 'undefined' && window.SUPABASE_CONFIG) || {});

// ─── Tier definitions ────────────────────────────────────────────────────────
const totalScoreTiers = [
    { id: 'trash',      medal: '劣', label: '≤76',   min: 74, max: 76.5,
      badgeName: '瑕疵',   name: '風味平淡',
      description: '平淡無亮點，或帶明顯瑕疵',
      cssClass: 't-trash',      color: '#6c757d' },

    { id: 'commercial', medal: '凡', label: '77-79', min: 77, max: 79.5,
      badgeName: '普羅',   name: '商業風味',
      description: '普羅大眾的日常選擇，缺乏精品層次',
      cssClass: 't-commercial', color: '#6e5640' },

    { id: 'common',     medal: '銅', label: '80-82', min: 80, max: 82.5,
      badgeName: '銅牌',   name: '卓越銅獎',
      description: '合格的精品咖啡，適合日常品飲',
      cssClass: 't-common',     color: '#b86826' },

    { id: 'like',       medal: '銀', label: '83-85', min: 83, max: 85.5,
      badgeName: '銀牌',   name: '優秀銀獎',
      description: '平衡乾淨、值得反覆品飲的精品',
      cssClass: 't-like',       color: '#9e9e9e' },

    { id: 'recommend',  medal: '金', label: '86-88', min: 86, max: 88.5,
      badgeName: '金牌',   name: '傑出金獎',
      description: '風味飽滿、層次豐富的傑作',
      cssClass: 't-recommend',  color: '#d4a017' },

    { id: 'amazing',    medal: '鉑', label: '89-91', min: 89, max: 91.5,
      badgeName: '鉑金',   name: '大師鉑金',
      description: '結構完整、令人驚艷的大師之作',
      cssClass: 't-amazing',    color: '#6c83a3' },

    { id: 'godly',      medal: '神', label: '≥92',   min: 92, max: 96,
      badgeName: '典藏',   name: '稀世絕品',
      description: '可遇不可求的競標級稀世絕品',
      cssClass: 't-godly',      color: '#5a2ea0' },
];

function tierFromScore(score) {
    return totalScoreTiers.find(t => score >= t.min && score <= t.max)
        || totalScoreTiers[2];
}
function tierById(id) {
    return totalScoreTiers.find(t => t.id === id) || totalScoreTiers[2];
}
function scoresInTier(tier) {
    const list = [];
    for (let s = tier.min; s <= tier.max + 1e-9; s += 0.5) {
        list.push(Math.round(s * 10) / 10);
    }
    return list;
}

// ─── Evaluation field definitions ────────────────────────────────────────────
const mouthfeelOptions = {
    weight:  { label: '重量級別', options: ['輕盈如茶', '圓潤順口', '醇厚飽滿'] },
    texture: { label: '質地描述', options: ['絲滑感', '奶油感', '絨布感', '糖漿感', '多汁感', '清脆感', '乾澀感', '氣泡感', '顆粒感'] },
};
const aftertasteOptions = {
    length:  { label: '尾韻長度', options: ['短暫', '中等', '悠長', '綿延'] },
    quality: { label: '尾韻質地', options: ['乾淨', '粗糙 / 乾澀', '富有變化'] },
};
const referenceFields = [
    { key: 'flavor',     label: '風味 Flavor',      icon: 'bi-droplet-half',     hasFlavorWheel: true },
    { key: 'acidity',    label: '酸質 Acidity',     icon: 'bi-lightning-charge' },
    { key: 'sweetness',  label: '甜度 Sweetness',   icon: 'bi-heart' },
    { key: 'mouthfeel',  label: '口感 Mouthfeel',   icon: 'bi-circle-half',      custom: mouthfeelOptions },
    { key: 'aftertaste', label: '尾韻 Aftertaste',  icon: 'bi-soundwave',        custom: aftertasteOptions },
    { key: 'cleanness',  label: '乾淨度 Clean Cup', icon: 'bi-stars' },
    { key: 'balance',    label: '平衡 Balance',     icon: 'bi-arrow-left-right' },
    { key: 'overall',    label: '整體 Overall',     icon: 'bi-trophy' },
];
const observationFields = [
    { key: 'aroma', label: '香氣 Aroma', icon: 'bi-wind', hasFlavorWheel: true },
];

// ─── Flavor wheel data ───────────────────────────────────────────────────────
const flavors = [
    { id: 'floral', name: '花香類', color: '#d6336c',
      sub: ['茉莉', '玫瑰', '蘭花', '桂花', '紫羅蘭', '薰衣草'] },
    { id: 'fruit', name: '水果類', color: '#e8590c', sub: [
        { id: 'citrus',         name: '柑橘類',   color: '#f59f00', sub: ['檸檬', '橘子', '葡萄柚'] },
        { id: 'berry',          name: '莓果類',   color: '#c2255c', sub: ['草莓', '藍莓', '黑莓'] },
        { id: 'stone_fruit',    name: '核果類',   color: '#e8590c', sub: ['桃子', '杏桃', '櫻桃'] },
        { id: 'tropical_fruit', name: '熱帶水果', color: '#d9480f', sub: ['鳳梨', '芒果', '百香果'] },
    ]},
    { id: 'sugar', name: '糖香類', color: '#b06d2e',
      sub: ['蜂蜜', '焦糖', '黑糖', '楓糖', '太妃糖'] },
    { id: 'nutty_cocoa', name: '堅果/巧克力類', color: '#7a4f33', sub: [
        { id: 'nut',       name: '堅果類',   color: '#a67c52', sub: ['杏仁', '核桃', '榛果', '花生', '腰果'] },
        { id: 'chocolate', name: '巧克力類', color: '#5c3317', sub: ['牛奶巧克力', '黑巧克力', '可可粉'] },
    ]},
    { id: 'spice',  name: '香料類', color: '#c1530c', sub: ['肉桂', '丁香', '胡椒', '薑', '八角'] },
    { id: 'herbal', name: '草本類', color: '#2f9e44', sub: ['薄荷', '羅勒', '茶感', '青草', '香草'] },
    { id: 'roast',  name: '焙烤',   color: '#495057', sub: ['穀物味', '焦味', '菸草味'] },
    { id: 'other',  name: '其他',   color: '#868e96', sub: ['化合物', '霉味 / 土味', '紙味'] },
];

// ─── Tasting tag presets (chip choices) ──────────────────────────────────────
const tastingTagSections = [
    {
        key: 'atmosphere', label: '氛圍', icon: 'bi-music-note-beamed',
        options: ['安靜', '熱鬧', '明亮', '昏黃', '有音樂', '有閱讀區'],
    },
    {
        key: 'decor', label: '裝潢', icon: 'bi-easel',
        options: ['工業風', '日式', '文青', '桃花心木', '極簡', '復古'],
    },
    {
        key: 'service', label: '服務', icon: 'bi-person-check',
        options: ['親切', '專業', '全品項介紹', '沖煮解說', '沒交集', '不親切'],
    },
];

// ─── Lightweight in-memory state ─────────────────────────────────────────────
const state = {
    shops: [],          // [{id, name, location, intro, ...}]
    shopsLoaded: false, // true after first successful fetch — distinguishes "deleted" from "not loaded yet"
    listFilter: { type: 'all', shopId: '' },
    currentForm: null,  // { mode, recordId|null }
};

const coeState = { coeTotal: 82, selectedTierId: 'common' };
let supabaseClient = null;
const wheelState = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isCloudReady() {
    return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function showToast(msg, ms = 2000) {
    let el = document.getElementById('toastMsg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toastMsg';
        el.className = 'toast-msg';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
}

const NO_CLOUD_MSG = '尚未設定雲端。\n\n' +
    '本地開發：複製 config.example.js → config.js，填入 Supabase URL 與 publishable key。\n' +
    'GitHub Pages 部署：在 repo Settings → Secrets and variables → Actions 加入 ' +
    'SUPABASE_URL 與 SUPABASE_ANON_KEY，重新觸發部署。';

// ─── Supabase client + API layer ─────────────────────────────────────────────
async function ensureSupabase() {
    if (!isCloudReady()) return null;
    if (supabaseClient) return supabaseClient;
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabaseClient = mod.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        db: { schema: SUPABASE_CONFIG.schema || 'public' },
    });
    return supabaseClient;
}

const api = {
    async listShops() {
        const sb = await ensureSupabase();
        if (!sb) return [];
        const { data, error } = await sb.from(SUPABASE_CONFIG.shopsTable)
            .select('*').order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getShop(id) {
        const sb = await ensureSupabase();
        if (!sb) return null;
        // maybeSingle: missing row returns { data: null, error: null }
        // (vs .single(), which throws PGRST116 and prevents the not-found UI from rendering)
        const { data, error } = await sb.from(SUPABASE_CONFIG.shopsTable)
            .select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data;
    },

    async createShop(payload) {
        const sb = await ensureSupabase();
        if (!sb) throw new Error('cloud_not_ready');
        const { data, error } = await sb.from(SUPABASE_CONFIG.shopsTable)
            .insert(payload).select().single();
        if (error) throw error;
        return data;
    },

    async updateShop(id, payload) {
        const sb = await ensureSupabase();
        if (!sb) throw new Error('cloud_not_ready');
        const { data, error } = await sb.from(SUPABASE_CONFIG.shopsTable)
            .update(payload).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteShop(id) {
        const sb = await ensureSupabase();
        if (!sb) throw new Error('cloud_not_ready');
        const { error } = await sb.from(SUPABASE_CONFIG.shopsTable).delete().eq('id', id);
        if (error) throw error;
    },

    async listRecords({ type = 'all', shopId = '' } = {}) {
        const sb = await ensureSupabase();
        if (!sb) return [];
        const baseCols = 'id, shop_id, coe_total, coe_tier_id, created_at';
        const tasks = [];
        const unwrap = (r, _type) => {
            if (r.error) throw r.error;
            return (r.data || []).map(x => ({ ...x, _type }));
        };

        if (type === 'all' || type === 'cupping') {
            let q = sb.from(SUPABASE_CONFIG.cuppingTable)
                .select(`${baseCols}, bean_name, origin`);
            if (shopId) q = q.eq('shop_id', shopId);
            tasks.push(q.order('created_at', { ascending: false })
                .then(r => unwrap(r, 'cupping')));
        }
        if (type === 'all' || type === 'tasting') {
            let q = sb.from(SUPABASE_CONFIG.tastingTable)
                .select(`${baseCols}, visit_date, item_ordered, bean_name`);
            if (shopId) q = q.eq('shop_id', shopId);
            tasks.push(q.order('created_at', { ascending: false })
                .then(r => unwrap(r, 'tasting')));
        }
        const results = await Promise.all(tasks);
        const merged = [].concat(...results);
        merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        return merged;
    },

    async getRecord(type, id) {
        const sb = await ensureSupabase();
        if (!sb) return null;
        const table = type === 'tasting' ? SUPABASE_CONFIG.tastingTable : SUPABASE_CONFIG.cuppingTable;
        const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data;
    },

    async createRecord(type, payload) {
        const sb = await ensureSupabase();
        if (!sb) throw new Error('cloud_not_ready');
        const table = type === 'tasting' ? SUPABASE_CONFIG.tastingTable : SUPABASE_CONFIG.cuppingTable;
        const { data, error } = await sb.from(table).insert(payload).select().single();
        if (error) throw error;
        return data;
    },

    async updateRecord(type, id, payload) {
        const sb = await ensureSupabase();
        if (!sb) throw new Error('cloud_not_ready');
        const table = type === 'tasting' ? SUPABASE_CONFIG.tastingTable : SUPABASE_CONFIG.cuppingTable;
        const { data, error } = await sb.from(table).update(payload).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteRecord(type, id) {
        const sb = await ensureSupabase();
        if (!sb) throw new Error('cloud_not_ready');
        const table = type === 'tasting' ? SUPABASE_CONFIG.tastingTable : SUPABASE_CONFIG.cuppingTable;
        const { error } = await sb.from(table).delete().eq('id', id);
        if (error) throw error;
    },
};

async function refreshShopsCache() {
    if (!isCloudReady()) return;
    try {
        state.shops = await api.listShops();
        state.shopsLoaded = true;
    } catch (e) {
        console.warn('refreshShopsCache failed:', e);
    }
}

function shopName(id) {
    if (!id) return '';
    const shop = state.shops.find(s => s.id === id);
    if (shop) return shop.name;
    // Don't claim a shop is deleted until we've successfully loaded the
    // shops list at least once — otherwise a transient fetch failure
    // would mislabel every record.
    return state.shopsLoaded ? '(已刪除店家)' : '';
}

// ─── Router ──────────────────────────────────────────────────────────────────
function parseHash() {
    const raw = (location.hash || '#/records').replace(/^#\/?/, '');
    const [pathPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    return { parts, raw };
}

function navigate(path) {
    if (location.hash === `#${path}`) {
        renderRoute();
    } else {
        location.hash = path;
    }
}

async function renderRoute() {
    const { parts } = parseHash();
    const root = document.getElementById('app');

    // Cleanup transient form state when leaving a form route
    state.currentForm = null;
    wheelState.clear();

    if (parts.length === 0 || parts[0] === 'records') {
        await viewRecordsList(root);
    } else if (parts[0] === 'new') {
        const mode = parts[1] === 'tasting' ? 'tasting' : 'cupping';
        await viewForm(root, { mode, recordId: null });
    } else if (parts[0] === 'cupping' && parts[1]) {
        await viewForm(root, { mode: 'cupping', recordId: parts[1] });
    } else if (parts[0] === 'tasting' && parts[1]) {
        await viewForm(root, { mode: 'tasting', recordId: parts[1] });
    } else if (parts[0] === 'shops' && !parts[1]) {
        await viewShopsList(root);
    } else if (parts[0] === 'shops' && parts[1]) {
        await viewShopDetail(root, parts[1]);
    } else {
        viewNotFound(root);
    }

    updateTabbarActive();
}

function updateTabbarActive() {
    const { parts } = parseHash();
    const first = parts[0] || 'records';
    let activeRoute = '/records';
    if (first === 'new') activeRoute = '/new';
    else if (first === 'shops') activeRoute = '/shops';
    document.querySelectorAll('.tabbar-btn').forEach(a => {
        a.classList.toggle('active', a.dataset.route === activeRoute);
    });
}

function viewNotFound(root) {
    root.innerHTML = `
        <div class="card"><div class="card-body">
            <h3 class="card-title"><i class="bi bi-question-circle"></i>找不到頁面</h3>
            <p class="text-muted">這個網址沒有對應的頁面。</p>
            <a class="btn btn-primary" href="#/records">回到記錄列表</a>
        </div></div>`;
}

// ─── View: records list ─────────────────────────────────────────────────────
async function viewRecordsList(root) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }

    root.innerHTML = `
        <div class="filter-bar">
            <div class="filter-chip-row" role="group" aria-label="記錄類型">
                <button type="button" class="filter-chip" data-filter-type="all">全部</button>
                <button type="button" class="filter-chip" data-filter-type="cupping">杯測</button>
                <button type="button" class="filter-chip" data-filter-type="tasting">品鑑</button>
            </div>
            <div class="filter-shop-wrap">
                <select class="form-select form-select-sm" id="filter-shop">
                    <option value="">全部店家</option>
                </select>
            </div>
        </div>
        <div id="records-list" class="records-list"></div>`;

    await refreshShopsCache();

    // Populate shop filter
    const shopSel = document.getElementById('filter-shop');
    state.shops.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        shopSel.appendChild(opt);
    });
    shopSel.value = state.listFilter.shopId || '';

    // Wire chips
    document.querySelectorAll('.filter-chip').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.filterType === state.listFilter.type);
        btn.addEventListener('click', () => {
            state.listFilter.type = btn.dataset.filterType;
            document.querySelectorAll('.filter-chip').forEach(b =>
                b.classList.toggle('selected', b === btn));
            loadAndRenderCards();
        });
    });

    shopSel.addEventListener('change', () => {
        state.listFilter.shopId = shopSel.value;
        loadAndRenderCards();
    });

    await loadAndRenderCards();
}

async function loadAndRenderCards() {
    const container = document.getElementById('records-list');
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>';
    try {
        const rows = await api.listRecords(state.listFilter);
        if (rows.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>還沒有記錄</p>
                <a class="btn btn-primary btn-sm" href="#/new">新增第一筆</a>
            </div>`;
            return;
        }
        container.innerHTML = rows.map(renderRecordCard).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="empty-state error">
            <i class="bi bi-exclamation-triangle"></i>讀取失敗：${escapeHtml(e.message || String(e))}
        </div>`;
    }
}

function deriveTitle(r) {
    if (r._type === 'cupping') {
        return r.bean_name || r.origin || '(未命名杯測)';
    }
    return r.item_ordered || r.bean_name || '(未指定品項)';
}

function renderRecordCard(r) {
    const type = r._type;
    const tier = r.coe_tier_id ? tierById(r.coe_tier_id) : null;
    const score = typeof r.coe_total === 'number' ? r.coe_total.toFixed(1) : '—';
    const shop = shopName(r.shop_id);
    const date = type === 'tasting' && r.visit_date ? fmtDate(r.visit_date) : fmtDate(r.created_at);
    const title = deriveTitle(r);
    return `
        <a class="record-card" href="#/${type}/${r.id}">
            <div class="record-card-medal ${tier ? tier.cssClass : ''}">
                <span class="record-card-medal-text">${tier ? tier.medal : '?'}</span>
                <span class="record-card-medal-score">${score}</span>
            </div>
            <div class="record-card-body">
                <div class="record-card-top">
                    <span class="record-card-type-badge type-${type}">${type === 'tasting' ? '品鑑' : '杯測'}</span>
                    <span class="record-card-title">${escapeHtml(title)}</span>
                </div>
                <div class="record-card-meta">
                    ${shop ? `<span><i class="bi bi-shop"></i>${escapeHtml(shop)}</span>` : ''}
                    ${date ? `<span><i class="bi bi-calendar3"></i>${escapeHtml(date)}</span>` : ''}
                </div>
            </div>
            <i class="bi bi-chevron-right record-card-chevron"></i>
        </a>`;
}

function renderCloudWarning() {
    return `<div class="card"><div class="card-body">
        <h3 class="card-title"><i class="bi bi-cloud-slash"></i>尚未設定雲端</h3>
        <p class="text-muted">本應用透過 Supabase 雲端儲存記錄。</p>
        <pre class="cloud-warning-msg">${escapeHtml(NO_CLOUD_MSG)}</pre>
    </div></div>`;
}

// ─── View: record form (杯測 / 品鑑) ─────────────────────────────────────────
async function viewForm(root, { mode, recordId }) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }

    // Mount the template
    const tpl = document.getElementById('tpl-form');
    root.innerHTML = '';
    root.appendChild(tpl.content.cloneNode(true));

    state.currentForm = { mode, recordId };

    setFormMode(mode);
    initCoeWidget();
    initEvaluationAccordion();
    initTagSections();
    bindFormHandlers();

    await refreshShopsCache();
    populateShopSelect(document.getElementById('f-shop'), mode === 'tasting');

    if (recordId) {
        document.getElementById('f-save-label').textContent = '儲存變更';
        document.getElementById('f-delete').hidden = false;
        await loadRecordIntoForm(mode, recordId);
    } else {
        document.getElementById('f-save-label').textContent = '儲存';
        document.getElementById('f-delete').hidden = true;
    }
}

function setFormMode(mode) {
    document.querySelectorAll('.form-mode-tab').forEach(btn => {
        const active = btn.dataset.formMode === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-mode-only]').forEach(el => {
        el.style.display = el.dataset.modeOnly === mode ? '' : 'none';
    });
    document.querySelectorAll('[data-mode-text]').forEach(el => {
        el.style.display = el.dataset.modeText === mode ? '' : 'none';
    });
    const shopSel = document.getElementById('f-shop');
    if (shopSel) shopSel.required = mode === 'tasting';
    applyBeanTypeVisibility(mode);
}

function getBeanType(mode) {
    const row = document.querySelector(`.bean-type-chip-row[data-bean-type-group="${mode}"]`);
    return row?.querySelector('.bean-type-chip.selected')?.dataset.beanType || '';
}

function setBeanType(mode, value) {
    const row = document.querySelector(`.bean-type-chip-row[data-bean-type-group="${mode}"]`);
    if (!row) return;
    row.querySelectorAll('.bean-type-chip').forEach(chip => {
        const selected = chip.dataset.beanType === value;
        chip.classList.toggle('selected', selected);
        chip.setAttribute('aria-pressed', String(selected));
    });
    applyBeanTypeVisibility(mode);
}

function applyBeanTypeVisibility(mode) {
    const beanType = getBeanType(mode);
    document.querySelectorAll('[data-bean-type-only]').forEach(el => {
        const [scope, type] = el.dataset.beanTypeOnly.split(':');
        if (scope !== mode) return; // visibility for the other mode is governed by data-mode-only
        el.style.display = beanType === type ? '' : 'none';
    });
}

function populateShopSelect(sel, required) {
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '';

    if (!required) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— 不指定 —';
        sel.appendChild(opt);
    } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— 請選擇 —';
        opt.disabled = true;
        sel.appendChild(opt);
    }

    state.shops.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name + (s.location ? ` · ${s.location}` : '');
        sel.appendChild(opt);
    });

    if (currentVal && state.shops.some(s => s.id === currentVal)) {
        sel.value = currentVal;
    }
}

// ─── CoE widget ──────────────────────────────────────────────────────────────
function initCoeWidget() {
    coeState.coeTotal = 82;
    coeState.selectedTierId = 'common';
    renderTierMedals();
    renderScoreChips(tierById('common'));
    refreshTotalDisplay();
}

function renderTierMedals() {
    const row = document.getElementById('medalRow');
    if (!row) return;
    row.innerHTML = '';
    totalScoreTiers.forEach(t => {
        const selected = (t.id === coeState.selectedTierId);
        const cell = document.createElement('div');
        cell.className = 'medal-cell' + (selected ? ' selected' : '');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tier-medal ${t.cssClass}` + (selected ? ' selected' : '');
        btn.dataset.tierId = t.id;
        btn.setAttribute('aria-pressed', selected);
        btn.setAttribute('aria-label', `${t.name} ${t.label}`);
        btn.innerHTML = `<span class="medal-text">${t.medal}</span>`;
        btn.addEventListener('click', () => selectTier(t.id));

        const lbl = document.createElement('span');
        lbl.className = 'medal-range-label';
        lbl.textContent = t.label;

        cell.appendChild(btn);
        cell.appendChild(lbl);
        row.appendChild(cell);
    });
}

function renderScoreChips(tier) {
    const row = document.getElementById('scoreChipRow');
    if (!row) return;
    row.innerHTML = '';
    row.style.setProperty('--tier-color', tier.color);
    scoresInTier(tier).forEach(s => {
        const chip = document.createElement('button');
        chip.type = 'button';
        const sel = Math.abs(s - coeState.coeTotal) < 1e-6;
        chip.className = 'score-chip' + (sel ? ' selected' : '');
        chip.dataset.score = s;
        chip.setAttribute('aria-pressed', sel);
        chip.textContent = Number.isInteger(s) ? `${s}` : s.toFixed(1);
        chip.addEventListener('click', () => selectScore(s));
        row.appendChild(chip);
    });
}

function selectTier(tierId, opts = {}) {
    const tier = tierById(tierId);
    coeState.selectedTierId = tierId;
    if (!(coeState.coeTotal >= tier.min && coeState.coeTotal <= tier.max)) {
        coeState.coeTotal = opts.scoreOverride != null ? opts.scoreOverride : tier.min;
    }
    renderTierMedals();
    renderScoreChips(tier);
    refreshTotalDisplay();
}

function selectScore(score) {
    coeState.coeTotal = score;
    renderScoreChips(tierById(coeState.selectedTierId));
    refreshTotalDisplay();
}

function refreshTotalDisplay() {
    const display = document.getElementById('coeTotalDisplay');
    if (!display) return;
    const tier = tierById(coeState.selectedTierId);
    display.textContent = coeState.coeTotal.toFixed(1);
    const badge = document.getElementById('coeTotalTierBadge');
    badge.textContent = `[ ${tier.badgeName} ]`;
    badge.style.color = tier.color;
    document.getElementById('coeTotalDesc').textContent = tier.description;
}

// ─── Evaluation accordion ────────────────────────────────────────────────────
function notesSlotHtml(textareaId, { rows = 2 } = {}) {
    const bodyId = `${textareaId}_body`;
    return `<div class="notes-slot" data-notes-slot="${textareaId}">
        <button type="button" class="notes-toggle" data-notes-target="${textareaId}"
                aria-controls="${bodyId}" aria-expanded="false">
            <i class="bi bi-plus-circle"></i> 加上備註
        </button>
        <div id="${bodyId}" class="notes-body" hidden>
            <label class="form-label" for="${textareaId}">備註:</label>
            <textarea id="${textareaId}" class="form-control" rows="${rows}"></textarea>
        </div>
    </div>`;
}

function expandNotesSlot(textareaId, { focus = true } = {}) {
    const slot = document.querySelector(`[data-notes-slot="${textareaId}"]`);
    if (!slot || slot.classList.contains('is-open')) return;
    slot.classList.add('is-open');
    slot.querySelector('.notes-toggle')?.setAttribute('aria-expanded', 'true');
    const body = slot.querySelector('.notes-body');
    if (body) body.hidden = false;
    if (focus) slot.querySelector('textarea')?.focus();
}

function wrapAccordionItem(key, label, icon, body) {
    const iconHtml = icon
        ? `<span class="eval-icon"><i class="bi ${icon}"></i></span>` : '';
    return `<div class="accordion-item">
        <h2 class="accordion-header" id="heading_${key}">
            <button class="accordion-button collapsed" type="button"
                    data-bs-toggle="collapse" data-bs-target="#collapse_${key}"
                    aria-expanded="false" aria-controls="collapse_${key}">
                ${iconHtml}<span class="eval-label">${label}</span>
                <span id="${key}_summary" class="eval-summary"></span>
            </button>
        </h2>
        <div id="collapse_${key}" class="accordion-collapse collapse"
             aria-labelledby="heading_${key}">
            <div class="accordion-body">${body}</div>
        </div>
    </div>`;
}

function generateReferenceItem(field) {
    const key = field.key;
    let body = `
        <div class="mb-3">
            <div class="ref-slider-group">
                <input type="range" class="form-range" id="${key}_score"
                       min="4" max="8" step="0.5" value="5" data-ref-score="${key}">
                <span class="ref-slider-value" id="${key}_score_value">5.0</span>
            </div>
            <div class="small-hint">參考分 4-8（預設 5），不影響上方 CoE 總分。</div>
        </div>`;

    if (field.custom) {
        const opts = field.custom;
        const pk = Object.keys(opts)[0], sk = Object.keys(opts)[1];
        const primary = opts[pk], secondary = opts[sk];

        body += `<h6 class="mb-2 text-secondary small">${primary.label}</h6>`;
        primary.options.forEach((opt, i) => {
            const optId = `${key}_${pk}_${i}`;
            body += `<div class="form-check form-check-inline">
                <input class="form-check-input" type="radio"
                       name="${key}_${pk}" id="${optId}" value="${opt}" data-ref-key="${key}">
                <label class="form-check-label" for="${optId}">${opt}</label>
            </div>`;
        });
        body += `<h6 class="mt-2 mb-2 text-secondary small">${secondary.label}</h6>`;
        secondary.options.forEach((opt, i) => {
            const optId = `${key}_${sk}_${i}`;
            body += `<div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox"
                       name="${key}_${sk}" id="${optId}" value="${opt}" data-ref-key="${key}">
                <label class="form-check-label" for="${optId}">${opt}</label>
            </div>`;
        });
    }

    if (field.hasFlavorWheel) {
        body += `<label class="form-label mt-3">風味（點選後展開細項）:</label>
            <div id="${key}_flavorList" class="flavor-wheel"></div>`;
    }

    body += `<div class="mt-3">${notesSlotHtml(`${key}_notes`)}</div>`;
    return wrapAccordionItem(key, field.label, field.icon, body);
}

function generateObservationItem(field) {
    const key = field.key;
    let body = `
        <div class="small-hint mb-2">香氣為觀察項，不計分。</div>
        <label class="form-label">乾香:</label>
        <textarea id="${key}_dryAroma" class="form-control mb-2" rows="2"></textarea>
        <label class="form-label">濕香:</label>
        <textarea id="${key}_wetAroma" class="form-control mb-2" rows="2"></textarea>`;
    if (field.hasFlavorWheel) {
        body += `<label class="form-label mt-2">風味（點選後展開細項）:</label>
            <div id="${key}_flavorList" class="flavor-wheel"></div>`;
    }
    body += `<div class="mt-3">${notesSlotHtml(`${key}_notes`)}</div>`;
    return wrapAccordionItem(key, field.label, field.icon, body);
}

function initEvaluationAccordion() {
    const accordion = document.getElementById('evaluationAccordion');
    if (!accordion) return;
    accordion.innerHTML = [
        ...observationFields.map(generateObservationItem),
        ...referenceFields.map(generateReferenceItem),
    ].join('');

    observationFields.forEach(f => {
        if (f.hasFlavorWheel) {
            renderFlavorWheel(`${f.key}_flavorList`, () => updateObservationSummary(f.key));
        }
    });
    referenceFields.forEach(f => {
        if (f.hasFlavorWheel) {
            renderFlavorWheel(`${f.key}_flavorList`, () => updateRefSummary(f.key));
        }
        setReferenceScore(f.key, 5);
    });

    accordion.addEventListener('input', e => {
        const key = e.target.dataset.refScore;
        if (key) onRefScoreInput(key);
    });
    accordion.addEventListener('change', e => {
        const key = e.target.dataset.refKey;
        if (key) updateRefSummary(key);
    });
}

function onRefScoreInput(key) {
    const slider = document.getElementById(`${key}_score`);
    const valueEl = document.getElementById(`${key}_score_value`);
    const v = parseFloat(slider.value);
    valueEl.textContent = v.toFixed(1);
    const pct = ((v - 4) / 4) * 100;
    slider.style.setProperty('--slider-fill', `${pct}%`);
    updateRefSummary(key);
}

function setReferenceScore(key, value) {
    const slider = document.getElementById(`${key}_score`);
    if (!slider) return;
    slider.value = value;
    onRefScoreInput(key);
}

function getReferenceScore(key) {
    const slider = document.getElementById(`${key}_score`);
    return slider ? parseFloat(slider.value) : 5;
}

function updateRefSummary(key) {
    const summaryEl = document.getElementById(`${key}_summary`);
    if (!summaryEl) return;
    const field = referenceFields.find(f => f.key === key);
    if (!field) return;

    const score = getReferenceScore(key);
    const parts = [`${score.toFixed(1)} / 8`];

    if (field.custom) {
        const opts = field.custom;
        const pk = Object.keys(opts)[0], sk = Object.keys(opts)[1];
        const pv = document.querySelector(`input[name="${key}_${pk}"]:checked`)?.value || '';
        const sv = Array.from(document.querySelectorAll(`input[name="${key}_${sk}"]:checked`)).map(cb => cb.value);
        const summary = [pv, ...sv].filter(Boolean).join(', ');
        if (summary) parts.push(summary);
    }
    if (field.hasFlavorWheel) {
        const selected = getSelectedFlavorNames(`${key}_flavorList`);
        if (selected.length > 0) {
            const preview = selected.slice(0, 2).join(', ') + (selected.length > 2 ? `…(+${selected.length - 2})` : '');
            parts.push(preview);
        }
    }
    summaryEl.textContent = parts.join(' | ');
}

function updateObservationSummary(key) {
    const summaryEl = document.getElementById(`${key}_summary`);
    if (!summaryEl) return;
    const selected = getSelectedFlavorNames(`${key}_flavorList`);
    summaryEl.textContent = selected.length === 0
        ? ''
        : selected.slice(0, 3).join(', ') + (selected.length > 3 ? `…(+${selected.length - 3})` : '');
}

function getSelectedFlavorNames(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} .flavor-tag.selected`))
        .map(t => t.dataset.flavorName || t.innerText);
}
function getSelectedFlavorIds(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} .flavor-tag.selected`))
        .map(t => t.dataset.flavorId);
}

// ─── Flavor wheel ───────────────────────────────────────────────────────────
function renderFlavorWheel(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!wheelState.has(containerId)) {
        wheelState.set(containerId, {
            selected: new Set(),
            expandedL1: new Set(),
            expandedL2: new Set(),
            callback: onChange,
        });
    } else {
        wheelState.get(containerId).callback = onChange;
    }
    drawFlavorWheel(containerId);
}

function drawFlavorWheel(containerId) {
    const container = document.getElementById(containerId);
    const ws = wheelState.get(containerId);
    if (!container || !ws) return;
    container.innerHTML = '';

    const l1Row = document.createElement('div');
    l1Row.className = 'flavor-row flavor-row-l1';
    flavors.forEach(l1 => {
        const l1Id = `${containerId}__l1-${l1.id}`;
        const tag = makeTag({
            text: l1.name, id: l1Id, color: l1.color,
            selected: ws.selected.has(l1Id),
            onClick: () => toggleFlavor(containerId, { level: 1, l1: l1.id, color: l1.color }),
        });
        tag.dataset.flavorName = l1.name;
        l1Row.appendChild(tag);
    });
    container.appendChild(l1Row);

    flavors.forEach(l1 => {
        const l1Id = `${containerId}__l1-${l1.id}`;
        const isL1Active = ws.expandedL1.has(l1.id) || hasSelectedDescendant(containerId, l1);
        if (!isL1Active || !l1.sub || l1.sub.length === 0) return;

        const l2Row = document.createElement('div');
        l2Row.className = 'flavor-row flavor-row-l2';

        l1.sub.forEach(l2 => {
            if (typeof l2 === 'string') {
                const l2Id = `${l1Id}__l2-${l2.replace(/[/\s]/g, '')}`;
                const tag = makeTag({
                    text: l2, id: l2Id, color: l1.color,
                    selected: ws.selected.has(l2Id),
                    onClick: () => toggleFlavor(containerId,
                        { level: 2, l1: l1.id, l2: l2, color: l1.color, leaf: true, id: l2Id }),
                });
                tag.dataset.flavorName = l2;
                l2Row.appendChild(tag);
            } else {
                const l2Id = `${l1Id}__l2-${l2.id}`;
                const l2Color = l2.color || l1.color;
                const tag = makeTag({
                    text: l2.name, id: l2Id, color: l2Color,
                    selected: ws.selected.has(l2Id),
                    onClick: () => toggleFlavor(containerId,
                        { level: 2, l1: l1.id, l2: l2.id, color: l2Color }),
                });
                tag.dataset.flavorName = l2.name;
                l2Row.appendChild(tag);
            }
        });
        container.appendChild(l2Row);

        l1.sub.forEach(l2 => {
            if (typeof l2 === 'string' || !l2.sub) return;
            const l2KeyForExpand = `${l1.id}::${l2.id}`;
            const isL2Active = ws.expandedL2.has(l2KeyForExpand) || hasSelectedDescendantL2(containerId, l1, l2);
            if (!isL2Active) return;

            const l2Id = `${l1Id}__l2-${l2.id}`;
            const l3Row = document.createElement('div');
            l3Row.className = 'flavor-row flavor-row-l3';

            l2.sub.forEach(l3 => {
                const l3Id = `${l2Id}__l3-${l3.replace(/[/\s]/g, '')}`;
                const tag = makeTag({
                    text: l3, id: l3Id, color: l2.color || l1.color,
                    selected: ws.selected.has(l3Id),
                    onClick: () => toggleFlavor(containerId,
                        { level: 3, l1: l1.id, l2: l2.id, l3: l3, color: l2.color || l1.color, id: l3Id }),
                });
                tag.dataset.flavorName = l3;
                l3Row.appendChild(tag);
            });
            container.appendChild(l3Row);
        });
    });
}

function makeTag({ text, id, color, selected, onClick }) {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'flavor-tag' + (selected ? ' selected' : '');
    tag.dataset.flavorId = id;
    tag.style.setProperty('--ft-color', color);
    tag.setAttribute('aria-pressed', selected ? 'true' : 'false');
    tag.innerText = text;
    tag.addEventListener('click', onClick);
    return tag;
}

function toggleFlavor(containerId, ev) {
    const ws = wheelState.get(containerId);
    if (!ws) return;

    if (ev.level === 1) {
        const l1Id = `${containerId}__l1-${ev.l1}`;
        if (ws.selected.has(l1Id)) {
            ws.selected.delete(l1Id);
            ws.expandedL1.delete(ev.l1);
            removeDescendantSelections(ws, containerId, ev.l1);
        } else {
            ws.selected.add(l1Id);
            ws.expandedL1.add(ev.l1);
        }
    } else if (ev.level === 2) {
        const l2Id = ev.id || `${containerId}__l1-${ev.l1}__l2-${ev.l2}`;
        if (ws.selected.has(l2Id)) {
            ws.selected.delete(l2Id);
            if (!ev.leaf) {
                ws.expandedL2.delete(`${ev.l1}::${ev.l2}`);
                removeDescendantSelectionsL2(ws, containerId, ev.l1, ev.l2);
            }
        } else {
            ws.selected.add(l2Id);
            if (!ev.leaf) ws.expandedL2.add(`${ev.l1}::${ev.l2}`);
            ws.selected.add(`${containerId}__l1-${ev.l1}`);
            ws.expandedL1.add(ev.l1);
        }
    } else if (ev.level === 3) {
        const l3Id = ev.id;
        if (ws.selected.has(l3Id)) {
            ws.selected.delete(l3Id);
        } else {
            ws.selected.add(l3Id);
            const l2Id = `${containerId}__l1-${ev.l1}__l2-${ev.l2}`;
            const l1Id = `${containerId}__l1-${ev.l1}`;
            ws.selected.add(l2Id);
            ws.selected.add(l1Id);
            ws.expandedL1.add(ev.l1);
            ws.expandedL2.add(`${ev.l1}::${ev.l2}`);
        }
    }

    drawFlavorWheel(containerId);
    if (ws.callback) ws.callback();
}

function hasSelectedDescendant(containerId, l1) {
    const ws = wheelState.get(containerId);
    if (!ws) return false;
    const prefix = `${containerId}__l1-${l1.id}__`;
    for (const id of ws.selected) if (id.startsWith(prefix)) return true;
    return false;
}

function hasSelectedDescendantL2(containerId, l1, l2) {
    const ws = wheelState.get(containerId);
    if (!ws) return false;
    const prefix = `${containerId}__l1-${l1.id}__l2-${l2.id}__`;
    for (const id of ws.selected) if (id.startsWith(prefix)) return true;
    return false;
}

function removeDescendantSelections(ws, containerId, l1Slug) {
    const prefix = `${containerId}__l1-${l1Slug}__`;
    for (const id of [...ws.selected]) if (id.startsWith(prefix)) ws.selected.delete(id);
    for (const k of [...ws.expandedL2]) if (k.startsWith(`${l1Slug}::`)) ws.expandedL2.delete(k);
}

function removeDescendantSelectionsL2(ws, containerId, l1Slug, l2Slug) {
    const prefix = `${containerId}__l1-${l1Slug}__l2-${l2Slug}__`;
    for (const id of [...ws.selected]) if (id.startsWith(prefix)) ws.selected.delete(id);
}

function applyFlavorSelections(containerId, ids) {
    const ws = wheelState.get(containerId);
    if (!ws) return;
    ws.selected = new Set(ids || []);
    ws.expandedL1 = new Set();
    ws.expandedL2 = new Set();
    for (const id of ws.selected) {
        const rest = id.slice(containerId.length);
        const l1Start = rest.indexOf('__l1-');
        if (l1Start < 0) continue;
        const afterL1 = rest.slice(l1Start + '__l1-'.length);
        const l2Start = afterL1.indexOf('__l2-');
        const l1Slug = l2Start < 0 ? afterL1 : afterL1.slice(0, l2Start);
        ws.expandedL1.add(l1Slug);
        if (l2Start >= 0) {
            const afterL2 = afterL1.slice(l2Start + '__l2-'.length);
            const l3Start = afterL2.indexOf('__l3-');
            const l2Slug = l3Start < 0 ? afterL2 : afterL2.slice(0, l3Start);
            ws.expandedL2.add(`${l1Slug}::${l2Slug}`);
        }
    }
    drawFlavorWheel(containerId);
}

// ─── Tag chip sections (氛圍/裝潢/服務) ─────────────────────────────────────
function initTagSections() {
    const root = document.getElementById('tagSections');
    if (!root) return;
    root.innerHTML = tastingTagSections.map(sec => `
        <div class="tag-section" data-tag-section="${sec.key}">
            <div class="tag-section-title">
                <i class="bi ${sec.icon}"></i>
                <span>${sec.label}</span>
            </div>
            <div class="tag-chip-row" data-tag-chips="${sec.key}">
                ${sec.options.map(opt =>
                    `<button type="button" class="tag-chip" data-value="${escapeHtml(opt)}">
                        ${escapeHtml(opt)}
                    </button>`).join('')}
            </div>
            <div class="mt-2">${notesSlotHtml(`f-tag-${sec.key}-notes`)}</div>
        </div>
    `).join('');

    root.addEventListener('click', e => {
        const chip = e.target.closest('.tag-chip');
        if (!chip) return;
        chip.classList.toggle('selected');
    });
}

function getTagValues(sectionKey) {
    return Array.from(document.querySelectorAll(
        `[data-tag-chips="${sectionKey}"] .tag-chip.selected`
    )).map(c => c.dataset.value);
}

function setTagValues(sectionKey, values) {
    const set = new Set(values || []);
    document.querySelectorAll(`[data-tag-chips="${sectionKey}"] .tag-chip`).forEach(c => {
        c.classList.toggle('selected', set.has(c.dataset.value));
    });
    // For custom values not in preset list, append additional chips
    (values || []).forEach(v => {
        if (!tastingTagSections.find(s => s.key === sectionKey)?.options.includes(v)) {
            const row = document.querySelector(`[data-tag-chips="${sectionKey}"]`);
            if (!row || row.querySelector(`.tag-chip[data-value="${CSS.escape(v)}"]`)) return;
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-chip selected';
            chip.dataset.value = v;
            chip.textContent = v;
            row.appendChild(chip);
        }
    });
}

// ─── Form event wiring + data flow ──────────────────────────────────────────
function bindFormHandlers() {
    const form = document.querySelector('.record-form');

    document.querySelectorAll('.form-mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.formMode;
            if (!state.currentForm || state.currentForm.recordId) return; // can't change mode on existing record
            state.currentForm.mode = mode;
            setFormMode(mode);
            populateShopSelect(document.getElementById('f-shop'), mode === 'tasting');
        });
    });

    document.querySelectorAll('.bean-type-chip-row').forEach(row => {
        const groupMode = row.dataset.beanTypeGroup;
        row.querySelectorAll('.bean-type-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                setBeanType(groupMode, chip.dataset.beanType);
            });
        });
    });

    // Scope notes-toggle delegation to the form so the listener is GC'd
    // when the form is replaced on navigation.
    form.addEventListener('click', e => {
        const toggle = e.target.closest('.notes-toggle');
        if (toggle) expandNotesSlot(toggle.dataset.notesTarget);
    });

    document.getElementById('f-shop-new').addEventListener('click', () => openShopModal());

    form.addEventListener('submit', e => {
        e.preventDefault();
        submitForm();
    });

    document.getElementById('f-delete').addEventListener('click', () => deleteCurrentRecord());
}

function buildEvaluationPayload() {
    const payload = {
        coe_total: coeState.coeTotal,
        coe_tier_id: coeState.selectedTierId,
        evaluations: {},
        observation: {},
    };
    referenceFields.forEach(f => {
        const entry = {
            score: getReferenceScore(f.key),
            notes: document.getElementById(`${f.key}_notes`)?.value || '',
        };
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            entry[pk] = document.querySelector(`input[name="${f.key}_${pk}"]:checked`)?.value || '';
            entry[sk] = Array.from(document.querySelectorAll(`input[name="${f.key}_${sk}"]:checked`)).map(cb => cb.value);
        }
        if (f.hasFlavorWheel) entry.flavors = getSelectedFlavorIds(`${f.key}_flavorList`);
        payload.evaluations[f.key] = entry;
    });
    observationFields.forEach(f => {
        const entry = { notes: document.getElementById(`${f.key}_notes`)?.value || '' };
        if (f.key === 'aroma') {
            entry.dryAroma = document.getElementById(`${f.key}_dryAroma`)?.value || '';
            entry.wetAroma = document.getElementById(`${f.key}_wetAroma`)?.value || '';
        }
        if (f.hasFlavorWheel) entry.flavors = getSelectedFlavorIds(`${f.key}_flavorList`);
        payload.observation[f.key] = entry;
    });
    return payload;
}

function buildFormPayload(mode) {
    const shopId = document.getElementById('f-shop').value || null;
    const defects = document.getElementById('f-defects').value;
    const notes = document.getElementById('f-notes').value;

    const ev = buildEvaluationPayload();

    if (mode === 'cupping') {
        const beanName = document.getElementById('f-cupping-bean').value.trim() || null;
        const beanType = getBeanType('cupping');
        const isBlend = beanType === 'blend';
        return {
            shop_id: shopId,
            bean_name: beanName,
            bean_type: beanType || null,
            // Clear origin/process when blend; clear blend_composition when single.
            origin: isBlend ? null : (document.getElementById('f-origin').value || null),
            process: isBlend ? null : (document.getElementById('f-process').value || null),
            blend_composition: isBlend
                ? (document.getElementById('f-blend_composition').value.trim() || null)
                : null,
            roast: document.getElementById('f-roast').value || null,
            grind: document.getElementById('f-grind').value || null,
            water_temp: document.getElementById('f-water_temp').value || null,
            ratio: document.getElementById('f-ratio').value || null,
            method: document.getElementById('f-method').value || null,
            extraction_time: document.getElementById('f-extraction_time').value || null,
            defects: defects || null,
            notes: notes || null,
            schema_version: 2,
            ...ev,
        };
    }

    // tasting
    const priceRaw = document.getElementById('f-price').value;
    const dateRaw = document.getElementById('f-visit_date').value;
    return {
        shop_id: shopId,
        visit_date: dateRaw || null,
        price: priceRaw === '' ? null : Number(priceRaw),
        item_ordered: document.getElementById('f-item_ordered').value.trim() || null,
        bean_name: document.getElementById('f-tasting-bean').value.trim() || null,
        bean_type: getBeanType('tasting') || null,
        brewing_method: document.getElementById('f-brewing_method').value || null,
        atmosphere_tags: getTagValues('atmosphere'),
        decor_tags:      getTagValues('decor'),
        service_tags:    getTagValues('service'),
        atmosphere_notes: document.getElementById('f-tag-atmosphere-notes')?.value || null,
        decor_notes:      document.getElementById('f-tag-decor-notes')?.value || null,
        service_notes:    document.getElementById('f-tag-service-notes')?.value || null,
        defects: defects || null,
        notes: notes || null,
        schema_version: 2,
        ...ev,
    };
}

async function submitForm() {
    if (!state.currentForm) return;
    const { mode, recordId } = state.currentForm;

    if (mode === 'cupping') {
        const beanEl = document.getElementById('f-cupping-bean');
        if (!beanEl.value.trim()) {
            beanEl.focus();
            showToast('請輸入咖啡名稱 / 豆名');
            return;
        }
    }
    const shopId = document.getElementById('f-shop').value;
    if (mode === 'tasting' && !shopId) {
        document.getElementById('f-shop').focus();
        showToast('品鑑記錄必須指定店家');
        return;
    }
    if (!getBeanType(mode)) {
        const firstChip = document.querySelector(
            `.bean-type-chip-row[data-bean-type-group="${mode}"] .bean-type-chip`);
        firstChip?.focus();
        showToast('請選擇豆子類型（單品 / 配方豆）');
        return;
    }

    const saveBtn = document.getElementById('f-save');
    saveBtn.disabled = true;
    try {
        const payload = buildFormPayload(mode);
        if (recordId) {
            await api.updateRecord(mode, recordId, payload);
            showToast('✓ 已更新');
        } else {
            const created = await api.createRecord(mode, payload);
            showToast('✓ 已儲存');
            navigate(`/${mode}/${created.id}`);
            return;
        }
    } catch (e) {
        console.error(e);
        alert('儲存失敗：' + (e.message || e));
    } finally {
        saveBtn.disabled = false;
    }
}

async function deleteCurrentRecord() {
    if (!state.currentForm || !state.currentForm.recordId) return;
    const { mode, recordId } = state.currentForm;
    const display = mode === 'cupping'
        ? (document.getElementById('f-cupping-bean').value.trim() || '此杯測記錄')
        : (document.getElementById('f-item_ordered').value.trim()
            || document.getElementById('f-tasting-bean').value.trim()
            || '此品鑑記錄');
    if (!confirm(`刪除「${display}」？此操作無法復原。`)) return;
    try {
        await api.deleteRecord(mode, recordId);
        showToast('✓ 已刪除');
        navigate('/records');
    } catch (e) {
        alert('刪除失敗：' + (e.message || e));
    }
}

async function loadRecordIntoForm(mode, recordId) {
    try {
        const r = await api.getRecord(mode, recordId);
        if (!r) {
            alert('找不到記錄');
            navigate('/records');
            return;
        }

        // shop
        const shopSel = document.getElementById('f-shop');
        if (r.shop_id && !state.shops.some(s => s.id === r.shop_id)) {
            // Preserve the shop_id in the dropdown so saving doesn't drop the FK.
            // Label depends on whether shops loaded successfully — if the cache
            // never loaded, the shop might still exist; don't claim it's deleted.
            const opt = document.createElement('option');
            opt.value = r.shop_id;
            opt.textContent = state.shopsLoaded ? '(已刪除店家)' : '(店家載入失敗)';
            shopSel.appendChild(opt);
        }
        shopSel.value = r.shop_id || '';

        // common fields
        document.getElementById('f-defects').value = r.defects || '';
        document.getElementById('f-notes').value = r.notes || '';
        if (r.notes) expandNotesSlot('f-notes', { focus: false });

        if (mode === 'cupping') {
            document.getElementById('f-cupping-bean').value = r.bean_name || '';
            ['origin', 'process', 'roast', 'grind', 'water_temp', 'ratio', 'method', 'extraction_time', 'blend_composition']
                .forEach(k => {
                    const el = document.getElementById(`f-${k}`);
                    if (el && r[k] != null) el.value = r[k];
                });
            // Legacy rows have no bean_type. Only auto-pick when there's an
            // unambiguous signal (a blend_composition); otherwise force the
            // user to choose on save.
            const fallback = r.blend_composition ? 'blend' : '';
            setBeanType('cupping', r.bean_type || fallback);
        } else {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
            set('f-visit_date', r.visit_date || '');
            set('f-price', r.price ?? '');
            set('f-item_ordered', r.item_ordered || '');
            set('f-tasting-bean', r.bean_name || '');
            set('f-brewing_method', r.brewing_method || '');
            // Legacy tasting rows have no bean_type — leave empty so the user picks one on edit.
            setBeanType('tasting', r.bean_type || '');

            setTagValues('atmosphere', r.atmosphere_tags || []);
            setTagValues('decor',      r.decor_tags || []);
            setTagValues('service',    r.service_tags || []);

            const setNotes = (id, val) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.value = val ?? '';
                if (val) expandNotesSlot(id, { focus: false });
            };
            setNotes('f-tag-atmosphere-notes', r.atmosphere_notes);
            setNotes('f-tag-decor-notes',      r.decor_notes);
            setNotes('f-tag-service-notes',    r.service_notes);
        }

        // CoE
        coeState.coeTotal = typeof r.coe_total === 'number' ? r.coe_total : 82;
        coeState.selectedTierId = r.coe_tier_id || tierFromScore(coeState.coeTotal).id;
        renderTierMedals();
        renderScoreChips(tierById(coeState.selectedTierId));
        refreshTotalDisplay();

        // Evaluations
        if (r.evaluations) {
            referenceFields.forEach(f => {
                const data = r.evaluations[f.key];
                if (!data) return;
                if (typeof data.score === 'number') setReferenceScore(f.key, data.score);
                const notesEl = document.getElementById(`${f.key}_notes`);
                if (notesEl) {
                    notesEl.value = data.notes || '';
                    if (data.notes) expandNotesSlot(`${f.key}_notes`, { focus: false });
                }
                if (f.custom) {
                    const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
                    if (data[pk]) {
                        const radio = document.querySelector(
                            `input[name="${f.key}_${pk}"][value="${CSS.escape(data[pk])}"]`);
                        if (radio) radio.checked = true;
                    }
                    (data[sk] || []).forEach(v => {
                        const cb = document.querySelector(
                            `input[name="${f.key}_${sk}"][value="${CSS.escape(v)}"]`);
                        if (cb) cb.checked = true;
                    });
                }
                if (f.hasFlavorWheel && Array.isArray(data.flavors)) {
                    applyFlavorSelections(`${f.key}_flavorList`, data.flavors);
                }
                updateRefSummary(f.key);
            });
        }

        if (r.observation) {
            observationFields.forEach(f => {
                const data = r.observation[f.key];
                if (!data) return;
                const notesEl = document.getElementById(`${f.key}_notes`);
                if (notesEl) {
                    notesEl.value = data.notes || '';
                    if (data.notes) expandNotesSlot(`${f.key}_notes`, { focus: false });
                }
                if (f.key === 'aroma') {
                    const dry = document.getElementById(`${f.key}_dryAroma`);
                    const wet = document.getElementById(`${f.key}_wetAroma`);
                    if (dry) dry.value = data.dryAroma || '';
                    if (wet) wet.value = data.wetAroma || '';
                }
                if (f.hasFlavorWheel && Array.isArray(data.flavors)) {
                    applyFlavorSelections(`${f.key}_flavorList`, data.flavors);
                }
                updateObservationSummary(f.key);
            });
        }
    } catch (e) {
        console.error(e);
        alert('讀取失敗：' + (e.message || e));
    }
}

// ─── Shop modal ──────────────────────────────────────────────────────────────
function openShopModal({ shop = null, onSaved = null } = {}) {
    const tpl = document.getElementById('tpl-shop-modal');
    const node = tpl.content.firstElementChild.cloneNode(true);
    document.body.appendChild(node);
    document.body.classList.add('modal-open-custom');

    const nameEl = node.querySelector('#sm-name');
    const locEl  = node.querySelector('#sm-location');
    const intEl  = node.querySelector('#sm-intro');
    const titleEl = node.querySelector('#shop-modal-title');

    if (shop) {
        titleEl.textContent = '編輯店家';
        nameEl.value = shop.name || '';
        locEl.value  = shop.location || '';
        intEl.value  = shop.intro || '';
    }

    const close = () => {
        node.remove();
        document.body.classList.remove('modal-open-custom');
    };

    node.querySelector('.modal-close').addEventListener('click', close);
    node.querySelector('[data-action="cancel"]').addEventListener('click', close);
    node.addEventListener('click', e => {
        if (e.target === node) close();
    });

    node.querySelector('#shop-modal-form').addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {
            name: nameEl.value.trim(),
            location: locEl.value.trim() || null,
            intro: intEl.value.trim() || null,
        };
        if (!payload.name) {
            nameEl.focus();
            return;
        }
        try {
            const saved = shop
                ? await api.updateShop(shop.id, payload)
                : await api.createShop(payload);
            showToast(shop ? '✓ 已更新店家' : '✓ 已新增店家');
            await refreshShopsCache();
            close();
            if (typeof onSaved === 'function') onSaved(saved);
            else {
                // Default behavior depending on current view
                const { parts } = parseHash();
                if (parts[0] === 'shops') renderRoute();
                else if (state.currentForm) {
                    const shopSel = document.getElementById('f-shop');
                    populateShopSelect(shopSel, state.currentForm.mode === 'tasting');
                    shopSel.value = saved.id;
                }
            }
        } catch (e2) {
            // Postgres unique_violation — Supabase passes the SQLSTATE through .code
            if (e2.code === '23505') {
                alert('店家名稱已存在');
            } else {
                alert('儲存失敗：' + (e2.message || e2));
            }
        }
    });

    setTimeout(() => nameEl.focus(), 0);
}

// ─── View: shops list ───────────────────────────────────────────────────────
async function viewShopsList(root) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }
    root.innerHTML = `
        <div class="page-action-bar">
            <button class="btn btn-primary" id="shops-new">
                <i class="bi bi-plus-lg me-1"></i>新增店家
            </button>
        </div>
        <div id="shops-grid" class="shops-grid">
            <div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>
        </div>`;

    document.getElementById('shops-new').addEventListener('click', () => openShopModal());

    try {
        const shops = await api.listShops();
        state.shops = shops;
        state.shopsLoaded = true;
        const grid = document.getElementById('shops-grid');
        if (shops.length === 0) {
            grid.innerHTML = `<div class="empty-state">
                <i class="bi bi-shop"></i>
                <p>還沒有店家</p>
                <button class="btn btn-primary btn-sm" id="shops-new-inline">
                    <i class="bi bi-plus-lg me-1"></i>新增第一個店家
                </button>
            </div>`;
            document.getElementById('shops-new-inline')
                .addEventListener('click', () => openShopModal());
            return;
        }
        grid.innerHTML = shops.map(s => `
            <a class="shop-card" href="#/shops/${s.id}">
                <div class="shop-card-header">
                    <i class="bi bi-shop"></i>
                    <span class="shop-card-name">${escapeHtml(s.name)}</span>
                </div>
                ${s.location ? `<div class="shop-card-loc"><i class="bi bi-geo-alt"></i>${escapeHtml(s.location)}</div>` : ''}
                ${s.intro ? `<div class="shop-card-intro">${escapeHtml(s.intro)}</div>` : ''}
            </a>
        `).join('');
    } catch (e) {
        document.getElementById('shops-grid').innerHTML =
            `<div class="empty-state error"><i class="bi bi-exclamation-triangle"></i>讀取失敗：${escapeHtml(e.message || String(e))}</div>`;
    }
}

// ─── View: shop detail ──────────────────────────────────────────────────────
async function viewShopDetail(root, shopId) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }
    root.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>';
    try {
        const [shop, records] = await Promise.all([
            api.getShop(shopId),
            api.listRecords({ type: 'all', shopId }),
        ]);
        if (!shop) {
            root.innerHTML = `<div class="card"><div class="card-body">
                <h3 class="card-title"><i class="bi bi-exclamation-circle"></i>找不到店家</h3>
                <a class="btn btn-primary" href="#/shops">回到店家列表</a>
            </div></div>`;
            return;
        }

        root.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="shop-detail-header">
                        <h2 class="shop-detail-name"><i class="bi bi-shop"></i>${escapeHtml(shop.name)}</h2>
                        <div class="shop-detail-actions">
                            <button class="btn btn-outline-secondary btn-sm" id="shop-edit">
                                <i class="bi bi-pencil"></i>編輯
                            </button>
                            <button class="btn btn-outline-danger btn-sm" id="shop-delete">
                                <i class="bi bi-trash"></i>刪除
                            </button>
                        </div>
                    </div>
                    ${shop.location ? `<div class="shop-detail-loc"><i class="bi bi-geo-alt"></i>${escapeHtml(shop.location)}</div>` : ''}
                    ${shop.intro ? `<p class="shop-detail-intro">${escapeHtml(shop.intro)}</p>` : ''}
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <h3 class="card-title">
                        <i class="bi bi-collection"></i>相關記錄
                        <span class="text-muted small ms-auto">${records.length} 筆</span>
                    </h3>
                    <div class="records-list">
                        ${records.length === 0
                            ? `<div class="empty-state"><i class="bi bi-inbox"></i>還沒有相關記錄</div>`
                            : records.map(renderRecordCard).join('')}
                    </div>
                </div>
            </div>`;

        document.getElementById('shop-edit').addEventListener('click', () =>
            openShopModal({ shop }));
        document.getElementById('shop-delete').addEventListener('click', async () => {
            if (records.length > 0) {
                if (!confirm(`「${shop.name}」目前有 ${records.length} 筆相關記錄。\n\n刪除店家會：\n• 連帶刪除所有品鑑記錄\n• 杯測記錄保留但失去店家連結\n\n確定要刪除嗎？`)) return;
            } else {
                if (!confirm(`刪除店家「${shop.name}」？`)) return;
            }
            try {
                await api.deleteShop(shopId);
                await refreshShopsCache();
                showToast('✓ 已刪除店家');
                navigate('/shops');
            } catch (e) {
                alert('刪除失敗：' + (e.message || e));
            }
        });
    } catch (e) {
        root.innerHTML = `<div class="empty-state error">
            <i class="bi bi-exclamation-triangle"></i>讀取失敗：${escapeHtml(e.message || String(e))}
        </div>`;
    }
}

// ─── Init ────────────────────────────────────────────────────────────────────
window.addEventListener('hashchange', renderRoute);
document.addEventListener('DOMContentLoaded', () => {
    if (!location.hash) location.hash = '#/records';
    renderRoute();
});
