/* =============================================================================
   Coffee Review — CoE evaluation app
   ========================================================================== */

// ─── Supabase config ─────────────────────────────────────────────────────────
// 真正的 URL / anonKey 不放在這裡。本地開發請 cp config.example.js → config.js；
// GitHub Pages 由 .github/workflows/deploy.yml 用 secrets 自動產生 config.js。
const SUPABASE_CONFIG = Object.assign({
    url: '',
    anonKey: '',
    schema: 'coffee',
    table: 'coffee_records',
    visitTable: 'visit_records',
    bucket: 'bean-photos',
    visitBucket: 'visit-photos',
}, (typeof window !== 'undefined' && window.SUPABASE_CONFIG) || {});

// ─── Tier definitions — flat medal, professional naming ─────────────────────
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

// ─── Reference + observation fields ──────────────────────────────────────────
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

// ─── Flavor wheel data (with semantic colors) ────────────────────────────────
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

// ─── State ───────────────────────────────────────────────────────────────────
const coeState = { coeTotal: 82, selectedTierId: 'common' };
let supabaseClient = null;

// 'beans' = 自己沖煮（coffee_records）；'visit' = 店家探訪（visit_records）
let appMode = 'beans';

// Visit-mode photo staging: new File 物件待上傳 + 已存在 Storage 的路徑
const visitPhotos = [];
const visitPhotoPaths = [];

function currentTable() {
    return appMode === 'visit' ? SUPABASE_CONFIG.visitTable : SUPABASE_CONFIG.table;
}

function setAppMode(mode) {
    if (mode === appMode) return;
    appMode = mode;
    document.body.dataset.mode = mode;
    document.querySelectorAll('.mode-tab').forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active);
    });
    resetFormToDefaults();
    updateRecordList();
}

// ─── CoE Medal Card — render & interaction ───────────────────────────────────
function renderTierMedals() {
    const row = document.getElementById('medalRow');
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
    const tier = tierById(coeState.selectedTierId);
    document.getElementById('coeTotalDisplay').textContent = coeState.coeTotal.toFixed(1);
    const badge = document.getElementById('coeTotalTierBadge');
    badge.textContent = `[ ${tier.badgeName} ]`;
    badge.style.color = tier.color;
    document.getElementById('coeTotalDesc').textContent = tier.description;
}

// ─── Reference slider ────────────────────────────────────────────────────────
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
    return Array.from(
        document.querySelectorAll(`#${containerId} .flavor-tag.selected`)
    ).map(t => t.dataset.flavorName || t.innerText);
}

function getSelectedFlavorIds(containerId) {
    return Array.from(
        document.querySelectorAll(`#${containerId} .flavor-tag.selected`)
    ).map(t => t.dataset.flavorId);
}

// ─── Notes slot — collapsed by default, expand on demand ───────────────────
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

function collapseNotesSlot(textareaId) {
    const slot = document.querySelector(`[data-notes-slot="${textareaId}"]`);
    if (!slot) return;
    slot.classList.remove('is-open');
    slot.querySelector('.notes-toggle')?.setAttribute('aria-expanded', 'false');
    const body = slot.querySelector('.notes-body');
    if (body) body.hidden = true;
}

// ─── Accordion ──────────────────────────────────────────────────────────────
function wrapAccordionItem(key, label, icon, body) {
    const iconHtml = icon
        ? `<span class="eval-icon"><i class="bi ${icon}"></i></span>`
        : '';
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

function initializeEvaluationAccordion() {
    const accordion = document.getElementById('evaluationAccordion');
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
        // Initial slider fill + summary
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

// ─── Flavor wheel — progressive disclosure (indent-only, no ↳) ──────────────
const wheelState = new Map();

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
    }
    drawFlavorWheel(containerId);
}

