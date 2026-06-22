/* =============================================================================
   Coffee Review — single-page app
   Pages (hash routes):
     #/records             list (filter chips + cards)         [default]
     #/cupping/<id>        read-only detail 杯測
     #/tasting/<id>        read-only detail 品鑑
     #/new                 mode picker (杯測 / 品鑑)
     #/new/cupping         new 杯測
     #/new/tasting         new 品鑑（可附 ?shop=<id>）
     #/shops               shop list / management（含搜尋）
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
// Chip 快選選項：每個 sub-key 為一組 chip 群組
//   type: 'single' → radio 行為，儲存為字串
//   type: 'multi'  → checkbox 行為，儲存為字串陣列
const evaluationOptions = {
    flavor: {
        intensity:   { label: '強度',   type: 'single',
                       options: ['微弱', '中等', '濃郁', '爆發'] },
        complexity:  { label: '複雜度', type: 'single',
                       options: ['單一明確', '雙層次', '多層次', '變化豐富'] },
        development: { label: '發展',   type: 'multi',
                       options: ['靜態', '隨溫度變化', '入口至尾韻變化', '加奶後變化'] },
    },
    acidity: {
        intensity: { label: '強度', type: 'single',
                     options: ['微弱', '中等', '明亮', '銳利'] },
        types:     { label: '類型', type: 'multi',
                     options: ['檸檬酸（柑橘）', '蘋果酸（青蘋果）', '酒石酸（葡萄酒感）',
                               '磷酸（清涼）', '醋酸', '乳酸（優格感）', '發酵酸'] },
        textures:  { label: '質地', type: 'multi',
                     options: ['活潑', '柔和', '圓潤', '刺激', '尖銳', '多汁'] },
    },
    sweetness: {
        intensity:   { label: '強度',   type: 'single',
                       options: ['微甜', '適中', '濃郁', '蜜香'] },
        types:       { label: '類型',   type: 'multi',
                       options: ['蔗糖', '蜂蜜', '焦糖', '紅糖', '麥芽', '果糖', '煉乳感'] },
        persistence: { label: '持久度', type: 'single',
                       options: ['短暫', '中等', '悠長'] },
    },
    mouthfeel: {
        weight:    { label: '重量級別', type: 'single',
                     options: ['輕盈如茶', '圓潤順口', '醇厚飽滿'] },
        texture:   { label: '質地描述', type: 'multi',
                     options: ['絲滑感', '奶油感', '絨布感', '糖漿感', '多汁感',
                               '清脆感', '乾澀感', '氣泡感', '顆粒感'] },
        viscosity: { label: '黏稠度',   type: 'single',
                     options: ['稀薄', '適中', '濃稠'] },
        touch:     { label: '觸感',     type: 'multi',
                     options: ['清涼', '溫潤', '刺激', '礦物感'] },
    },
    aftertaste: {
        length:  { label: '尾韻長度', type: 'single',
                   options: ['短暫', '中等', '悠長', '綿延'] },
        quality: { label: '尾韻質地', type: 'multi',
                   options: ['乾淨', '粗糙 / 乾澀', '富有變化'] },
        finish:  { label: '風味回甘', type: 'multi',
                   options: ['果香殘留', '巧克力尾', '花香尾', '堅果尾',
                             '焦糖尾', '回甘明顯', '苦尾', '酸尾'] },
    },
    cleanness: {
        description: { label: '描述', type: 'single',
                       options: ['透亮乾淨', '純粹', '略帶雜質', '模糊', '混濁'] },
    },
    balance: {
        description: { label: '描述',     type: 'single',
                       options: ['完整協調', '大致平衡', '略偏一邊', '失衡'] },
        dominant:    { label: '突出元素', type: 'multi',
                       options: ['酸主導', '甜主導', '苦主導', '風味主導', '口感主導'] },
    },
    overall: {
        impression: { label: '印象', type: 'single',
                      options: ['驚艷', '出色', '合格', '平凡', '失望'] },
        intent:     { label: '意願', type: 'multi',
                      options: ['想再喝', '想分享', '想推薦給人',
                                '想了解豆況', '不會再點'] },
    },
};

const observationOptions = {
    aroma: {
        intensity:   { label: '強度',     type: 'single',
                       options: ['微弱', '中等', '飽滿', '強烈'] },
        persistence: { label: '持久度',   type: 'single',
                       options: ['短', '中', '長'] },
        dryVsWet:    { label: '乾濕對比', type: 'single',
                       options: ['乾香較強', '濕香較強', '均衡'] },
    },
};

const defectsOptions = [
    '過萃', '萃取不足', '苦澀', '焦味', '酸敗', '紙味', '木味',
    '霉味', '土味', '化學味', '澀感', '雜味', '金屬味', '發酵過度',
];

const referenceFields = [
    { key: 'flavor',     label: '風味 Flavor',      icon: 'bi-droplet-half',     hasFlavorWheel: true },
    { key: 'acidity',    label: '酸質 Acidity',     icon: 'bi-lightning-charge' },
    { key: 'sweetness',  label: '甜度 Sweetness',   icon: 'bi-heart' },
    { key: 'mouthfeel',  label: '口感 Mouthfeel',   icon: 'bi-circle-half' },
    { key: 'aftertaste', label: '尾韻 Aftertaste',  icon: 'bi-soundwave' },
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
    listFilter: { type: 'all', shopKeyword: '', tiers: [], dateFrom: '', dateTo: '' },
    currentForm: null,  // { mode, recordId|null }
    knownOrigins: [],   // distinct origin strings from past cupping records
    knownOriginsLoaded: false,
    knownItems: [],     // distinct item_ordered strings from past tasting records
    knownItemsLoaded: false,
};

const COMMON_COUNTRIES = [
    '衣索比亞', '哥倫比亞', '巴西', '肯亞', '瓜地馬拉',
    '哥斯大黎加', '巴拿馬', '印尼', '葉門', '薩爾瓦多',
    '宏都拉斯', '盧安達', '蒲隆地', '雲南', '台灣',
];

const COMMON_PROCESSES = [
    '水洗', '日曬', '蜜處理', '厭氧發酵', '半水洗', '濕刨法',
];

// 品鑑「點用品項」分層清單：先選分類、再選品項，減少同時顯示的按鈕數。
// 自訂值仍可直接打字，會被記住。分類僅為選取輔助，入庫只存單一 item_ordered 字串。
const ITEM_GROUPS = [
    { key: 'espresso', label: '義式系列', items: ['濃縮', '冰美式', '熱美式'] },
    { key: 'milk',     label: '奶系列',   items: ['冰拿鐵', '熱拿鐵', '卡布奇諾', '馥列白', '摩卡'] },
    { key: 'pourover', label: '手沖',     items: ['手沖', '冰手沖'] },
    { key: 'coldbrew', label: '冷萃',     items: ['冰萃', '冰滴'] },
    { key: 'other',    label: '其他',     items: [] },
];
// 扁平清單供 datalist 自動補全使用。
const COMMON_ITEMS = ITEM_GROUPS.flatMap(g => g.items);

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

// ─── Google Maps Places loader (lazy) ────────────────────────────────────────
let googleMapsPromise = null;
function isGoogleMapsReady() {
    return !!(window.GOOGLE_CONFIG && window.GOOGLE_CONFIG.mapsApiKey);
}
async function ensureGoogleMaps() {
    if (!isGoogleMapsReady()) return null;
    if (googleMapsPromise) return googleMapsPromise;
    googleMapsPromise = (async () => {
        try {
            const mod = await import('https://cdn.jsdelivr.net/npm/@googlemaps/js-api-loader@1/+esm');
            const loader = new mod.Loader({
                apiKey: window.GOOGLE_CONFIG.mapsApiKey,
                version: 'weekly',
                libraries: ['places'],
            });
            await loader.importLibrary('places');
            return window.google;
        } catch (e) {
            console.warn('Google Maps load failed:', e);
            googleMapsPromise = null;
            return null;
        }
    })();
    return googleMapsPromise;
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

    async listRecords({ type = 'all' } = {}) {
        const sb = await ensureSupabase();
        if (!sb) return [];
        const baseCols = 'id, shop_id, coe_total, coe_tier_id, created_at';
        const tasks = [];
        const unwrap = (r, _type) => {
            if (r.error) throw r.error;
            return (r.data || []).map(x => ({ ...x, _type }));
        };

        // 進階篩選（店家關鍵字 / 徽章 / 日期）一律在前端套用，故這裡只依
        // 類型決定查哪張表，其餘維度交給 applyAdvancedFilters。
        if (type === 'all' || type === 'cupping') {
            const q = sb.from(SUPABASE_CONFIG.cuppingTable)
                .select(`${baseCols}, bean_name, origin`);
            tasks.push(q.order('created_at', { ascending: false })
                .then(r => unwrap(r, 'cupping')));
        }
        if (type === 'all' || type === 'tasting') {
            const q = sb.from(SUPABASE_CONFIG.tastingTable)
                .select(`${baseCols}, visit_date, item_ordered, bean_name`);
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
    const [pathPart, queryPart = ''] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(queryPart));
    return { parts, raw, query };
}

function navigate(path) {
    if (location.hash === `#${path}`) {
        renderRoute();
    } else {
        location.hash = path;
    }
}

async function renderRoute() {
    const { parts, query } = parseHash();
    const root = document.getElementById('app');

    // Cleanup transient form state when leaving a form route
    state.currentForm = null;
    wheelState.clear();

    if (parts.length === 0 || parts[0] === 'records') {
        await viewRecordsList(root, query);
    } else if (parts[0] === 'new' && !parts[1]) {
        viewNewModePicker(root);
    } else if (parts[0] === 'new' && (parts[1] === 'cupping' || parts[1] === 'tasting')) {
        await viewForm(root, { mode: parts[1], recordId: null, prefillShopId: query.shop || null });
    } else if (parts[0] === 'cupping' && parts[1]) {
        await viewRecordDetail(root, { mode: 'cupping', recordId: parts[1] });
    } else if (parts[0] === 'tasting' && parts[1]) {
        await viewRecordDetail(root, { mode: 'tasting', recordId: parts[1] });
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

// ─── Records list filtering ──────────────────────────────────────────────────
// 進階篩選一律在前端套用（記錄量級小，且日期欄位依類型而異）。
function recordDateStr(r) {
    // 杯測用 created_at；品鑑優先 visit_date，缺漏時 fallback created_at（與卡片日期顯示一致）。
    const iso = r._type === 'tasting' ? (r.visit_date || r.created_at) : r.created_at;
    return (iso || '').slice(0, 10);
}

function applyAdvancedFilters(rows) {
    const f = state.listFilter;
    // 店家清單尚未成功載入時 shopName() 會回傳空字串，會把所有記錄誤濾掉，
    // 故 shops 未載入前先略過店家關鍵字篩選。
    const kw = state.shopsLoaded ? f.shopKeyword.trim().toLowerCase() : '';
    return rows.filter(r => {
        if (kw && !shopName(r.shop_id).toLowerCase().includes(kw)) return false;
        if (f.tiers.length && !f.tiers.includes(r.coe_tier_id)) return false;
        if (f.dateFrom || f.dateTo) {
            const d = recordDateStr(r);
            if (!d) return false;
            if (f.dateFrom && d < f.dateFrom) return false;
            if (f.dateTo && d > f.dateTo) return false;
        }
        return true;
    });
}

// 進階條件數（抽屜內的維度）— 用於 badge 與 empty state 判斷。
// 徽章逐一計數（選 3 個徽章 → 3），日期範圍有任一 from/to 即算 1。
function advancedFilterCount() {
    const f = state.listFilter;
    let n = f.tiers.length;
    if (f.dateFrom || f.dateTo) n += 1;
    return n;
}

function hasAnyFilter() {
    const f = state.listFilter;
    return f.type !== 'all' || f.shopKeyword.trim() !== '' || advancedFilterCount() > 0;
}

function hydrateFilterFromQuery(query) {
    state.listFilter = {
        type: query.type === 'cupping' || query.type === 'tasting' ? query.type : 'all',
        shopKeyword: query.shop || '',
        tiers: query.tier ? query.tier.split(',').filter(Boolean) : [],
        dateFrom: query.from || '',
        dateTo: query.to || '',
    };
}

// 序列化篩選條件到 hash query。用 replaceState 避免觸發 hashchange → 整頁重繪。
function syncFilterToHash() {
    const f = state.listFilter;
    const params = new URLSearchParams();
    if (f.type && f.type !== 'all') params.set('type', f.type);
    if (f.shopKeyword.trim()) params.set('shop', f.shopKeyword.trim());
    if (f.tiers.length) params.set('tier', f.tiers.join(','));
    if (f.dateFrom) params.set('from', f.dateFrom);
    if (f.dateTo) params.set('to', f.dateTo);
    const qs = params.toString();
    history.replaceState(null, '', '#/records' + (qs ? `?${qs}` : ''));
}

function updateAdvBadge() {
    const badge = document.getElementById('filter-adv-badge');
    if (!badge) return;
    const n = advancedFilterCount();
    badge.textContent = n > 0 ? String(n) : '';
    badge.hidden = n === 0;
}

// 篩選變更後的共同流程：序列化 → 更新 badge → 重繪卡片。
function onFilterChange() {
    syncFilterToHash();
    updateAdvBadge();
    loadAndRenderCards();
}

function openFilterDrawer() {
    const f = state.listFilter;
    const tierChips = totalScoreTiers.map(t => `
        <button type="button" class="filter-chip ${t.cssClass} ${f.tiers.includes(t.id) ? 'selected' : ''}"
                data-tier-id="${t.id}">${t.medal} | ${escapeHtml(t.label)}</button>`).join('');

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom filter-drawer-backdrop';
    backdrop.innerHTML = `
        <div class="filter-drawer" role="dialog" aria-modal="true" aria-label="進階篩選">
            <header class="modal-header">
                <h3>進階篩選</h3>
                <button type="button" class="modal-close" aria-label="關閉"><i class="bi bi-x-lg"></i></button>
            </header>
            <div class="modal-body">
                <div class="filter-group">
                    <div class="filter-group-title">徽章 / 分數區間</div>
                    <div class="filter-chip-row filter-tier-row">${tierChips}</div>
                </div>
                <div class="filter-group">
                    <div class="filter-group-title">日期範圍</div>
                    <div class="filter-date-row">
                        <input type="date" class="form-control form-control-sm" id="filter-date-from"
                               aria-label="起始日期" value="${f.dateFrom}">
                        <span class="filter-date-sep">→</span>
                        <input type="date" class="form-control form-control-sm" id="filter-date-to"
                               aria-label="結束日期" value="${f.dateTo}">
                    </div>
                </div>
            </div>
            <footer class="modal-actions filter-drawer-actions">
                <button type="button" class="btn btn-sm btn-link" id="filter-clear-all">清除全部</button>
                <button type="button" class="btn btn-sm btn-primary" id="filter-drawer-done">完成</button>
            </footer>
        </div>`;

    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open-custom');
    requestAnimationFrame(() => backdrop.classList.add('show'));

    const close = () => {
        backdrop.remove();
        document.body.classList.remove('modal-open-custom');
    };
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#filter-drawer-done').addEventListener('click', close);

    backdrop.querySelectorAll('[data-tier-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.tierId;
            const i = state.listFilter.tiers.indexOf(id);
            if (i >= 0) state.listFilter.tiers.splice(i, 1);
            else state.listFilter.tiers.push(id);
            btn.classList.toggle('selected');
            onFilterChange();
        });
    });

    const fromEl = backdrop.querySelector('#filter-date-from');
    const toEl = backdrop.querySelector('#filter-date-to');
    fromEl.addEventListener('change', () => { state.listFilter.dateFrom = fromEl.value; onFilterChange(); });
    toEl.addEventListener('change', () => { state.listFilter.dateTo = toEl.value; onFilterChange(); });

    backdrop.querySelector('#filter-clear-all').addEventListener('click', () => {
        state.listFilter = { type: 'all', shopKeyword: '', tiers: [], dateFrom: '', dateTo: '' };
        backdrop.querySelectorAll('[data-tier-id]').forEach(b => b.classList.remove('selected'));
        fromEl.value = '';
        toEl.value = '';
        const kwEl = document.getElementById('filter-shop-kw');
        if (kwEl) kwEl.value = '';
        document.querySelectorAll('.filter-chip[data-filter-type]').forEach(b =>
            b.classList.toggle('selected', b.dataset.filterType === 'all'));
        onFilterChange();
    });
}

// ─── View: records list ─────────────────────────────────────────────────────
async function viewRecordsList(root, query = {}) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }

    hydrateFilterFromQuery(query);

    root.innerHTML = `
        <div class="filter-bar">
            <div class="filter-chip-row" role="group" aria-label="記錄類型">
                <button type="button" class="filter-chip" data-filter-type="all">全部</button>
                <button type="button" class="filter-chip" data-filter-type="cupping">杯測</button>
                <button type="button" class="filter-chip" data-filter-type="tasting">品鑑</button>
            </div>
            <div class="filter-shop-wrap">
                <input type="search" class="form-control form-control-sm" id="filter-shop-kw"
                       placeholder="搜尋店家名稱…" autocomplete="off">
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary filter-adv-btn" id="filter-adv-btn">
                <i class="bi bi-sliders"></i>進階篩選<span class="filter-adv-badge" id="filter-adv-badge" hidden></span>
            </button>
        </div>
        <div id="records-list" class="records-list"></div>`;

    await refreshShopsCache();

    // Shop keyword search (debounce 200ms)
    const kwEl = document.getElementById('filter-shop-kw');
    kwEl.value = state.listFilter.shopKeyword;
    let kwTimer;
    kwEl.addEventListener('input', () => {
        clearTimeout(kwTimer);
        kwTimer = setTimeout(() => {
            // 若 debounce 期間已離開 records 視圖（輸入框被移出 DOM），
            // 就不要再 onFilterChange / replaceState，避免改回 #/records 網址。
            if (!document.body.contains(kwEl)) return;
            state.listFilter.shopKeyword = kwEl.value;
            onFilterChange();
        }, 200);
    });

    // Type chips
    document.querySelectorAll('.filter-chip[data-filter-type]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.filterType === state.listFilter.type);
        btn.addEventListener('click', () => {
            state.listFilter.type = btn.dataset.filterType;
            document.querySelectorAll('.filter-chip[data-filter-type]').forEach(b =>
                b.classList.toggle('selected', b === btn));
            onFilterChange();
        });
    });

    // Advanced filter drawer
    document.getElementById('filter-adv-btn').addEventListener('click', openFilterDrawer);

    updateAdvBadge();
    await loadAndRenderCards();
}

async function loadAndRenderCards() {
    const container = document.getElementById('records-list');
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>';
    try {
        const rows = applyAdvancedFilters(await api.listRecords({ type: state.listFilter.type }));
        if (rows.length === 0) {
            container.innerHTML = hasAnyFilter()
                ? `<div class="empty-state">
                    <i class="bi bi-funnel"></i>
                    <p>找不到符合條件的記錄</p>
                </div>`
                : `<div class="empty-state">
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

// ─── New record mode picker (shared by #/new page and shop dialog) ───────────
// Returns the two record-type option anchors. Pass a shopId to carry it into the
// form via ?shop= so the new record is pre-linked to that shop.
function newModePickerOptions(shopId = null) {
    const suffix = shopId ? `?shop=${encodeURIComponent(shopId)}` : '';
    return `
        <div class="new-mode-picker">
            <a class="new-mode-picker-btn" href="#/new/cupping${suffix}">
                <span class="new-mode-picker-icon"><i class="bi bi-cup-hot"></i></span>
                <span class="new-mode-picker-label">杯測</span>
                <span class="new-mode-picker-desc">記錄自家或樣品豆，含沖煮參數與評分</span>
            </a>
            <a class="new-mode-picker-btn" href="#/new/tasting${suffix}">
                <span class="new-mode-picker-icon"><i class="bi bi-shop"></i></span>
                <span class="new-mode-picker-label">品鑑</span>
                <span class="new-mode-picker-desc">記錄店家飲用體驗，含氛圍、裝潢、服務</span>
            </a>
        </div>`;
}

// ─── View: new record mode picker ───────────────────────────────────────────
function viewNewModePicker(root) {
    root.innerHTML = `
        <div class="card new-mode-picker-card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-plus-circle"></i>新增記錄</h3>
                <p class="new-mode-picker-hint">請先選擇記錄類型，建立後無法變更。</p>
                ${newModePickerOptions()}
            </div>
        </div>`;
}

// ─── View: record detail (read-only) ───────────────────────────────────────
async function viewRecordDetail(root, { mode, recordId }) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }
    root.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>';
    try {
        await refreshShopsCache();
        const r = await api.getRecord(mode, recordId);
        if (!r) {
            root.innerHTML = `<div class="card"><div class="card-body">
                <h3 class="card-title"><i class="bi bi-exclamation-circle"></i>找不到記錄</h3>
                <a class="btn btn-primary" href="#/records">回到記錄列表</a>
            </div></div>`;
            return;
        }
        root.innerHTML = renderRecordDetail(mode, r);
    } catch (e) {
        console.error(e);
        root.innerHTML = `<div class="empty-state error">
            <i class="bi bi-exclamation-triangle"></i>讀取失敗：${escapeHtml(e.message || String(e))}
        </div>`;
    }
}

function renderRecordDetail(mode, r) {
    const tier = r.coe_tier_id ? tierById(r.coe_tier_id)
        : (typeof r.coe_total === 'number' ? tierFromScore(r.coe_total) : null);
    const score = typeof r.coe_total === 'number' ? r.coe_total.toFixed(1) : '—';
    const title = deriveTitle({ ...r, _type: mode });
    const shop = shopName(r.shop_id);
    const shopLinkable = !!(r.shop_id && state.shops.find(s => s.id === r.shop_id));
    const date = mode === 'tasting' && r.visit_date ? fmtDate(r.visit_date) : fmtDate(r.created_at);

    const estTotal = computeEstimatedTotalFromRecord(r);
    const estTier = estTotal != null ? tierFromScore(estTotal) : null;

    return `
        <div class="detail-back-bar">
            <a class="detail-back-link" href="#/records">
                <i class="bi bi-chevron-left"></i>返回記錄列表
            </a>
            <span class="record-card-type-badge type-${mode}">${mode === 'tasting' ? '品鑑' : '杯測'}</span>
        </div>

        <div class="card detail-header-card">
            <div class="card-body">
                <h2 class="detail-title">${escapeHtml(title)}</h2>
                <div class="detail-meta">
                    ${shop ? (shopLinkable
                        ? `<a class="detail-meta-shop" href="#/shops/${r.shop_id}"><i class="bi bi-shop"></i>${escapeHtml(shop)}</a>`
                        : `<span><i class="bi bi-shop"></i>${escapeHtml(shop)}</span>`) : ''}
                    ${date ? `<span><i class="bi bi-calendar3"></i>${escapeHtml(date)}</span>` : ''}
                    ${mode === 'tasting' && r.price != null
                        ? `<span><i class="bi bi-cash-coin"></i>$${escapeHtml(String(r.price))}</span>`
                        : ''}
                </div>
            </div>
        </div>

        ${renderDetailBasicCard(mode, r)}
        ${mode === 'cupping' ? renderDetailBrewingCard(r) : ''}
        ${mode === 'tasting' ? renderDetailTastingTagsCard(r) : ''}

        <div class="card coe-card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-award-fill"></i>CoE 總分</h3>
                <div class="coe-total-block">
                    <span class="coe-total-display">${score}</span>
                    <span class="coe-total-of">/ 100</span>
                    ${tier ? `<span class="coe-total-tier-badge" style="color:${tier.color}">[ ${tier.badgeName} ]</span>` : ''}
                    ${tier ? `<span class="coe-total-desc">${escapeHtml(tier.description)}</span>` : ''}
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-bookmark-star-fill"></i>感官評估</h3>
                ${estTotal != null ? `
                    <div class="evaluation-estimated-total">
                        <span class="evaluation-estimated-label">預估總分</span>
                        <span class="evaluation-estimated-value">${estTotal.toFixed(1)}</span>
                        <span class="evaluation-estimated-of">/ 100</span>
                        ${estTier ? `<span class="evaluation-estimated-tier" style="color:${estTier.color}">[ ${estTier.badgeName} ]</span>` : ''}
                        <span class="evaluation-estimated-hint">36 + 8 項分數加總</span>
                    </div>` : ''}
                ${renderDetailObservations(r)}
                ${renderDetailReferences(r)}
                ${renderDetailDefectsNotes(r)}
            </div>
        </div>`;
}

function renderDetailBasicCard(mode, r) {
    if (mode === 'cupping') {
        const rows = [];
        if (r.bean_type) rows.push(['豆子類型', r.bean_type === 'blend' ? '配方豆' : '單品']);
        if (r.bean_type !== 'blend') {
            if (r.origin) rows.push(['產地', r.origin]);
            if (r.process) rows.push(['處理法', r.process]);
        } else if (r.blend_composition) {
            rows.push(['配方組成', r.blend_composition]);
        }
        if (r.roast) rows.push(['烘焙度', r.roast]);
        if (rows.length === 0) return '';
        return `
            <div class="card">
                <div class="card-body">
                    <h3 class="card-title"><i class="bi bi-info-circle"></i>咖啡資訊</h3>
                    <dl class="detail-list">
                        ${rows.map(([k, v]) =>
                            `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
                    </dl>
                </div>
            </div>`;
    }
    // tasting
    const rows = [];
    if (r.bean_type) rows.push(['豆子類型', r.bean_type === 'blend' ? '配方豆' : '單品']);
    if (r.item_ordered) rows.push(['點用品項', r.item_ordered]);
    if (r.bean_name) rows.push(['品項豆子名', r.bean_name]);
    if (r.brewing_method) rows.push(['沖煮方式', r.brewing_method]);
    if (rows.length === 0) return '';
    return `
        <div class="card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-journal-text"></i>品鑑資訊</h3>
                <dl class="detail-list">
                    ${rows.map(([k, v]) =>
                        `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
                </dl>
            </div>
        </div>`;
}

function renderDetailBrewingCard(r) {
    const rows = [];
    if (r.method) rows.push(['方法', r.method]);
    if (r.grind) rows.push(['研磨度', r.grind]);
    if (r.water_temp) rows.push(['水溫', `${r.water_temp} °C`]);
    if (r.ratio) rows.push(['粉水比', r.ratio]);
    if (r.extraction_time) rows.push(['萃取時間', `${r.extraction_time} 秒`]);
    if (rows.length === 0) return '';
    return `
        <div class="card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-sliders"></i>沖煮參數</h3>
                <dl class="detail-list">
                    ${rows.map(([k, v]) =>
                        `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
                </dl>
            </div>
        </div>`;
}

function renderDetailTastingTagsCard(r) {
    const sections = tastingTagSections.map(sec => {
        const tags = r[`${sec.key}_tags`] || [];
        const notes = r[`${sec.key}_notes`] || '';
        if (tags.length === 0 && !notes) return '';
        return `
            <div class="detail-tag-section">
                <div class="detail-tag-section-title">
                    <i class="bi ${sec.icon}"></i>${escapeHtml(sec.label)}
                </div>
                ${tags.length > 0 ? `<div class="detail-tag-row">
                    ${tags.map(t => `<span class="detail-tag-pill">${escapeHtml(t)}</span>`).join('')}
                </div>` : ''}
                ${notes ? `<p class="detail-tag-notes">${escapeHtml(notes)}</p>` : ''}
            </div>`;
    }).filter(Boolean).join('');
    if (!sections) return '';
    return `
        <div class="card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-emoji-smile"></i>探訪心得</h3>
                ${sections}
            </div>
        </div>`;
}

function renderChipRow(values) {
    if (!values || values.length === 0) return '';
    return `<div class="detail-tag-row">${values.map(v =>
        `<span class="detail-tag-pill">${escapeHtml(v)}</span>`).join('')}</div>`;
}

function renderChipDetailRows(spec, data) {
    if (!spec || !data) return '';
    let html = '';
    Object.entries(spec).forEach(([subKey, sub]) => {
        const v = data[subKey];
        if (sub.type === 'single') {
            if (v) {
                html += `<div class="detail-eval-row">
                    <span class="detail-eval-key">${escapeHtml(sub.label)}</span>
                    <span class="detail-eval-val">${escapeHtml(v)}</span>
                </div>`;
            }
        } else {
            const arr = Array.isArray(v) ? v : (v ? [v] : []);
            if (arr.length > 0) {
                html += `<div class="detail-eval-row">
                    <span class="detail-eval-key">${escapeHtml(sub.label)}</span>
                    <span class="detail-eval-val">${arr.map(escapeHtml).join('、')}</span>
                </div>`;
            }
        }
    });
    return html;
}

function renderDetailObservations(r) {
    if (!r.observation) return '';
    return observationFields.map(f => {
        const data = r.observation[f.key];
        if (!data) return '';
        const flavorChips = (data.flavors || [])
            .map(decodeFlavorMeta).filter(Boolean)
            .map(m => `<span class="detail-flavor-chip" style="--ft-color:${m.color}">${escapeHtml(m.name)}</span>`).join('');
        const chipRows = renderChipDetailRows(observationOptions[f.key], data);
        const hasContent = data.dryAroma || data.wetAroma || data.notes || flavorChips || chipRows;
        if (!hasContent) return '';
        return `
            <div class="detail-eval-section">
                <h4 class="detail-eval-section-title">
                    <span class="eval-icon"><i class="bi ${f.icon}"></i></span>${escapeHtml(f.label)}
                </h4>
                ${data.dryAroma ? `<div class="detail-eval-row"><span class="detail-eval-key">乾香</span><span class="detail-eval-val">${escapeHtml(data.dryAroma)}</span></div>` : ''}
                ${data.wetAroma ? `<div class="detail-eval-row"><span class="detail-eval-key">濕香</span><span class="detail-eval-val">${escapeHtml(data.wetAroma)}</span></div>` : ''}
                ${chipRows}
                ${flavorChips ? `<div class="detail-flavor-row">${flavorChips}</div>` : ''}
                ${data.notes ? `<p class="detail-eval-notes">${escapeHtml(data.notes)}</p>` : ''}
            </div>`;
    }).join('');
}

function renderDetailReferences(r) {
    if (!r.evaluations) return '';
    return referenceFields.map(f => {
        const data = r.evaluations[f.key];
        if (!data) return '';
        const score = typeof data.score === 'number' ? data.score.toFixed(1) : '—';
        const chipRows = renderChipDetailRows(evaluationOptions[f.key], data);
        const flavorChips = (data.flavors || [])
            .map(decodeFlavorMeta).filter(Boolean)
            .map(m => `<span class="detail-flavor-chip" style="--ft-color:${m.color}">${escapeHtml(m.name)}</span>`).join('');
        return `
            <div class="detail-eval-section">
                <h4 class="detail-eval-section-title">
                    <span class="eval-icon"><i class="bi ${f.icon}"></i></span>
                    <span class="detail-eval-section-label">${escapeHtml(f.label)}</span>
                    <span class="detail-eval-score">${score} / 8</span>
                </h4>
                ${chipRows}
                ${flavorChips ? `<div class="detail-flavor-row">${flavorChips}</div>` : ''}
                ${data.notes ? `<p class="detail-eval-notes">${escapeHtml(data.notes)}</p>` : ''}
            </div>`;
    }).join('');
}

function renderDetailDefectsNotes(r) {
    const defectsTags = Array.isArray(r.defects_tags) ? r.defects_tags : [];
    if (!r.defects && !r.notes && defectsTags.length === 0) return '';
    return `
        <div class="detail-eval-section">
            <h4 class="detail-eval-section-title">
                <span class="eval-icon"><i class="bi bi-exclamation-diamond"></i></span>
                <span class="detail-eval-section-label">瑕疵與備註</span>
            </h4>
            ${renderChipRow(defectsTags)}
            ${r.defects ? `<div class="detail-eval-row"><span class="detail-eval-key">補充</span><span class="detail-eval-val">${escapeHtml(r.defects)}</span></div>` : ''}
            ${r.notes ? `<p class="detail-eval-notes">${escapeHtml(r.notes)}</p>` : ''}
        </div>`;
}

function computeEstimatedTotalFromRecord(r) {
    if (!r.evaluations) return null;
    let sum = 0;
    let any = false;
    for (const f of referenceFields) {
        const s = r.evaluations[f.key]?.score;
        if (typeof s === 'number') { sum += s; any = true; }
        else sum += 5;
    }
    return any ? 36 + sum : null;
}

function recordFlavorLeafIds(r) {
    const ids = [];
    if (r.evaluations) {
        for (const v of Object.values(r.evaluations)) {
            if (Array.isArray(v?.flavors)) ids.push(...v.flavors);
        }
    }
    const aroma = r.observation?.aroma;
    if (Array.isArray(aroma?.flavors)) ids.push(...aroma.flavors);
    // 只留葉節點：祖先 id 會是某個更深 id 的 `id + '__'` 前綴
    return ids.filter(id => typeof id === 'string'
        && !ids.some(other => typeof other === 'string' && other !== id && other.startsWith(id + '__')));
}

function summarizeRecords(records) {
    const cupping = records.filter(r => r._type === 'cupping').length;
    const tasting = records.filter(r => r._type === 'tasting').length;
    const counts = { total: records.length, cupping, tasting };

    const scored = records.filter(r => typeof r.coe_total === 'number');
    const avgScore = scored.length
        ? scored.reduce((sum, r) => sum + r.coe_total, 0) / scored.length
        : null;
    const highest = scored.length
        ? scored.reduce((a, b) => (b.coe_total > a.coe_total ? b : a))
        : null;
    const lowest = scored.length
        ? scored.reduce((a, b) => (b.coe_total < a.coe_total ? b : a))
        : null;

    let lastDate = null;
    for (const r of records) {
        const d = (r._type === 'tasting' && r.visit_date) ? r.visit_date : r.created_at;
        if (d && (!lastDate || d > lastDate)) lastDate = d;
    }

    const flavorCounts = new Map();
    for (const r of records) {
        for (const id of recordFlavorLeafIds(r)) {
            const meta = decodeFlavorMeta(id);
            if (!meta) continue;
            const prev = flavorCounts.get(meta.name);
            if (prev) prev.count += 1;
            else flavorCounts.set(meta.name, { name: meta.name, color: meta.color, count: 1 });
        }
    }
    const topFlavors = [...flavorCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        counts,
        avgScore,
        highest: highest ? { record: highest, score: highest.coe_total } : null,
        lowest: lowest ? { record: lowest, score: lowest.coe_total } : null,
        lastDate,
        topFlavors,
    };
}

function decodeFlavorMeta(id) {
    if (!id || typeof id !== 'string') return null;
    const l1Start = id.indexOf('__l1-');
    if (l1Start < 0) return null;
    const rest = id.slice(l1Start + '__l1-'.length);
    const l2Start = rest.indexOf('__l2-');
    const l1Slug = l2Start < 0 ? rest : rest.slice(0, l2Start);
    const l1 = flavors.find(f => f.id === l1Slug);
    if (!l1) return null;
    if (l2Start < 0) return { name: l1.name, color: l1.color };

    const afterL2 = rest.slice(l2Start + '__l2-'.length);
    const l3Start = afterL2.indexOf('__l3-');
    const l2Slug = l3Start < 0 ? afterL2 : afterL2.slice(0, l3Start);

    let l2Obj = null;
    if (Array.isArray(l1.sub)) {
        for (const s of l1.sub) {
            if (typeof s === 'string') {
                if (s.replace(/[/\s]/g, '') === l2Slug) {
                    return { name: s, color: l1.color };
                }
            } else if (s.id === l2Slug) {
                l2Obj = s;
                break;
            }
        }
    }
    if (!l2Obj) return null;
    if (l3Start < 0) return { name: l2Obj.name, color: l2Obj.color || l1.color };

    const l3Slug = afterL2.slice(l3Start + '__l3-'.length);
    if (Array.isArray(l2Obj.sub)) {
        for (const s of l2Obj.sub) {
            if (typeof s === 'string' && s.replace(/[/\s]/g, '') === l3Slug) {
                return { name: s, color: l2Obj.color || l1.color };
            }
        }
    }
    return null;
}

// ─── View: record form (杯測 / 品鑑) ─────────────────────────────────────────
async function viewForm(root, { mode, recordId, prefillShopId = null }) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }

    // Mount the template
    const tpl = document.getElementById('tpl-form');
    root.innerHTML = '';
    root.appendChild(tpl.content.cloneNode(true));

    state.currentForm = { mode, recordId, prefillShopId };

    setFormMode(mode);
    initCoeWidget();
    initEvaluationAccordion();
    initTagSections();
    bindFormHandlers();

    await refreshShopsCache();
    populateShopSelect(document.getElementById('f-shop'), mode === 'tasting');
    applyShopPrefill(prefillShopId);

    // Origin datalist + process chip row are cupping-only UI elements.
    if (mode === 'cupping') {
        renderProcessChips();
        loadKnownOrigins().then(populateOriginDatalist);
        populateOriginDatalist();
    } else {
        // Item picker (category row) + datalist are tasting-only UI elements.
        renderItemCats();
        loadKnownItems().then(populateItemDatalist);
        populateItemDatalist();
    }

    const initialShopId = document.getElementById('f-shop')?.value || '';
    refreshImportBeanForShop(mode, initialShopId);

    if (recordId) {
        document.getElementById('f-save-label').textContent = '儲存變更';
        document.getElementById('f-delete').hidden = false;
        await loadRecordIntoForm(mode, recordId);
    } else {
        document.getElementById('f-save-label').textContent = '儲存';
        document.getElementById('f-delete').hidden = true;
    }
}

function applyShopPrefill(shopId) {
    if (!shopId) return;
    const sel = document.getElementById('f-shop');
    if (!sel) return;
    if ([...sel.options].some(o => o.value === shopId)) {
        sel.value = shopId;
    }
}

function setFormMode(mode) {
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
        const visible = type === 'any' ? !!beanType : beanType === type;
        el.style.display = visible ? '' : 'none';
    });
    document.querySelectorAll('[data-bean-type-text]').forEach(el => {
        const [scope, type] = el.dataset.beanTypeText.split(':');
        if (scope !== mode) return;
        el.style.display = beanType === type ? '' : 'none';
    });
}

// ─── Origin datalist (country dropdown) ──────────────────────────────────────
async function loadKnownOrigins() {
    if (state.knownOriginsLoaded) return;
    const sb = await ensureSupabase();
    if (!sb) return;
    // Defensive cap — distinct happens client-side. If the table grows past
    // a few thousand rows, switch to a Postgres view/RPC returning DISTINCT.
    const { data, error } = await sb.from(SUPABASE_CONFIG.cuppingTable)
        .select('origin').not('origin', 'is', null).limit(2000);
    if (error) {
        console.warn('loadKnownOrigins failed:', error);
        return;
    }
    const seen = new Set();
    (data || []).forEach(row => {
        const v = (row.origin || '').trim();
        if (v) seen.add(v);
    });
    state.knownOrigins = Array.from(seen);
    state.knownOriginsLoaded = true;
}

function populateOriginDatalist() {
    const dl = document.getElementById('origin-options');
    if (!dl) return;
    const all = new Set([...COMMON_COUNTRIES, ...state.knownOrigins]);
    dl.innerHTML = '';
    all.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        dl.appendChild(opt);
    });
}

async function loadKnownItems() {
    if (state.knownItemsLoaded) return;
    const sb = await ensureSupabase();
    if (!sb) return;
    // Defensive cap — distinct happens client-side. If the table grows past
    // a few thousand rows, switch to a Postgres view/RPC returning DISTINCT.
    const { data, error } = await sb.from(SUPABASE_CONFIG.tastingTable)
        .select('item_ordered').not('item_ordered', 'is', null).limit(2000);
    if (error) {
        console.warn('loadKnownItems failed:', error);
        return;
    }
    const seen = new Set();
    (data || []).forEach(row => {
        const v = (row.item_ordered || '').trim();
        if (v) seen.add(v);
    });
    state.knownItems = Array.from(seen);
    state.knownItemsLoaded = true;
}

function populateItemDatalist() {
    const dl = document.getElementById('item-options');
    if (!dl) return;
    const all = new Set([...COMMON_ITEMS, ...state.knownItems]);
    dl.innerHTML = '';
    all.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        dl.appendChild(opt);
    });
}

// ─── Process chip row ────────────────────────────────────────────────────────
function renderProcessChips() {
    const row = document.querySelector('.process-chip-row');
    if (!row) return;
    row.innerHTML = '';
    COMMON_PROCESSES.forEach(p => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'process-chip';
        chip.dataset.process = p;
        chip.setAttribute('aria-pressed', 'false');
        chip.textContent = p;
        chip.addEventListener('click', () => {
            const input = document.getElementById('f-process');
            if (input) input.value = p;
            setProcessChip(p);
        });
        row.appendChild(chip);
    });
}

function setProcessChip(value) {
    document.querySelectorAll('.process-chip').forEach(c => {
        const sel = c.dataset.process === value;
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-pressed', String(sel));
    });
}

// ─── Item picker (品鑑點用品項：分類 → 品項兩層) ──────────────────────────────
function renderItemCats() {
    const row = document.querySelector('.item-cat-row');
    if (!row) return;
    row.innerHTML = '';
    ITEM_GROUPS.forEach(g => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'item-cat-chip';
        chip.dataset.cat = g.key;
        chip.setAttribute('aria-pressed', 'false');
        chip.textContent = g.label;
        chip.addEventListener('click', () => {
            // 只有「切換到不同分類」才清空文字框（落實「切走就清空」，進「其他」也給
            // 乾淨起點）；重複點同一個分類則保留既有選取，避免誤清。
            const switching = !chip.classList.contains('selected');
            activateItemCat(g.key);
            if (switching) {
                const input = document.getElementById('f-item_ordered');
                if (input) input.value = '';
                setItemChip('');
            }
        });
        row.appendChild(chip);
    });
    // 預設隱藏文字框，待點「其他」才顯示。
    const input = document.getElementById('f-item_ordered');
    if (input) input.classList.add('d-none');
}

function activateItemCat(key) {
    document.querySelectorAll('.item-cat-chip').forEach(c => {
        const sel = c.dataset.cat === key;
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-pressed', String(sel));
    });
    renderItemChips(key);
    // 只有「其他」分類顯示自由輸入文字框。
    const input = document.getElementById('f-item_ordered');
    if (input) input.classList.toggle('d-none', key !== 'other');
}

function renderItemChips(catKey) {
    const row = document.querySelector('.item-chip-row');
    if (!row) return;
    row.innerHTML = '';
    const group = ITEM_GROUPS.find(g => g.key === catKey);
    if (!group) return;
    group.items.forEach(p => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'item-chip';
        chip.dataset.item = p;
        chip.setAttribute('aria-pressed', 'false');
        chip.textContent = p;
        chip.addEventListener('click', () => {
            const input = document.getElementById('f-item_ordered');
            if (input) input.value = p;
            setItemChip(p);
        });
        row.appendChild(chip);
    });
    // Re-highlight the current value if it belongs to this category (edit/restore).
    setItemChip(document.getElementById('f-item_ordered')?.value || '');
}

function setItemChip(value) {
    document.querySelectorAll('.item-chip').forEach(c => {
        const sel = c.dataset.item === value;
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-pressed', String(sel));
    });
}

// Activate the category that contains `value` and highlight it (used on edit-load).
function applyItemValue(value) {
    if (!value) { clearItemCats(); return; }   // 空值 → 不選分類、隱藏文字框
    const group = ITEM_GROUPS.find(g => g.items.includes(value));
    if (group) {
        activateItemCat(group.key);
        setItemChip(value);
        return;
    }
    // 自訂值 → 視為「其他」，顯示文字框（value 已由呼叫端 set）。
    activateItemCat('other');
}

// Clear category + item rows and hide the free-text box.
function clearItemCats() {
    document.querySelectorAll('.item-cat-chip').forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-pressed', 'false');
    });
    const row = document.querySelector('.item-chip-row');
    if (row) row.innerHTML = '';
    const input = document.getElementById('f-item_ordered');
    if (input) input.classList.add('d-none');
}

// ─── Import existing bean (per shop) ─────────────────────────────────────────
async function refreshImportBeanForShop(mode, shopId) {
    const block = document.querySelector(`[data-import-bean="${mode}"]`);
    const sel = document.getElementById(`f-import-bean-${mode}`);
    if (!block || !sel) return;

    // Reset
    sel.innerHTML = '<option value="">— 不帶入 —</option>';

    if (!shopId) {
        block.hidden = true;
        return;
    }

    // Always pull from cupping_records (richer fields incl. origin/process/roast).
    const sb = await ensureSupabase();
    if (!sb) { block.hidden = true; return; }
    const { data, error } = await sb.from(SUPABASE_CONFIG.cuppingTable)
        .select('id, bean_name, bean_type, origin, blend_composition, created_at')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('refreshImportBeanForShop failed:', error);
        block.hidden = true;
        return;
    }
    const beans = data || [];

    // Exclude the record being edited first — otherwise it could "claim" its
    // bean's signature in the dedupe pass below, hiding older duplicates and
    // then disappearing itself, leaving the bean unavailable for import.
    const currentId = state.currentForm?.recordId;
    const candidates = currentId ? beans.filter(b => b.id !== currentId) : beans;

    if (!candidates.length) {
        block.hidden = true;
        return;
    }

    // Deduplicate by (bean_name + bean_type + origin/blend_composition) to avoid
    // listing the same bean once per cupping session.
    const seen = new Set();
    candidates.forEach(b => {
        const name = (b.bean_name || '').trim();
        if (!name) return;
        const sig = `${b.bean_type || ''}|${name}|${(b.origin || '').trim()}|${(b.blend_composition || '').trim()}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        const detail = b.bean_type === 'blend'
            ? '配方豆'
            : (b.origin ? b.origin : '單品');
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${name}（${detail}）`;
        sel.appendChild(opt);
    });

    block.hidden = sel.options.length <= 1;
}

async function applyImportedBean(mode, recordId) {
    if (!recordId) return;
    try {
        const r = await api.getRecord('cupping', recordId);
        if (!r) return;
        // Legacy rows may lack bean_type. Only auto-derive 'blend' when there's an
        // unambiguous signal (blend_composition present); otherwise leave the
        // type empty so the user picks consciously — same policy as loadRecordIntoForm.
        const fallbackType = r.blend_composition ? 'blend' : '';
        const beanType = r.bean_type || fallbackType;
        if (mode === 'cupping') {
            setBeanType('cupping', beanType);
            document.getElementById('f-cupping-bean').value = r.bean_name || '';
            document.getElementById('f-origin').value = r.origin || '';
            const processEl = document.getElementById('f-process');
            if (processEl) processEl.value = r.process || '';
            setProcessChip(r.process || '');
            document.getElementById('f-blend_composition').value = r.blend_composition || '';
            if (r.roast) {
                const roastRadio = document.querySelector(`input[name="roast"][value="${CSS.escape(r.roast)}"]`);
                if (roastRadio) roastRadio.checked = true;
            }
            populateOriginDatalist();
        } else {
            setBeanType('tasting', beanType);
            const beanEl = document.getElementById('f-tasting-bean');
            if (beanEl) beanEl.value = r.bean_name || '';
        }
    } catch (e) {
        console.warn('applyImportedBean failed:', e);
    }
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
        opt.textContent = (s.google_place_id ? '📍 ' : '') + s.name + (s.location ? ` · ${s.location}` : '');
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
// 共用：渲染 button-style chip 群組（single / multi）
// 兩種型別都用 role="group"：children 是 toggle button（aria-pressed），
// 不符合 radiogroup 的 ARIA 規範（後者期望 role="radio" + aria-checked + 鍵盤導覽）。
function chipGroupHtml(name, label, type, options) {
    return `
        <span class="chip-group-label" id="${escapeHtml(name)}_label">${escapeHtml(label)}</span>
        <div class="chip-group" role="group" aria-labelledby="${escapeHtml(name)}_label"
             data-chip-name="${escapeHtml(name)}" data-chip-type="${type}">
            ${options.map(opt => `
                <button type="button" class="chip"
                        data-chip-value="${escapeHtml(opt)}"
                        aria-pressed="false">${escapeHtml(opt)}</button>
            `).join('')}
        </div>`;
}

// 從 DOM 讀取 chip group 已選值：single → 字串、multi → 字串陣列
function readChipGroup(name) {
    const group = document.querySelector(`.chip-group[data-chip-name="${CSS.escape(name)}"]`);
    if (!group) return null;
    const isMulti = group.dataset.chipType === 'multi';
    const pressed = group.querySelectorAll('button[aria-pressed="true"]');
    if (!isMulti) return pressed[0]?.dataset.chipValue || '';
    return Array.from(pressed).map(b => b.dataset.chipValue);
}

// 把資料寫入 chip group（用於載入既有記錄）。
// 容忍舊資料型別不一致：multi 期望陣列但拿到字串會自動包成陣列。
function writeChipGroup(name, value) {
    const group = document.querySelector(`.chip-group[data-chip-name="${CSS.escape(name)}"]`);
    if (!group) return;
    const isMulti = group.dataset.chipType === 'multi';
    let values;
    if (isMulti) {
        values = Array.isArray(value) ? value : (value ? [value] : []);
    } else {
        values = [Array.isArray(value) ? value[0] : value].filter(Boolean);
    }
    const selected = new Set(values);
    group.querySelectorAll('button[data-chip-value]').forEach(btn => {
        btn.setAttribute('aria-pressed', String(selected.has(btn.dataset.chipValue)));
    });
}

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

    const chipSpec = evaluationOptions[key];
    if (chipSpec) {
        Object.entries(chipSpec).forEach(([subKey, spec]) => {
            body += chipGroupHtml(`${key}_${subKey}`, spec.label, spec.type, spec.options);
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
    const chipSpec = observationOptions[key];
    if (chipSpec) {
        Object.entries(chipSpec).forEach(([subKey, spec]) => {
            body += chipGroupHtml(`${key}_${subKey}`, spec.label, spec.type, spec.options);
        });
    }
    if (field.hasFlavorWheel) {
        body += `<label class="form-label mt-2">風味（點選後展開細項）:</label>
            <div id="${key}_flavorList" class="flavor-wheel"></div>`;
    }
    body += `<div class="mt-3">${notesSlotHtml(`${key}_notes`)}</div>`;
    return wrapAccordionItem(key, field.label, field.icon, body);
}

function generateDefectsItem() {
    const body = `
        ${chipGroupHtml('defects_tags', '常見瑕疵', 'multi', defectsOptions)}
        <label for="f-defects" class="form-label mt-2">補充說明</label>
        <textarea id="f-defects" class="form-control mb-2" rows="2"
                  placeholder="其他瑕疵描述（選填）..."></textarea>
        <div class="notes-slot" data-notes-slot="f-notes">
            <button type="button" class="notes-toggle" data-notes-target="f-notes"
                    aria-controls="f-notes-body" aria-expanded="false">
                <i class="bi bi-plus-circle"></i> 加上最終備註
            </button>
            <div id="f-notes-body" class="notes-body" hidden>
                <label for="f-notes" class="form-label">最終備註</label>
                <textarea id="f-notes" class="form-control" rows="3"
                          placeholder="請輸入額外的備註..."></textarea>
            </div>
        </div>`;
    return wrapAccordionItem('defects', '瑕疵與備註', 'bi-exclamation-diamond', body);
}

function initEvaluationAccordion() {
    const accordion = document.getElementById('evaluationAccordion');
    if (!accordion) return;
    accordion.innerHTML = [
        ...observationFields.map(generateObservationItem),
        ...referenceFields.map(generateReferenceItem),
        generateDefectsItem(),
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

    updateEstimatedTotalDisplay();
    updateDefectsSummary();

    accordion.addEventListener('input', e => {
        const key = e.target.dataset.refScore;
        if (key) onRefScoreInput(key);
    });
    accordion.addEventListener('click', e => {
        const btn = e.target.closest('.chip[data-chip-value]');
        if (!btn) return;
        const group = btn.closest('.chip-group');
        if (!group) return;
        const isMulti = group.dataset.chipType === 'multi';
        if (isMulti) {
            const next = btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true';
            btn.setAttribute('aria-pressed', next);
        } else {
            group.querySelectorAll('.chip').forEach(b =>
                b.setAttribute('aria-pressed', String(b === btn)));
        }
        const name = group.dataset.chipName;
        if (name === 'defects_tags') {
            updateDefectsSummary();
            return;
        }
        const refKey = name.split('_')[0];
        if (referenceFields.some(f => f.key === refKey)) updateRefSummary(refKey);
        else if (observationFields.some(f => f.key === refKey)) updateObservationSummary(refKey);
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
    updateEstimatedTotalDisplay();
}

function calculateEstimatedTotal() {
    return 36 + referenceFields.reduce((sum, f) => sum + getReferenceScore(f.key), 0);
}

function updateEstimatedTotalDisplay() {
    const valueEl = document.getElementById('evalEstimatedValue');
    if (!valueEl) return;
    const v = calculateEstimatedTotal();
    valueEl.textContent = v.toFixed(1);
    const tier = tierFromScore(v);
    const badge = document.getElementById('evalEstimatedTier');
    if (badge) {
        if (tier) {
            badge.textContent = `[ ${tier.badgeName} ]`;
            badge.style.color = tier.color;
        } else {
            badge.textContent = '';
        }
    }
}

function updateDefectsSummary() {
    const summaryEl = document.getElementById('defects_summary');
    if (!summaryEl) return;
    const tags = readChipGroup('defects_tags') || [];
    const defects = document.getElementById('f-defects')?.value?.trim() || '';
    const notes = document.getElementById('f-notes')?.value?.trim() || '';
    const tagPreview = tags.length > 0
        ? tags.slice(0, 3).join('、') + (tags.length > 3 ? `…(+${tags.length - 3})` : '')
        : '';
    const text = [tagPreview, defects, notes].filter(Boolean).join(' / ');
    if (!text) {
        summaryEl.textContent = '';
        return;
    }
    summaryEl.textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
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

    const chipSpec = evaluationOptions[key];
    if (chipSpec) {
        const chipValues = [];
        Object.keys(chipSpec).forEach(subKey => {
            const v = readChipGroup(`${key}_${subKey}`);
            if (Array.isArray(v)) chipValues.push(...v);
            else if (v) chipValues.push(v);
        });
        if (chipValues.length > 0) {
            const preview = chipValues.slice(0, 3).join(', ')
                + (chipValues.length > 3 ? `…(+${chipValues.length - 3})` : '');
            parts.push(preview);
        }
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
    const chipSpec = observationOptions[key];
    const chipValues = [];
    if (chipSpec) {
        Object.keys(chipSpec).forEach(subKey => {
            const v = readChipGroup(`${key}_${subKey}`);
            if (Array.isArray(v)) chipValues.push(...v);
            else if (v) chipValues.push(v);
        });
    }
    const flavors = getSelectedFlavorNames(`${key}_flavorList`);
    const all = [...chipValues, ...flavors];
    summaryEl.textContent = all.length === 0
        ? ''
        : all.slice(0, 3).join(', ') + (all.length > 3 ? `…(+${all.length - 3})` : '');
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

    document.querySelectorAll('.bean-type-chip-row').forEach(row => {
        const groupMode = row.dataset.beanTypeGroup;
        row.querySelectorAll('.bean-type-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                setBeanType(groupMode, chip.dataset.beanType);
            });
        });
    });

    document.querySelectorAll('.brewing-method-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const methodEl = document.getElementById('f-method');
            methodEl.value = chip.dataset.method;
            setBrewingMethodChip(chip.dataset.method);
        });
    });
    const methodEl = document.getElementById('f-method');
    if (methodEl) {
        methodEl.addEventListener('input', e => setBrewingMethodChip(e.target.value));
    }

    // Process method: chip row + free-text input two-way binding
    const processEl = document.getElementById('f-process');
    if (processEl) {
        processEl.addEventListener('input', e => setProcessChip(e.target.value));
    }

    // Item ordered (品鑑): chip row + free-text input two-way binding.
    // `input` highlights live within the active category; `change` (commit/blur,
    // incl. datalist pick) reconciles the category — a custom value clears the
    // category selection, an exact match re-activates the owning category.
    const itemEl = document.getElementById('f-item_ordered');
    if (itemEl) {
        itemEl.addEventListener('input', e => setItemChip(e.target.value));
        itemEl.addEventListener('change', e => applyItemValue(e.target.value));
    }

    // Import existing bean — one selector per mode
    ['cupping', 'tasting'].forEach(m => {
        const importSel = document.getElementById(`f-import-bean-${m}`);
        if (!importSel) return;
        importSel.addEventListener('change', async () => {
            const id = importSel.value;
            if (!id) return;
            // Keep the selected bean visible in the dropdown — resetting it back
            // to "— 不帶入 —" here made it look like nothing was imported.
            // Disable while importing so a rapid re-select can't start a second,
            // overlapping fetch that resolves out of order and leaves the form
            // showing a different bean than the dropdown.
            importSel.disabled = true;
            try {
                await applyImportedBean(m, id);
            } finally {
                importSel.disabled = false;
            }
        });
    });

    // Shop change → refresh import-bean selector for the current mode
    const shopSel = document.getElementById('f-shop');
    if (shopSel) {
        shopSel.addEventListener('change', () => {
            const mode = state.currentForm?.mode;
            if (mode) refreshImportBeanForShop(mode, shopSel.value);
        });
    }

    const defectsEl = document.getElementById('f-defects');
    const notesEl = document.getElementById('f-notes');
    if (defectsEl) defectsEl.addEventListener('input', updateDefectsSummary);
    if (notesEl) notesEl.addEventListener('input', updateDefectsSummary);

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

function setBrewingMethodChip(value) {
    document.querySelectorAll('.brewing-method-chip').forEach(c => {
        const sel = c.dataset.method === value;
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-pressed', String(sel));
    });
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
        const chipSpec = evaluationOptions[f.key];
        if (chipSpec) {
            Object.keys(chipSpec).forEach(subKey => {
                entry[subKey] = readChipGroup(`${f.key}_${subKey}`);
            });
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
        const chipSpec = observationOptions[f.key];
        if (chipSpec) {
            Object.keys(chipSpec).forEach(subKey => {
                entry[subKey] = readChipGroup(`${f.key}_${subKey}`);
            });
        }
        if (f.hasFlavorWheel) entry.flavors = getSelectedFlavorIds(`${f.key}_flavorList`);
        payload.observation[f.key] = entry;
    });
    return payload;
}

function buildFormPayload(mode) {
    const shopId = document.getElementById('f-shop').value || null;
    const defects = document.getElementById('f-defects').value;
    const defectsTags = readChipGroup('defects_tags') || [];
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
            roast: document.querySelector('input[name="roast"]:checked')?.value || null,
            grind: document.getElementById('f-grind').value || null,
            water_temp: document.getElementById('f-water_temp').value || null,
            ratio: document.getElementById('f-ratio').value || null,
            method: document.getElementById('f-method').value || null,
            extraction_time: document.getElementById('f-extraction_time').value || null,
            defects: defects || null,
            defects_tags: defectsTags,
            notes: notes || null,
            schema_version: 3,
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
        atmosphere_tags: getTagValues('atmosphere'),
        decor_tags:      getTagValues('decor'),
        service_tags:    getTagValues('service'),
        atmosphere_notes: document.getElementById('f-tag-atmosphere-notes')?.value || null,
        decor_notes:      document.getElementById('f-tag-decor-notes')?.value || null,
        service_notes:    document.getElementById('f-tag-service-notes')?.value || null,
        defects: defects || null,
        defects_tags: defectsTags,
        notes: notes || null,
        schema_version: 3,
        ...ev,
    };
}

async function submitForm() {
    if (!state.currentForm) return;
    const { mode, recordId } = state.currentForm;

    // Bean type must be validated first — bean-name inputs are now hidden
    // until a type is chosen, so focusing them before that would be confusing.
    if (!getBeanType(mode)) {
        const firstChip = document.querySelector(
            `.bean-type-chip-row[data-bean-type-group="${mode}"] .bean-type-chip`);
        firstChip?.focus();
        showToast('請選擇豆子類型（單品 / 配方豆）');
        return;
    }
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
    if (mode === 'tasting') {
        const itemEl = document.getElementById('f-item_ordered');
        if (!itemEl.value.trim()) {
            const selectedCat = document.querySelector('.item-cat-chip.selected');
            // 文字框已展開（其他）→ 聚焦文字框；已選分類 → 聚焦品項列；都沒選 → 聚焦分類列
            const focusTarget = !itemEl.classList.contains('d-none')
                ? itemEl
                : (selectedCat
                    ? document.querySelector('.item-chip-row .item-chip')
                    : document.querySelector('.item-cat-row .item-cat-chip'));
            focusTarget?.focus();
            showToast('請選擇或輸入點用品項');
            return;
        }
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
        refreshImportBeanForShop(mode, shopSel.value);

        // common fields
        document.getElementById('f-defects').value = r.defects || '';
        document.getElementById('f-notes').value = r.notes || '';
        if (r.notes) expandNotesSlot('f-notes', { focus: false });
        updateDefectsSummary();

        if (mode === 'cupping') {
            document.getElementById('f-cupping-bean').value = r.bean_name || '';
            ['origin', 'process', 'grind', 'water_temp', 'ratio', 'method', 'extraction_time', 'blend_composition']
                .forEach(k => {
                    const el = document.getElementById(`f-${k}`);
                    if (el && r[k] != null) el.value = r[k];
                });
            setBrewingMethodChip(r.method || '');
            setProcessChip(r.process || '');
            populateOriginDatalist();
            if (r.roast != null) {
                const roastRadio = document.querySelector(`input[name="roast"][value="${CSS.escape(r.roast)}"]`);
                if (roastRadio) roastRadio.checked = true;
            }
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
            applyItemValue(r.item_ordered || '');
            set('f-tasting-bean', r.bean_name || '');
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
                const chipSpec = evaluationOptions[f.key];
                if (chipSpec) {
                    Object.keys(chipSpec).forEach(subKey => {
                        writeChipGroup(`${f.key}_${subKey}`, data[subKey]);
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
                const chipSpec = observationOptions[f.key];
                if (chipSpec) {
                    Object.keys(chipSpec).forEach(subKey => {
                        writeChipGroup(`${f.key}_${subKey}`, data[subKey]);
                    });
                }
                if (f.hasFlavorWheel && Array.isArray(data.flavors)) {
                    applyFlavorSelections(`${f.key}_flavorList`, data.flavors);
                }
                updateObservationSummary(f.key);
            });
        }

        // Defects chip
        if (Array.isArray(r.defects_tags)) {
            writeChipGroup('defects_tags', r.defects_tags);
        }
        updateDefectsSummary();

        updateEstimatedTotalDisplay();
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
    const placeRow = node.querySelector('.sm-place-row');
    const placeSearchEl = node.querySelector('#sm-place-search');
    const placeSearchBtn = node.querySelector('#sm-place-search-btn');
    const placeResultsEl = node.querySelector('#sm-place-results');

    if (shop) {
        titleEl.textContent = '編輯店家';
        nameEl.value = shop.name || '';
        locEl.value  = shop.location || '';
        intEl.value  = shop.intro || '';
    }

    // Stashed Google place data, merged into payload on submit if present.
    let pendingPlace = null;

    if (isGoogleMapsReady() && placeRow) {
        placeRow.hidden = false;
        const runPlaceSearch = async () => {
            const query = placeSearchEl.value.trim();
            if (!query) {
                placeSearchEl.focus();
                return;
            }
            // Clear any previously-stashed selection so a new search doesn't carry
            // stale google_place_id/lat/lng into the save payload.
            pendingPlace = null;
            placeResultsEl.innerHTML = '<div class="empty-state small"><i class="bi bi-hourglass-split"></i>搜尋中…</div>';
            const g = await ensureGoogleMaps();
            if (!g) {
                placeResultsEl.innerHTML = '<div class="empty-state error small"><i class="bi bi-exclamation-triangle"></i>Google Maps 載入失敗</div>';
                return;
            }
            try {
                const { Place } = await g.maps.importLibrary('places');
                const { places } = await Place.searchByText({
                    textQuery: query,
                    fields: ['id', 'displayName', 'formattedAddress', 'location'],
                    maxResultCount: 5,
                });
                if (!places || places.length === 0) {
                    placeResultsEl.innerHTML = '<div class="empty-state small"><i class="bi bi-inbox"></i>找不到候選</div>';
                    return;
                }
                placeResultsEl.innerHTML = places.map((p, i) => `
                    <button type="button" class="bf-option sm-place-option" data-idx="${i}">
                        <div>
                            <div class="bf-option-name">${escapeHtml(p.displayName || '')}</div>
                            <div class="bf-option-addr">${escapeHtml(p.formattedAddress || '')}</div>
                        </div>
                    </button>
                `).join('');
                placeResultsEl.querySelectorAll('.sm-place-option').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = Number(btn.dataset.idx);
                        const place = places[idx];
                        if (!place) return;
                        if (place.displayName) nameEl.value = place.displayName;
                        if (place.formattedAddress) locEl.value = place.formattedAddress;
                        pendingPlace = {
                            google_place_id: place.id || null,
                            lat: place.location?.lat?.() ?? place.location?.lat ?? null,
                            lng: place.location?.lng?.() ?? place.location?.lng ?? null,
                        };
                        placeResultsEl.innerHTML = `<div class="empty-state small"><i class="bi bi-check-circle"></i>已套用：${escapeHtml(place.displayName || '')}</div>`;
                    });
                });
            } catch (err) {
                placeResultsEl.innerHTML = `<div class="empty-state error small"><i class="bi bi-exclamation-triangle"></i>搜尋失敗：${escapeHtml(err.message || String(err))}</div>`;
            }
        };
        placeSearchBtn.addEventListener('click', runPlaceSearch);
        placeSearchEl.addEventListener('keydown', e => {
            // Prevent Enter from submitting the parent form; trigger search instead.
            if (e.key === 'Enter') {
                e.preventDefault();
                runPlaceSearch();
            }
        });
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
        if (pendingPlace) {
            payload.google_place_id = pendingPlace.google_place_id;
            payload.lat = pendingPlace.lat;
            payload.lng = pendingPlace.lng;
            payload.google_data_fetched_at = new Date().toISOString();
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
                // details / message 會帶到具體 column 名稱（"...(google_place_id)=..." 或 "...(name)=..."）
                const hint = `${e2.details || ''} ${e2.message || ''}`;
                if (hint.includes('google_place_id')) {
                    alert('此 Google 地點已綁定到其他店家');
                } else {
                    alert('店家名稱已存在');
                }
            } else {
                alert('儲存失敗：' + (e2.message || e2));
            }
        }
    });

    setTimeout(() => nameEl.focus(), 0);
}

// ─── Google Places backfill dialog ──────────────────────────────────────────
async function openPlaceBackfillDialog(shop) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.innerHTML = `
        <div class="modal-shell" role="dialog" aria-modal="true">
            <header class="modal-header">
                <h3>Google 補完 — ${escapeHtml(shop.name)}</h3>
                <button type="button" class="modal-close" aria-label="關閉">
                    <i class="bi bi-x-lg"></i>
                </button>
            </header>
            <div class="modal-body">
                <div class="mb-2 text-muted small">以下是 Google Places 找到的候選，選一筆寫入此店家。</div>
                <div id="bf-results">
                    <div class="empty-state"><i class="bi bi-hourglass-split"></i>搜尋中…</div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline-secondary" data-action="cancel">取消</button>
                    <button type="button" class="btn btn-primary" id="bf-confirm" disabled>套用</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open-custom');

    const close = () => {
        backdrop.remove();
        document.body.classList.remove('modal-open-custom');
    };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', close);
    backdrop.addEventListener('click', e => {
        if (e.target === backdrop) close();
    });

    const resultsEl = backdrop.querySelector('#bf-results');
    const confirmBtn = backdrop.querySelector('#bf-confirm');
    let selected = null;

    const g = await ensureGoogleMaps();
    if (!g) {
        resultsEl.innerHTML = '<div class="empty-state error"><i class="bi bi-exclamation-triangle"></i>Google Maps 載入失敗，請檢查網路或 console 訊息</div>';
        return;
    }

    try {
        const { Place } = await g.maps.importLibrary('places');
        const query = `${shop.name} ${shop.location || ''}`.trim();
        const { places } = await Place.searchByText({
            textQuery: query,
            fields: ['id', 'displayName', 'formattedAddress', 'location'],
            maxResultCount: 5,
        });
        if (!places || places.length === 0) {
            resultsEl.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i>找不到候選</div>';
            return;
        }
        resultsEl.innerHTML = places.map((p, i) => `
            <label class="bf-option">
                <input type="radio" name="bf-pick" value="${i}">
                <div>
                    <div class="bf-option-name">${escapeHtml(p.displayName || '')}</div>
                    <div class="bf-option-addr">${escapeHtml(p.formattedAddress || '')}</div>
                </div>
            </label>
        `).join('');
        resultsEl.addEventListener('change', e => {
            const idx = Number(e.target.value);
            if (Number.isInteger(idx)) {
                selected = places[idx];
                confirmBtn.disabled = false;
            }
        });
    } catch (err) {
        resultsEl.innerHTML = `<div class="empty-state error">
            <i class="bi bi-exclamation-triangle"></i>搜尋失敗：${escapeHtml(err.message || String(err))}
        </div>`;
        return;
    }

    confirmBtn.addEventListener('click', async () => {
        if (!selected) return;
        confirmBtn.disabled = true;
        try {
            await api.updateShop(shop.id, {
                name: selected.displayName || shop.name,
                location: selected.formattedAddress || shop.location,
                google_place_id: selected.id || null,
                lat: selected.location?.lat?.() ?? selected.location?.lat ?? null,
                lng: selected.location?.lng?.() ?? selected.location?.lng ?? null,
                google_data_fetched_at: new Date().toISOString(),
            });
            showToast('✓ 已補完');
            await refreshShopsCache();
            close();
            renderRoute();
        } catch (err) {
            confirmBtn.disabled = false;
            if (err.code === '23505') {
                alert('此 Google 地點已綁定到其他店家');
            } else {
                alert('補完失敗：' + (err.message || err));
            }
        }
    });
}

// ─── View: shops list ───────────────────────────────────────────────────────
async function viewShopsList(root) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }
    root.innerHTML = `
        <div class="page-action-bar shops-action-bar">
            <input type="search" class="form-control shops-search-input" id="shops-search"
                   placeholder="搜尋店名、位置或介紹…" autocomplete="off">
            <button class="btn btn-primary" id="shops-new">
                <i class="bi bi-plus-lg me-1"></i>新增店家
            </button>
        </div>
        <div id="shops-grid" class="shops-grid">
            <div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>
        </div>`;

    // After creating a shop here, offer to add a record for it right away so
    // the user doesn't have to re-find the shop they just created.
    const onShopCreated = (saved) => {
        renderRoute();
        openNewRecordPicker(saved);
    };
    document.getElementById('shops-new')
        .addEventListener('click', () => openShopModal({ onSaved: onShopCreated }));

    const grid = document.getElementById('shops-grid');
    const renderGrid = (shops) => {
        if (shops.length === 0) {
            grid.innerHTML = `<div class="empty-state">
                <i class="bi bi-search"></i>沒有符合的店家
            </div>`;
            return;
        }
        grid.innerHTML = shops.map(s => `
            <a class="shop-card" href="#/shops/${s.id}">
                <div class="shop-card-header">
                    <i class="bi bi-shop"></i>
                    <span class="shop-card-name">${escapeHtml(s.name)}</span>
                    ${s.google_place_id ? '<i class="bi bi-geo-alt-fill shop-place-badge" title="已綁定 Google 地點" aria-label="已綁定 Google 地點"></i>' : ''}
                </div>
                ${s.location ? `<div class="shop-card-loc"><i class="bi bi-geo-alt"></i>${escapeHtml(s.location)}</div>` : ''}
                ${s.intro ? `<div class="shop-card-intro">${escapeHtml(s.intro)}</div>` : ''}
            </a>
        `).join('');
    };

    try {
        const shops = await api.listShops();
        state.shops = shops;
        state.shopsLoaded = true;
        if (shops.length === 0) {
            grid.innerHTML = `<div class="empty-state">
                <i class="bi bi-shop"></i>
                <p>還沒有店家</p>
                <button class="btn btn-primary btn-sm" id="shops-new-inline">
                    <i class="bi bi-plus-lg me-1"></i>新增第一個店家
                </button>
            </div>`;
            document.getElementById('shops-new-inline')
                .addEventListener('click', () => openShopModal({ onSaved: onShopCreated }));
            return;
        }
        renderGrid(shops);

        document.getElementById('shops-search').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            const filtered = q
                ? shops.filter(s =>
                    (s.name || '').toLowerCase().includes(q) ||
                    (s.location || '').toLowerCase().includes(q) ||
                    (s.intro || '').toLowerCase().includes(q))
                : shops;
            renderGrid(filtered);
        });
    } catch (e) {
        grid.innerHTML =
            `<div class="empty-state error"><i class="bi bi-exclamation-triangle"></i>讀取失敗：${escapeHtml(e.message || String(e))}</div>`;
    }
}

// ─── Dialog: pick record type for a shop ────────────────────────────────────
function openNewRecordPicker(shop) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop-custom';
    backdrop.innerHTML = `
        <div class="modal-shell" role="dialog" aria-modal="true" aria-labelledby="new-record-picker-title">
            <header class="modal-header">
                <h3 id="new-record-picker-title">新增記錄 — ${escapeHtml(shop.name)}</h3>
                <button type="button" class="modal-close" aria-label="關閉">
                    <i class="bi bi-x-lg"></i>
                </button>
            </header>
            <div class="modal-body">
                <p class="new-mode-picker-hint">請先選擇記錄類型，建立後無法變更。</p>
                ${newModePickerOptions(shop.id)}
            </div>
        </div>`;
    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open-custom');

    const close = () => {
        backdrop.remove();
        document.body.classList.remove('modal-open-custom');
    };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', e => {
        if (e.target === backdrop) close();
    });
    // Anchors navigate via the hash router; close the dialog so it doesn't linger.
    backdrop.querySelectorAll('.new-mode-picker-btn').forEach(btn =>
        btn.addEventListener('click', close));
}

// ─── View: shop detail ──────────────────────────────────────────────────────
function renderShopSummaryCard(summary) {
    if (summary.counts.total === 0) {
        return `
            <div class="card">
                <div class="card-body">
                    <h3 class="card-title"><i class="bi bi-bar-chart-line"></i>統計摘要</h3>
                    <div class="empty-state">
                        <i class="bi bi-cup-hot"></i>
                        <p>還沒有這家店的記錄</p>
                        <button class="btn btn-primary btn-sm" id="shop-summary-cta">新增第一筆品鑑</button>
                    </div>
                </div>
            </div>`;
    }

    const { counts, avgScore, highest, lowest, lastDate, topFlavors } = summary;

    const scoreLink = (entry, label) => {
        if (!entry) return '';
        const r = entry.record;
        return `<a class="shop-summary-record" href="#/${r._type}/${r.id}">
            <span class="shop-summary-record-label">${label}</span>
            <span class="shop-summary-record-title">${escapeHtml(deriveTitle(r))}</span>
            <span class="shop-summary-record-score">${entry.score.toFixed(1)}</span>
        </a>`;
    };

    const flavorChips = topFlavors
        .map(f => `<span class="detail-flavor-chip" style="--ft-color:${f.color}">${escapeHtml(f.name)} ×${f.count}</span>`)
        .join('');

    const recordsHtml = [scoreLink(highest, '最高'), scoreLink(lowest, '最低')].join('');

    return `
        <div class="card">
            <div class="card-body">
                <h3 class="card-title"><i class="bi bi-bar-chart-line"></i>統計摘要</h3>
                <div class="shop-summary-grid">
                    <div class="shop-summary-stat">
                        <span class="shop-summary-stat-num">${counts.total}</span>
                        <span class="shop-summary-stat-label">總記錄（杯測 ${counts.cupping} / 品鑑 ${counts.tasting}）</span>
                    </div>
                    <div class="shop-summary-stat">
                        <span class="shop-summary-stat-num">${avgScore != null ? avgScore.toFixed(1) : '—'}</span>
                        <span class="shop-summary-stat-label">平均 CoE 總分</span>
                    </div>
                    <div class="shop-summary-stat">
                        <span class="shop-summary-stat-num">${lastDate ? escapeHtml(fmtDate(lastDate)) : '—'}</span>
                        <span class="shop-summary-stat-label">最近一次</span>
                    </div>
                </div>
                ${recordsHtml ? `<div class="shop-summary-records">${recordsHtml}</div>` : ''}
                ${topFlavors.length ? `
                <div class="shop-summary-flavors">
                    <span class="shop-summary-sub-label"><i class="bi bi-tags"></i>常見風味</span>
                    <div class="detail-tag-row">${flavorChips}</div>
                </div>` : ''}
            </div>
        </div>`;
}

async function viewShopDetail(root, shopId) {
    if (!isCloudReady()) {
        root.innerHTML = renderCloudWarning();
        return;
    }
    root.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>讀取中…</div>';
    try {
        const [shop, allRecords] = await Promise.all([
            api.getShop(shopId),
            api.listRecords({ type: 'all' }),
        ]);
        const records = allRecords.filter(r => r.shop_id === shopId);
        if (!shop) {
            root.innerHTML = `<div class="card"><div class="card-body">
                <h3 class="card-title"><i class="bi bi-exclamation-circle"></i>找不到店家</h3>
                <a class="btn btn-primary" href="#/shops">回到店家列表</a>
            </div></div>`;
            return;
        }

        const mapsLink = shop.google_place_id
            ? `<a class="btn btn-outline-secondary btn-sm" target="_blank" rel="noopener noreferrer"
                  href="https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(shop.google_place_id)}">
                <i class="bi bi-geo-alt"></i>在 Google Maps 開啟
               </a>`
            : '';
        const backfillBtn = (!shop.google_place_id && isGoogleMapsReady())
            ? `<button class="btn btn-outline-secondary btn-sm" id="shop-backfill">
                <i class="bi bi-search"></i>Google 補完
               </button>`
            : '';

        root.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="shop-detail-header">
                        <h2 class="shop-detail-name"><i class="bi bi-shop"></i>${escapeHtml(shop.name)}${shop.google_place_id ? '<i class="bi bi-geo-alt-fill shop-place-badge" title="已綁定 Google 地點" aria-label="已綁定 Google 地點"></i>' : ''}</h2>
                        <div class="shop-detail-actions">
                            <button class="btn btn-primary btn-sm" id="shop-new-record">
                                <i class="bi bi-plus-lg"></i>新增記錄
                            </button>
                            ${mapsLink}
                            ${backfillBtn}
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

            ${renderShopSummaryCard(summarizeRecords(records))}

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

        document.getElementById('shop-new-record').addEventListener('click', () => {
            openNewRecordPicker(shop);
        });
        document.getElementById('shop-summary-cta')?.addEventListener('click', () =>
            openNewRecordPicker(shop));
        document.getElementById('shop-edit').addEventListener('click', () =>
            openShopModal({ shop }));
        const backfillEl = document.getElementById('shop-backfill');
        if (backfillEl) {
            backfillEl.addEventListener('click', () => openPlaceBackfillDialog(shop));
        }
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