function drawFlavorWheel(containerId) {
    const container = document.getElementById(containerId);
    const state = wheelState.get(containerId);
    if (!container || !state) return;
    container.innerHTML = '';

    const l1Row = document.createElement('div');
    l1Row.className = 'flavor-row flavor-row-l1';
    flavors.forEach(l1 => {
        const l1Id = `${containerId}__l1-${l1.id}`;
        const tag = makeTag({
            text: l1.name, id: l1Id, color: l1.color,
            selected: state.selected.has(l1Id),
            onClick: () => toggleFlavor(containerId, { level: 1, l1: l1.id, color: l1.color }),
        });
        tag.dataset.flavorName = l1.name;
        l1Row.appendChild(tag);
    });
    container.appendChild(l1Row);

    flavors.forEach(l1 => {
        const l1Id = `${containerId}__l1-${l1.id}`;
        const isL1Active = state.expandedL1.has(l1.id) || hasSelectedDescendant(containerId, l1);
        if (!isL1Active || !l1.sub || l1.sub.length === 0) return;

        const l2Row = document.createElement('div');
        l2Row.className = 'flavor-row flavor-row-l2';

        l1.sub.forEach(l2 => {
            if (typeof l2 === 'string') {
                const l2Id = `${l1Id}__l2-${l2.replace(/[/\s]/g, '')}`;
                const tag = makeTag({
                    text: l2, id: l2Id, color: l1.color,
                    selected: state.selected.has(l2Id),
                    onClick: () => toggleFlavor(containerId, { level: 2, l1: l1.id, l2: l2, color: l1.color, leaf: true, id: l2Id }),
                });
                tag.dataset.flavorName = l2;
                l2Row.appendChild(tag);
            } else {
                const l2Id = `${l1Id}__l2-${l2.id}`;
                const l2Color = l2.color || l1.color;
                const tag = makeTag({
                    text: l2.name, id: l2Id, color: l2Color,
                    selected: state.selected.has(l2Id),
                    onClick: () => toggleFlavor(containerId, { level: 2, l1: l1.id, l2: l2.id, color: l2Color }),
                });
                tag.dataset.flavorName = l2.name;
                l2Row.appendChild(tag);
            }
        });
        container.appendChild(l2Row);

        l1.sub.forEach(l2 => {
            if (typeof l2 === 'string' || !l2.sub) return;
            const l2KeyForExpand = `${l1.id}::${l2.id}`;
            const isL2Active = state.expandedL2.has(l2KeyForExpand) || hasSelectedDescendantL2(containerId, l1, l2);
            if (!isL2Active) return;

            const l2Id = `${l1Id}__l2-${l2.id}`;
            const l3Row = document.createElement('div');
            l3Row.className = 'flavor-row flavor-row-l3';

            l2.sub.forEach(l3 => {
                const l3Id = `${l2Id}__l3-${l3.replace(/[/\s]/g, '')}`;
                const tag = makeTag({
                    text: l3, id: l3Id, color: l2.color || l1.color,
                    selected: state.selected.has(l3Id),
                    onClick: () => toggleFlavor(containerId, { level: 3, l1: l1.id, l2: l2.id, l3: l3, color: l2.color || l1.color, id: l3Id }),
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
    const state = wheelState.get(containerId);
    if (!state) return;

    if (ev.level === 1) {
        const l1Id = `${containerId}__l1-${ev.l1}`;
        if (state.selected.has(l1Id)) {
            state.selected.delete(l1Id);
            state.expandedL1.delete(ev.l1);
            removeDescendantSelections(state, containerId, ev.l1);
        } else {
            state.selected.add(l1Id);
            state.expandedL1.add(ev.l1);
        }
    } else if (ev.level === 2) {
        const l2Id = ev.id || `${containerId}__l1-${ev.l1}__l2-${ev.l2}`;
        if (state.selected.has(l2Id)) {
            state.selected.delete(l2Id);
            if (!ev.leaf) {
                state.expandedL2.delete(`${ev.l1}::${ev.l2}`);
                removeDescendantSelectionsL2(state, containerId, ev.l1, ev.l2);
            }
        } else {
            state.selected.add(l2Id);
            if (!ev.leaf) state.expandedL2.add(`${ev.l1}::${ev.l2}`);
            state.selected.add(`${containerId}__l1-${ev.l1}`);
            state.expandedL1.add(ev.l1);
        }
    } else if (ev.level === 3) {
        const l3Id = ev.id;
        if (state.selected.has(l3Id)) {
            state.selected.delete(l3Id);
        } else {
            state.selected.add(l3Id);
            const l2Id = `${containerId}__l1-${ev.l1}__l2-${ev.l2}`;
            const l1Id = `${containerId}__l1-${ev.l1}`;
            state.selected.add(l2Id);
            state.selected.add(l1Id);
            state.expandedL1.add(ev.l1);
            state.expandedL2.add(`${ev.l1}::${ev.l2}`);
        }
    }

    drawFlavorWheel(containerId);
    if (state.callback) state.callback();
}

function hasSelectedDescendant(containerId, l1) {
    const state = wheelState.get(containerId);
    if (!state) return false;
    const prefix = `${containerId}__l1-${l1.id}__`;
    for (const id of state.selected) {
        if (id.startsWith(prefix)) return true;
    }
    return false;
}

function hasSelectedDescendantL2(containerId, l1, l2) {
    const state = wheelState.get(containerId);
    if (!state) return false;
    const prefix = `${containerId}__l1-${l1.id}__l2-${l2.id}__`;
    for (const id of state.selected) {
        if (id.startsWith(prefix)) return true;
    }
    return false;
}

function removeDescendantSelections(state, containerId, l1Slug) {
    const prefix = `${containerId}__l1-${l1Slug}__`;
    for (const id of [...state.selected]) {
        if (id.startsWith(prefix)) state.selected.delete(id);
    }
    for (const k of [...state.expandedL2]) {
        if (k.startsWith(`${l1Slug}::`)) state.expandedL2.delete(k);
    }
}

function removeDescendantSelectionsL2(state, containerId, l1Slug, l2Slug) {
    const prefix = `${containerId}__l1-${l1Slug}__l2-${l2Slug}__`;
    for (const id of [...state.selected]) {
        if (id.startsWith(prefix)) state.selected.delete(id);
    }
}

function applyFlavorSelections(containerId, ids) {
    const state = wheelState.get(containerId);
    if (!state) return;
    state.selected = new Set(ids || []);
    state.expandedL1 = new Set();
    state.expandedL2 = new Set();
    // Parse by splitting on the explicit markers so multi-underscore slugs
    // like `nutty_cocoa` / `stone_fruit` / `tropical_fruit` survive intact.
    for (const id of state.selected) {
        const rest = id.slice(containerId.length);
        const l1Start = rest.indexOf('__l1-');
        if (l1Start < 0) continue;
        const afterL1 = rest.slice(l1Start + '__l1-'.length);
        const l2Start = afterL1.indexOf('__l2-');
        const l1Slug = l2Start < 0 ? afterL1 : afterL1.slice(0, l2Start);
        state.expandedL1.add(l1Slug);
        if (l2Start >= 0) {
            const afterL2 = afterL1.slice(l2Start + '__l2-'.length);
            const l3Start = afterL2.indexOf('__l3-');
            const l2Slug = l3Start < 0 ? afterL2 : afterL2.slice(0, l3Start);
            state.expandedL2.add(`${l1Slug}::${l2Slug}`);
        }
    }
    drawFlavorWheel(containerId);
}

// ─── Photo OCR (Tesseract.js, lazy-loaded) ───────────────────────────────────
let tesseractPromise = null;
function loadTesseract() {
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => resolve(window.Tesseract);
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return tesseractPromise;
}

async function runOcr(file) {
    const preview = document.getElementById('ocrPreview');
    preview.classList.add('active');
    preview.textContent = '辨識中… (首次需下載辨識模型，約 3MB)';
    try {
        const Tess = await loadTesseract();
        const { data } = await Tess.recognize(file, 'chi_tra+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    preview.textContent = `辨識中… ${Math.round((m.progress || 0) * 100)}%`;
                }
            },
        });
        const text = (data.text || '').trim();
        if (!text) { preview.textContent = '辨識完成，但沒有讀到文字。'; return; }
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const candidate = lines.sort((a, b) => b.length - a.length)[0] || text;
        document.getElementById('name').value = candidate;
        preview.textContent = `已填入: ${candidate}（讀取全部: ${lines.length} 行，可在欄位中編輯）`;
    } catch (e) {
        console.error(e);
        preview.textContent = `辨識失敗: ${e.message || e}`;
    }
}

function handleOcrPick() {
    const fileInput = document.getElementById('ocrFile');
    fileInput.value = '';
    fileInput.click();
}

// ─── Supabase ────────────────────────────────────────────────────────────────
async function ensureSupabase() {
    if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) return null;
    if (supabaseClient) return supabaseClient;
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabaseClient = mod.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        db: { schema: SUPABASE_CONFIG.schema || 'public' },
    });
    return supabaseClient;
}

function isCloudReady() {
    return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

const NO_CLOUD_MSG = '尚未設定雲端。\n\n' +
    '本地開發：複製 config.example.js → config.js，填入 Supabase URL 與 publishable key。\n' +
    'GitHub Pages 部署：在 repo Settings → Secrets and variables → Actions 加入 ' +
    'SUPABASE_URL 與 SUPABASE_ANON_KEY，重新觸發部署。\n\n' +
    '完整步驟見 README。';

function warnNoCloud() { alert(NO_CLOUD_MSG); }

function showToast(msg, ms = 1800) {
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

// ─── Save / Load ─────────────────────────────────────────────────────────────
const BEANS_BASIC_FIELDS = ['name', 'origin', 'process', 'roast', 'grind', 'water_temp',
                            'ratio', 'method', 'extraction_time'];
const SHARED_BASIC_FIELDS = ['defects', 'notes'];
const BASIC_FIELDS = [...BEANS_BASIC_FIELDS, ...SHARED_BASIC_FIELDS];
const VISIT_BASIC_FIELDS = ['shop_name', 'shop_location', 'visit_date', 'item_ordered', 'price'];
const VISIT_NOTE_FIELDS = ['atmosphere_notes', 'decor_notes', 'service_notes'];

function buildEvaluationPayload() {
    const payload = {
        coe_total: coeState.coeTotal,
        coe_tier_id: coeState.selectedTierId,
        evaluations: {},
        observation: {},
    };
    SHARED_BASIC_FIELDS.forEach(id => { payload[id] = document.getElementById(id).value; });

    referenceFields.forEach(f => {
        const entry = {
            score: getReferenceScore(f.key),
            notes: document.getElementById(`${f.key}_notes`).value,
        };
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            entry[pk] = document.querySelector(`input[name="${f.key}_${pk}"]:checked`)?.value || '';
            entry[sk] = Array.from(document.querySelectorAll(`input[name="${f.key}_${sk}"]:checked`)).map(cb => cb.value);
        }
        if (f.hasFlavorWheel) {
            entry.flavors = getSelectedFlavorIds(`${f.key}_flavorList`);
        }
        payload.evaluations[f.key] = entry;
    });

    observationFields.forEach(f => {
        const entry = { notes: document.getElementById(`${f.key}_notes`).value };
        if (f.key === 'aroma') {
            entry.dryAroma = document.getElementById(`${f.key}_dryAroma`).value;
            entry.wetAroma = document.getElementById(`${f.key}_wetAroma`).value;
        }
        if (f.hasFlavorWheel) {
            entry.flavors = getSelectedFlavorIds(`${f.key}_flavorList`);
        }
        payload.observation[f.key] = entry;
    });

    return payload;
}

function buildBeansRecord() {
    const record = { schema_version: 3, ...buildEvaluationPayload() };
    BEANS_BASIC_FIELDS.forEach(id => { record[id] = document.getElementById(id).value; });
    record.shop_name = document.getElementById('source_shop_name').value.trim() || null;
    return record;
}

function buildVisitRecord() {
    const record = { schema_version: 1, ...buildEvaluationPayload() };
    VISIT_BASIC_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        let val = el.value;
        if (id === 'price') val = val === '' ? null : Number(val);
        else if (id === 'visit_date') val = val === '' ? null : val;
        record[id] = val;
    });
    VISIT_NOTE_FIELDS.forEach(id => { record[id] = document.getElementById(id).value; });
    record.photo_paths = [];
    return record;
}

function buildRecord() {
    return appMode === 'visit' ? buildVisitRecord() : buildBeansRecord();
}

async function saveRecord() {
    if (!isCloudReady()) {
        warnNoCloud();
        return;
    }
    const defaultName = appMode === 'visit'
        ? document.getElementById('shop_name').value
        : document.getElementById('name').value;
    const recordName = prompt('請為此記錄命名:', defaultName || '');
    if (!recordName) return;

    let uploadedPaths = [];
    try {
        const data = buildRecord();
        data.title = recordName;
        if (appMode === 'visit') {
            uploadedPaths = await uploadVisitPhotos();
            data.photo_paths = [...visitPhotoPaths, ...uploadedPaths];
        }
        // created_at 交給 Supabase 的 now() 預設值，避免使用者本機時鐘錯誤

        const sb = await ensureSupabase();
        const { error } = await sb.from(currentTable()).insert(data);
        if (error) {
            if (uploadedPaths.length) {
                await sb.storage.from(SUPABASE_CONFIG.visitBucket)
                    .remove(uploadedPaths).catch(() => {});
            }
            throw error;
        }

        if (appMode === 'visit' && uploadedPaths.length) {
            visitPhotoPaths.push(...uploadedPaths);
            visitPhotos.length = 0;
            renderVisitPhotoPreviews();
        }

        showToast(`✓ 已儲存到雲端 — ${recordName}`);
        updateRecordList();
        loadShopOptions();
    } catch (e) {
        alert('儲存失敗: ' + (e.message || e));
    }
}

async function loadShopOptions() {
    if (!isCloudReady()) return;
    try {
        const sb = await ensureSupabase();
        const [visitRes, beansRes] = await Promise.all([
            sb.from(SUPABASE_CONFIG.visitTable)
                .select('shop_name').not('shop_name', 'is', null),
            sb.from(SUPABASE_CONFIG.table)
                .select('shop_name').not('shop_name', 'is', null),
        ]);
        const names = new Set();
        (visitRes.data || []).forEach(r => r.shop_name && names.add(r.shop_name));
        (beansRes.data || []).forEach(r => r.shop_name && names.add(r.shop_name));
        const dl = document.getElementById('shopOptions');
        if (!dl) return;
        dl.innerHTML = [...names].sort().map(n => {
            const safe = n.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            return `<option value="${safe}"></option>`;
        }).join('');
    } catch (e) {
        console.warn('loadShopOptions failed:', e);
    }
}

function resetVisitFields() {
    VISIT_BASIC_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    VISIT_NOTE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    visitPhotos.length = 0;
    visitPhotoPaths.length = 0;
    const fileInput = document.getElementById('visitPhotoInput');
    if (fileInput) fileInput.value = '';
    renderVisitPhotoPreviews();
}

function resetFormToDefaults() {
    BASIC_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    collapseNotesSlot('notes');
    document.getElementById('ocrPreview').classList.remove('active');
    const srcShop = document.getElementById('source_shop_name');
    if (srcShop) srcShop.value = '';
    resetVisitFields();

    coeState.coeTotal = 82;
    coeState.selectedTierId = 'common';
    renderTierMedals();
    renderScoreChips(tierById('common'));
    refreshTotalDisplay();

    referenceFields.forEach(f => {
        setReferenceScore(f.key, 5);
        document.getElementById(`${f.key}_notes`).value = '';
        collapseNotesSlot(`${f.key}_notes`);
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            document.querySelectorAll(
                `input[name="${f.key}_${pk}"], input[name="${f.key}_${sk}"]`
            ).forEach(i => i.checked = false);
        }
        if (f.hasFlavorWheel) applyFlavorSelections(`${f.key}_flavorList`, []);
        updateRefSummary(f.key);
    });

    observationFields.forEach(f => {
        document.getElementById(`${f.key}_notes`).value = '';
        collapseNotesSlot(`${f.key}_notes`);
        if (f.key === 'aroma') {
            document.getElementById(`${f.key}_dryAroma`).value = '';
            document.getElementById(`${f.key}_wetAroma`).value = '';
        }
        if (f.hasFlavorWheel) applyFlavorSelections(`${f.key}_flavorList`, []);
        updateObservationSummary(f.key);
    });
}

function applyRecord(record) {
    BASIC_FIELDS.forEach(id => {
        if (record[id] != null) {
            const el = document.getElementById(id);
            if (el) el.value = record[id];
        }
    });
    if (document.getElementById('notes')?.value) {
        expandNotesSlot('notes', { focus: false });
    }

    if (appMode !== 'visit') {
        const srcShop = document.getElementById('source_shop_name');
        if (srcShop) srcShop.value = record.shop_name || '';
    }

    if (appMode === 'visit') {
        VISIT_BASIC_FIELDS.forEach(id => {
            if (record[id] != null) {
                const el = document.getElementById(id);
                if (el) el.value = record[id];
            }
        });
        VISIT_NOTE_FIELDS.forEach(id => {
            if (record[id] != null) {
                const el = document.getElementById(id);
                if (el) el.value = record[id];
            }
        });
        visitPhotoPaths.length = 0;
        visitPhotos.length = 0;
        (record.photo_paths || []).forEach(p => visitPhotoPaths.push(p));
        renderVisitPhotoPreviews();
    }

    coeState.coeTotal = typeof record.coe_total === 'number' ? record.coe_total : 82;
    coeState.selectedTierId = record.coe_tier_id || tierFromScore(coeState.coeTotal).id;
    renderTierMedals();
    renderScoreChips(tierById(coeState.selectedTierId));
    refreshTotalDisplay();

    if (record.evaluations) {
        referenceFields.forEach(f => {
            const data = record.evaluations[f.key];
            if (!data) return;
            if (typeof data.score === 'number') setReferenceScore(f.key, data.score);
            document.getElementById(`${f.key}_notes`).value = data.notes || '';
            if (data.notes) expandNotesSlot(`${f.key}_notes`, { focus: false });
            if (f.custom) {
                const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
                if (data[pk]) {
                    const radio = document.querySelector(`input[name="${f.key}_${pk}"][value="${data[pk]}"]`);
                    if (radio) radio.checked = true;
                }
                (data[sk] || []).forEach(v => {
                    const cb = document.querySelector(`input[name="${f.key}_${sk}"][value="${v}"]`);
                    if (cb) cb.checked = true;
                });
            }
            if (f.hasFlavorWheel && Array.isArray(data.flavors)) {
                applyFlavorSelections(`${f.key}_flavorList`, data.flavors);
            }
            updateRefSummary(f.key);
        });
    }

    if (record.observation) {
        observationFields.forEach(f => {
            const data = record.observation[f.key];
            if (!data) return;
            document.getElementById(`${f.key}_notes`).value = data.notes || '';
            if (data.notes) expandNotesSlot(`${f.key}_notes`, { focus: false });
            if (f.key === 'aroma') {
                document.getElementById(`${f.key}_dryAroma`).value = data.dryAroma || '';
                document.getElementById(`${f.key}_wetAroma`).value = data.wetAroma || '';
            }
            if (f.hasFlavorWheel && Array.isArray(data.flavors)) {
                applyFlavorSelections(`${f.key}_flavorList`, data.flavors);
            }
            updateObservationSummary(f.key);
        });
    }
}

async function loadRecord() {
    if (!isCloudReady()) {
        warnNoCloud();
        return;
    }
    const id = document.getElementById('recordList').value;
    if (!id) return;
    try {
        const sb = await ensureSupabase();
        const { data, error } = await sb.from(currentTable()).select('*').eq('id', id).single();
        if (error) throw error;
        resetFormToDefaults();
        applyRecord(data);
        showToast(`✓ 已讀取 — ${data.title}`);
    } catch (e) {
        alert('讀取失敗: ' + (e.message || e));
    }
}

async function deleteRecord() {
    if (!isCloudReady()) {
        warnNoCloud();
        return;
    }
    const sel = document.getElementById('recordList');
    const id = sel.value;
    if (!id) return;
    const title = sel.options[sel.selectedIndex]?.textContent || '';
    if (!confirm(`刪除 "${title}"？`)) return;
    try {
        const sb = await ensureSupabase();
        let photoPathsToCleanup = [];
        if (appMode === 'visit') {
            const { data, error: fetchErr } = await sb.from(currentTable())
                .select('photo_paths').eq('id', id).single();
            if (!fetchErr && Array.isArray(data?.photo_paths)) {
                photoPathsToCleanup = data.photo_paths;
            }
        }
        const { error } = await sb.from(currentTable()).delete().eq('id', id);
        if (error) throw error;
        if (photoPathsToCleanup.length) {
            await sb.storage.from(SUPABASE_CONFIG.visitBucket)
                .remove(photoPathsToCleanup)
                .catch(err => console.warn('orphan photo cleanup failed:', err));
        }
        showToast('✓ 已刪除');
        updateRecordList();
    } catch (e) {
        alert('刪除失敗: ' + (e.message || e));
    }
}

function refreshRecordActionButtons() {
    const sel = document.getElementById('recordList');
    const hasReal = !!sel.value;
    document.getElementById('loadBtn').disabled = !hasReal;
    document.getElementById('deleteBtn').disabled = !hasReal;
}

async function updateRecordList() {
    const sel = document.getElementById('recordList');
    sel.innerHTML = '';
    const placeholder = (text) => {
        const opt = document.createElement('option');
        opt.textContent = text;
        opt.disabled = true;
        opt.value = '';
        sel.appendChild(opt);
    };

    if (!isCloudReady()) {
        placeholder('— 尚未設定雲端 —');
        refreshRecordActionButtons();
        return;
    }
    try {
        const sb = await ensureSupabase();
        const { data, error } = await sb.from(currentTable())
            .select('id, title, created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
            placeholder('— 尚無記錄 —');
        } else {
            data.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                const ts = r.created_at ? new Date(r.created_at).toLocaleString('zh-TW', { hour12: false }) : '';
                opt.textContent = `${r.title || '(未命名)'} — ${ts}`;
                sel.appendChild(opt);
            });
        }
    } catch (e) {
        console.error(e);
        placeholder('— 載入失敗 —');
    }
    refreshRecordActionButtons();
}

// ─── Markdown export ─────────────────────────────────────────────────────────
function appendEvaluationMarkdown(lines, v) {
    const tier = tierById(coeState.selectedTierId);
    lines.push(`## CoE 總分: ${coeState.coeTotal.toFixed(1)} / 100  [ ${tier.badgeName} ] ${tier.name}`);
    lines.push(`> ${tier.description}`, '');

    lines.push('## 參考分（不計入總分）');
    lines.push('| 項目 | 分數 |', '|------|------|');
    referenceFields.forEach(f => {
        lines.push(`| ${f.label} | ${getReferenceScore(f.key).toFixed(1)} |`);
    });
    lines.push('');

    observationFields.forEach(f => {
        lines.push(`## ${f.label}（觀察）`);
        if (f.key === 'aroma') {
            const dry = v(`${f.key}_dryAroma`), wet = v(`${f.key}_wetAroma`);
            if (dry) lines.push(`* **乾香:** ${dry}`);
            if (wet) lines.push(`* **濕香:** ${wet}`);
        }
        if (f.hasFlavorWheel) {
            const sel = getSelectedFlavorNames(`${f.key}_flavorList`);
            if (sel.length) lines.push(`* **風味詞:** ${sel.join(', ')}`);
        }
        const note = v(`${f.key}_notes`);
        if (note) lines.push(`* **備註:** ${note}`);
        lines.push('');
    });

    const detailBlocks = [];
    referenceFields.forEach(f => {
        const note = v(`${f.key}_notes`);
        const details = [];
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            const pv = document.querySelector(`input[name="${f.key}_${pk}"]:checked`)?.value || '';
            const sv = Array.from(document.querySelectorAll(`input[name="${f.key}_${sk}"]:checked`)).map(cb => cb.value);
            if (pv) details.push(`* **${f.custom[pk].label}:** ${pv}`);
            if (sv.length) details.push(`* **${f.custom[sk].label}:** ${sv.join(', ')}`);
        }
        if (f.hasFlavorWheel) {
            const sel = getSelectedFlavorNames(`${f.key}_flavorList`);
            if (sel.length) details.push(`* **風味詞:** ${sel.join(', ')}`);
        }
        if (note) details.push(`* **備註:** ${note}`);
        if (details.length) detailBlocks.push(`### ${f.label}\n${details.join('\n')}`);
    });
    if (detailBlocks.length) lines.push('## 各項細節', '', detailBlocks.join('\n\n'), '');

    const defects = v('defects');
    if (defects) lines.push('## 瑕疵記錄', defects, '');
    const finalNotes = v('notes');
    if (finalNotes) lines.push('## 最終備註', finalNotes, '');
}

function generateBeansMarkdown() {
    const v = id => document.getElementById(id).value;
    const lines = [];

    lines.push(`# 咖啡杯測報告: ${v('name')}`, '');

    lines.push('## 基本資訊');
    lines.push(`* **產地:** ${v('origin')}`);
    lines.push(`* **處理法:** ${v('process')}`);
    lines.push(`* **烘焙度:** ${v('roast')}`);
    if (v('source_shop_name')) lines.push(`* **豆源:** ${v('source_shop_name')}`);
    lines.push('');

    lines.push('## 沖煮參數');
    lines.push(`* **研磨度:** ${v('grind')}`);
    lines.push(`* **水溫:** ${v('water_temp')}°C`);
    lines.push(`* **粉水比:** ${v('ratio')}`);
    lines.push(`* **沖煮方法:** ${v('method')}`);
    lines.push(`* **萃取時間:** ${v('extraction_time')}s`, '');

    appendEvaluationMarkdown(lines, v);
    document.getElementById('markdownOutput').textContent = lines.join('\n');
}

function generateVisitMarkdown() {
    const v = id => document.getElementById(id).value;
    const lines = [];

    lines.push(`# 店家探訪：${v('shop_name')}`, '');

    lines.push('## 店家資訊');
    if (v('shop_location')) lines.push(`* **位置:** ${v('shop_location')}`);
    if (v('visit_date')) lines.push(`* **日期:** ${v('visit_date')}`);
    if (v('item_ordered')) lines.push(`* **點用:** ${v('item_ordered')}`);
    if (v('price')) lines.push(`* **價格:** ${v('price')}`);
    lines.push('');

    const atmo = v('atmosphere_notes'), decor = v('decor_notes'), service = v('service_notes');
    if (atmo || decor || service) {
        lines.push('## 探訪心得');
        if (atmo) lines.push(`* **氛圍:** ${atmo}`);
        if (decor) lines.push(`* **裝潢:** ${decor}`);
        if (service) lines.push(`* **服務:** ${service}`);
        lines.push('');
    }

    appendEvaluationMarkdown(lines, v);
    document.getElementById('markdownOutput').textContent = lines.join('\n');
}

function generateMarkdown() {
    if (appMode === 'visit') generateVisitMarkdown();
    else generateBeansMarkdown();
}

function copyToClipboard() {
    const text = document.getElementById('markdownOutput').textContent;
    if (!text) { alert('請先點「生成 Markdown」'); return; }
    navigator.clipboard.writeText(text)
        .then(() => showToast('✓ Markdown 已複製'))
        .catch(() => alert('複製失敗'));
}

// ─── Visit photos — upload + preview ────────────────────────────────────────
async function uploadVisitPhotos() {
    if (visitPhotos.length === 0) return [];
    const sb = await ensureSupabase();
    const newPaths = [];
    for (const file of visitPhotos) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'jpg';
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
        const { error } = await sb.storage
            .from(SUPABASE_CONFIG.visitBucket)
            .upload(path, file, { contentType: file.type || undefined });
        if (error) {
            if (newPaths.length) {
                await sb.storage.from(SUPABASE_CONFIG.visitBucket)
                    .remove(newPaths).catch(() => {});
            }
            throw error;
        }
        newPaths.push(path);
    }
    return newPaths;
}

function visitPhotoUrl(path) {
    if (/^https?:\/\//.test(path)) return path;
    if (!supabaseClient) return '';
    return supabaseClient.storage
        .from(SUPABASE_CONFIG.visitBucket)
        .getPublicUrl(path).data.publicUrl;
}

function renderVisitPhotoPreviews() {
    const container = document.getElementById('visitPhotoPreviews');
    if (!container) return;

    container.querySelectorAll('.thumb[data-object-url]').forEach(t => {
        URL.revokeObjectURL(t.dataset.objectUrl);
    });
    container.replaceChildren();

    const appendThumb = ({ src, kind, idx, objectUrl }) => {
        const div = document.createElement('div');
        div.className = 'thumb';
        if (objectUrl) div.dataset.objectUrl = objectUrl;
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb-remove';
        btn.dataset.kind = kind;
        btn.dataset.idx = String(idx);
        btn.setAttribute('aria-label', '移除照片');
        btn.textContent = '✕';
        div.append(img, btn);
        container.append(div);
    };

    visitPhotoPaths.forEach((path, i) => appendThumb({
        src: visitPhotoUrl(path), kind: 'stored', idx: i,
    }));
    visitPhotos.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        appendThumb({ src: url, kind: 'pending', idx: i, objectUrl: url });
    });
}

// ─── Init ────────────────────────────────────────────────────────────────────
function bindStaticListeners() {
    document.getElementById('loadBtn').addEventListener('click', loadRecord);
    document.getElementById('deleteBtn').addEventListener('click', deleteRecord);
    document.getElementById('saveBtn').addEventListener('click', saveRecord);
    document.getElementById('generateBtn').addEventListener('click', generateMarkdown);
    document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
    document.getElementById('ocrBtn').addEventListener('click', handleOcrPick);
    document.getElementById('ocrFile').addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (f) runOcr(f);
    });
    document.getElementById('recordList').addEventListener('change', refreshRecordActionButtons);

    document.body.addEventListener('click', e => {
        const toggle = e.target.closest('.notes-toggle');
        if (!toggle) return;
        expandNotesSlot(toggle.dataset.notesTarget);
    });

    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => setAppMode(btn.dataset.mode));
    });

    const photoInput = document.getElementById('visitPhotoInput');
    if (photoInput) {
        photoInput.addEventListener('change', e => {
            for (const f of e.target.files) visitPhotos.push(f);
            e.target.value = '';
            renderVisitPhotoPreviews();
        });
    }
    const photoContainer = document.getElementById('visitPhotoPreviews');
    if (photoContainer) {
        photoContainer.addEventListener('click', e => {
            const btn = e.target.closest('.thumb-remove');
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (btn.dataset.kind === 'pending') visitPhotos.splice(idx, 1);
            else if (btn.dataset.kind === 'stored') visitPhotoPaths.splice(idx, 1);
            renderVisitPhotoPreviews();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderTierMedals();
    renderScoreChips(tierById(coeState.selectedTierId));
    refreshTotalDisplay();
    initializeEvaluationAccordion();
    bindStaticListeners();
    updateRecordList();
    loadShopOptions();
});
