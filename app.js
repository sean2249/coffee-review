/* =============================================================================
   Coffee Review — CoE evaluation app
   ========================================================================== */

// ─── Tiers ───────────────────────────────────────────────────────────────────
// `min`/`max` are the actual selectable bounds. Non-godly tiers include a .5
// ceiling (76.5, 79.5, 82.5, 85.5, 88.5, 91.5) so the user can express
// "almost into the next tier".
const totalScoreTiers = [
    { id: 'trash',      name: '垃圾咖啡',             label: '≤76',   min: 74, max: 76.5,
      color: '#6c757d', gradient: 'linear-gradient(135deg, #adb5bd, #495057)' },
    { id: 'commercial', name: '商業咖啡',             label: '77-79', min: 77, max: 79.5,
      color: '#8b5a2b', gradient: 'linear-gradient(135deg, #c69066, #7a4f33)' },
    { id: 'common',     name: '一般精品',             label: '80-82', min: 80, max: 82.5,
      color: '#d6a700', gradient: 'linear-gradient(135deg, #f5c75a, #c98e1f)',
      nameFull: '一般精品（便利商店等級）' },
    { id: 'like',       name: '平常喜歡的精品',       label: '83-85', min: 83, max: 85.5,
      color: '#198754', gradient: 'linear-gradient(135deg, #4fb073, #1d7c43)' },
    { id: 'recommend',  name: '會推薦給朋友的精品',   label: '86-88', min: 86, max: 88.5,
      color: '#20c997', gradient: 'linear-gradient(135deg, #3dcfa2, #178d6c)' },
    { id: 'amazing',    name: '覺得超級驚艷',         label: '89-91', min: 89, max: 91.5,
      color: '#0d6efd', gradient: 'linear-gradient(135deg, #6aa1ee, #1f4fa8)',
      nameFull: '覺得超級驚艷，想重複喝的' },
    { id: 'godly',      name: '神級',                 label: '≥92',   min: 92, max: 96,
      color: '#6f42c1', gradient: 'linear-gradient(135deg, #b48be4, #5a2ea0)' },
];

function tierFromScore(score) {
    return totalScoreTiers.find(t => score >= t.min && score <= t.max)
        || totalScoreTiers[2];
}
function tierById(id) {
    return totalScoreTiers.find(t => t.id === id) || totalScoreTiers[2];
}
function tierFullName(tier) {
    return tier.nameFull || tier.name;
}
function scoresInTier(tier) {
    const list = [];
    for (let s = tier.min; s <= tier.max + 1e-9; s += 0.5) {
        list.push(Math.round(s * 10) / 10);
    }
    return list;
}

// ─── Reference / observation field definitions ───────────────────────────────
const mouthfeelOptions = {
    weight: {
        label: '重量級別',
        options: ['輕盈如茶', '圓潤順口', '醇厚飽滿'],
    },
    texture: {
        label: '質地描述',
        options: ['絲滑感', '奶油感', '絨布感', '糖漿感', '多汁感',
                  '清脆感', '乾澀感', '氣泡感', '顆粒感'],
    },
};

const aftertasteOptions = {
    length: {
        label: '尾韻長度',
        options: ['短暫', '中等', '悠長', '綿延'],
    },
    quality: {
        label: '尾韻質地',
        options: ['乾淨', '粗糙 / 乾澀', '富有變化'],
    },
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

// ─── Flavor wheel data + semantic colors ─────────────────────────────────────
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
    { id: 'spice',   name: '香料類', color: '#c1530c', sub: ['肉桂', '丁香', '胡椒', '薑', '八角'] },
    { id: 'herbal',  name: '草本類', color: '#2f9e44', sub: ['薄荷', '羅勒', '茶感', '青草', '香草'] },
    { id: 'roast',   name: '焙烤',   color: '#495057', sub: ['穀物味', '焦味', '菸草味'] },
    { id: 'other',   name: '其他',   color: '#868e96', sub: ['化合物', '霉味 / 土味', '紙味'] },
];

// ─── State ───────────────────────────────────────────────────────────────────
const coeState = {
    coeTotal: 82,
    selectedTierId: 'common',
};

// ─── CoE total card — render & interaction ───────────────────────────────────
function renderTierChips() {
    const row = document.getElementById('tierChipRow');
    row.innerHTML = '';
    totalScoreTiers.forEach(t => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tier-chip' + (t.id === coeState.selectedTierId ? ' selected' : '');
        chip.style.setProperty('--tier-color', t.color);
        chip.style.setProperty('--tier-gradient', t.gradient);
        chip.dataset.tierId = t.id;
        chip.setAttribute('aria-pressed', t.id === coeState.selectedTierId);
        chip.innerHTML =
            `<span class="tier-name">${t.name}</span>` +
            `<span class="tier-label">${t.label}</span>`;
        chip.addEventListener('click', () => selectTier(t.id));
        row.appendChild(chip);
    });
}

function renderScoreChips(tier) {
    const row = document.getElementById('scoreChipRow');
    row.innerHTML = '';
    row.style.setProperty('--tier-color', tier.color);
    row.style.setProperty('--tier-gradient', tier.gradient);
    scoresInTier(tier).forEach(s => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'score-chip' + (Math.abs(s - coeState.coeTotal) < 1e-6 ? ' selected' : '');
        chip.dataset.score = s;
        chip.setAttribute('aria-pressed', Math.abs(s - coeState.coeTotal) < 1e-6);
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
    renderTierChips();
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
    const nameEl = document.getElementById('coeTotalTierName');
    nameEl.textContent = `— ${tierFullName(tier)}`;
    nameEl.style.color = tier.color;
}

// ─── Reference slider ────────────────────────────────────────────────────────
function refScoreBand(v) {
    if (v <= 4.5) return 'low';
    if (v <= 5.5) return 'mid';
    if (v <= 6.5) return 'good';
    if (v <= 7.5) return 'great';
    return 'top';
}

function onRefScoreInput(key) {
    const slider = document.getElementById(`${key}_score`);
    const valueEl = document.getElementById(`${key}_score_value`);
    const v = parseFloat(slider.value);
    valueEl.textContent = v.toFixed(1);
    valueEl.dataset.band = refScoreBand(v);
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
        const sv = Array.from(document.querySelectorAll(`input[name="${key}_${sk}"]:checked`))
            .map(cb => cb.value);
        const summary = [pv, ...sv].filter(Boolean).join(', ');
        if (summary) parts.push(summary);
    }

    if (field.hasFlavorWheel) {
        const selected = Array.from(
            document.querySelectorAll(`#${key}_flavorList .flavor-tag.selected`)
        ).map(t => t.innerText);
        if (selected.length > 0) {
            const preview = selected.slice(0, 2).join(', ')
                + (selected.length > 2 ? `…(+${selected.length - 2})` : '');
            parts.push(preview);
        }
    }

    summaryEl.textContent = parts.join(' | ');
}

function updateObservationSummary(key) {
    const summaryEl = document.getElementById(`${key}_summary`);
    if (!summaryEl) return;
    const selected = Array.from(
        document.querySelectorAll(`#${key}_flavorList .flavor-tag.selected`)
    ).map(t => t.innerText);
    summaryEl.textContent = selected.length === 0
        ? ''
        : selected.slice(0, 3).join(', ')
            + (selected.length > 3 ? `…(+${selected.length - 3})` : '');
}

// ─── Accordion item generation ───────────────────────────────────────────────
function wrapAccordionItem(key, label, icon, body) {
    const iconHtml = icon
        ? `<span class="eval-icon"><i class="bi ${icon}"></i></span>`
        : '';
    return `<div class="accordion-item">
        <h2 class="accordion-header" id="heading_${key}">
            <button class="accordion-button collapsed" type="button"
                    data-bs-toggle="collapse" data-bs-target="#collapse_${key}"
                    aria-expanded="false" aria-controls="collapse_${key}">
                ${iconHtml}
                <span>${label}</span>
                <span id="${key}_summary" class="eval-summary"></span>
            </button>
        </h2>
        <div id="collapse_${key}" class="accordion-collapse collapse"
             aria-labelledby="heading_${key}" data-bs-parent="#evaluationAccordion">
            <div class="accordion-body">${body}</div>
        </div>
    </div>`;
}

function generateReferenceItem(field) {
    const key = field.key;
    let body = `
        <div class="mb-3">
            <label class="form-label">參考分 (4 - 8):</label>
            <div class="ref-slider-group">
                <input type="range" class="form-range" id="${key}_score"
                       min="4" max="8" step="0.5" value="5"
                       data-ref-score="${key}">
                <span class="ref-slider-value" id="${key}_score_value" data-band="mid">5.0</span>
            </div>
            <div class="small-hint">此分數僅作各面向參考印象，不影響上方 CoE 總分。</div>
        </div>`;

    if (field.custom) {
        const opts = field.custom;
        const pk = Object.keys(opts)[0], sk = Object.keys(opts)[1];
        const primary = opts[pk], secondary = opts[sk];

        body += `<hr><h6 class="mb-3 text-secondary">${primary.label}</h6>`;
        primary.options.forEach(opt => {
            body += `<div class="form-check form-check-inline">
                <input class="form-check-input" type="radio"
                       name="${key}_${pk}" id="${key}_${pk}_${opt}" value="${opt}"
                       data-ref-key="${key}">
                <label class="form-check-label" for="${key}_${pk}_${opt}">${opt}</label>
            </div>`;
        });
        body += `<h6 class="mt-3 mb-3 text-secondary">${secondary.label}</h6>`;
        secondary.options.forEach(opt => {
            body += `<div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox"
                       name="${key}_${sk}" id="${key}_${sk}_${opt}" value="${opt}"
                       data-ref-key="${key}">
                <label class="form-check-label" for="${key}_${sk}_${opt}">${opt}</label>
            </div>`;
        });
    }

    if (field.hasFlavorWheel) {
        body += `<label class="form-label mt-4">風味詞（風味輪）:</label>
            <div class="table-responsive"><div id="${key}_flavorList" class="mt-2"></div></div>`;
    }

    body += `<label class="form-label mt-4">備註:</label>
        <textarea id="${key}_notes" class="form-control"></textarea>`;

    return wrapAccordionItem(key, field.label, field.icon, body);
}

function generateObservationItem(field) {
    const key = field.key;
    let body = `
        <div class="small-hint mb-3">香氣為觀察項，不計分。請記錄你聞到的乾香與濕香印象。</div>
        <label class="form-label">乾香 (Dry Aroma):</label>
        <textarea id="${key}_dryAroma" class="form-control mb-3" rows="2"></textarea>
        <label class="form-label">濕香 (Wet Aroma):</label>
        <textarea id="${key}_wetAroma" class="form-control mb-3" rows="2"></textarea>`;

    if (field.hasFlavorWheel) {
        body += `<label class="form-label mt-2">風味詞（風味輪）:</label>
            <div class="table-responsive"><div id="${key}_flavorList" class="mt-2"></div></div>`;
    }

    body += `<label class="form-label mt-4">備註:</label>
        <textarea id="${key}_notes" class="form-control"></textarea>`;

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
            generateFlavorList(`${f.key}_flavorList`, () => updateObservationSummary(f.key));
        }
    });
    referenceFields.forEach(f => {
        if (f.hasFlavorWheel) {
            generateFlavorList(`${f.key}_flavorList`, () => updateRefSummary(f.key));
        }
        updateRefSummary(f.key);
    });

    // Event delegation for slider input + radio/checkbox change inside accordion
    accordion.addEventListener('input', (e) => {
        const key = e.target.dataset.refScore;
        if (key) onRefScoreInput(key);
    });
    accordion.addEventListener('change', (e) => {
        const key = e.target.dataset.refKey;
        if (key) updateRefSummary(key);
    });
}

// ─── Flavor wheel ────────────────────────────────────────────────────────────
function setFlavorTagColor(tag, color) {
    tag.style.setProperty('--ft-color', color);
    const rgb = hexToRgb(color);
    if (rgb) tag.style.setProperty('--ft-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`);
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function createFlavorTag(name, id, color, parentId = null, isL3 = false) {
    const tag = document.createElement('span');
    tag.className = 'flavor-tag';
    tag.id = id;
    tag.innerText = name;
    setFlavorTagColor(tag, color);
    if (isL3) tag.dataset.parentL2 = parentId;
    else if (parentId) tag.dataset.parentL1 = parentId;
    return tag;
}

function generateFlavorList(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'table table-bordered flavor-table';
    table.innerHTML = '<thead><tr><th>主要風味</th><th>次要風味</th><th>詳細風味</th></tr></thead>';
    const tbody = table.createTBody();

    flavors.forEach(l1 => {
        const l1Id = `${containerId}__l1-${l1.id}`;
        const l1Color = l1.color;
        if (!l1.sub || l1.sub.length === 0) {
            const row = tbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 3;
            cell.appendChild(createFlavorTag(l1.name, l1Id, l1Color));
        } else {
            l1.sub.forEach((l2, i) => {
                const row = tbody.insertRow();
                if (i === 0) {
                    const cell = row.insertCell();
                    cell.rowSpan = l1.sub.length;
                    cell.appendChild(createFlavorTag(l1.name, l1Id, l1Color));
                }
                const l2Cell = row.insertCell();
                const l3Cell = row.insertCell();
                if (typeof l2 === 'string') {
                    const l2Id = `${l1Id}__l2-${l2.replace(/[\/\s]/g, '')}`;
                    l2Cell.appendChild(createFlavorTag(l2, l2Id, l1Color, l1Id));
                } else {
                    const l2Id = `${l1Id}__l2-${l2.id}`;
                    const l2Color = l2.color || l1Color;
                    l2Cell.appendChild(createFlavorTag(l2.name, l2Id, l2Color, l1Id));
                    if (l2.sub && l2.sub.length > 0) {
                        l2.sub.forEach(l3 => {
                            const l3Id = `${l2Id}__l3-${l3.replace(/[\/\s]/g, '')}`;
                            l3Cell.appendChild(createFlavorTag(l3, l3Id, l2Color, l2Id, true));
                        });
                    }
                }
            });
        }
    });

    const wrap = document.createElement('div');
    wrap.className = 'table-responsive';
    wrap.appendChild(table);
    container.appendChild(wrap);

    container.querySelectorAll('.flavor-tag').forEach(tag => {
        tag.addEventListener('click', function () {
            this.classList.toggle('selected');
            handleFlavorTagToggle(this, container);
            if (typeof onChange === 'function') onChange();
        });
    });
}

function handleFlavorTagToggle(tag, container) {
    const l1ParentId = tag.dataset.parentL1;
    const l2ParentId = tag.dataset.parentL2;

    if (l2ParentId) {
        const l2Tag = document.getElementById(l2ParentId);
        const l1Tag = l2Tag ? document.getElementById(l2Tag.dataset.parentL1) : null;
        updateParentState(l2Tag, `.flavor-tag[data-parent-l2="${l2ParentId}"]`);
        if (l1Tag) updateParentState(l1Tag, `.flavor-tag[data-parent-l1="${l1Tag.id}"]`);
    } else if (l1ParentId) {
        const l1Tag = document.getElementById(l1ParentId);
        updateParentState(l1Tag, `.flavor-tag[data-parent-l1="${l1ParentId}"]`);
        if (!tag.classList.contains('selected')) {
            container.querySelectorAll(`.flavor-tag[data-parent-l2="${tag.id}"]`)
                .forEach(c => c.classList.remove('selected'));
        }
    } else {
        // L1 deselected: cascade
        if (!tag.classList.contains('selected')) {
            container.querySelectorAll(`.flavor-tag[data-parent-l1="${tag.id}"]`)
                .forEach(c => {
                    c.classList.remove('selected');
                    container.querySelectorAll(`.flavor-tag[data-parent-l2="${c.id}"]`)
                        .forEach(cc => cc.classList.remove('selected'));
                });
        }
    }
}

function updateParentState(parentTag, childSelector) {
    if (!parentTag) return;
    const siblings = parentTag.closest('table').querySelectorAll(childSelector);
    parentTag.classList.toggle('selected',
        Array.from(siblings).some(t => t.classList.contains('selected')));
}

// ─── Save / Load (localStorage) ──────────────────────────────────────────────
const BASIC_FIELDS = ['name', 'origin', 'process', 'roast', 'grind', 'water_temp',
                      'ratio', 'method', 'extraction_time', 'defects', 'notes'];

function saveRecord() {
    const recordName = prompt('請為此記錄命名:');
    if (!recordName) return;

    const record = {
        schemaVersion: 2,
        coeTotal: coeState.coeTotal,
        coeTierId: coeState.selectedTierId,
        evaluations: {},
        observation: {},
    };

    BASIC_FIELDS.forEach(id => { record[id] = document.getElementById(id).value; });

    referenceFields.forEach(f => {
        const entry = {
            score: getReferenceScore(f.key),
            notes: document.getElementById(`${f.key}_notes`).value,
        };
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            entry[pk] = document.querySelector(`input[name="${f.key}_${pk}"]:checked`)?.value || '';
            entry[sk] = Array.from(document.querySelectorAll(`input[name="${f.key}_${sk}"]:checked`))
                .map(cb => cb.value);
        }
        if (f.hasFlavorWheel) {
            entry.flavors = Array.from(
                document.querySelectorAll(`#${f.key}_flavorList .flavor-tag.selected`)
            ).map(tag => tag.id);
        }
        record.evaluations[f.key] = entry;
    });

    observationFields.forEach(f => {
        const entry = { notes: document.getElementById(`${f.key}_notes`).value };
        if (f.key === 'aroma') {
            entry.dryAroma = document.getElementById(`${f.key}_dryAroma`).value;
            entry.wetAroma = document.getElementById(`${f.key}_wetAroma`).value;
        }
        if (f.hasFlavorWheel) {
            entry.flavors = Array.from(
                document.querySelectorAll(`#${f.key}_flavorList .flavor-tag.selected`)
            ).map(tag => tag.id);
        }
        record.observation[f.key] = entry;
    });

    localStorage.setItem(`coffee_record_${recordName}`, JSON.stringify(record));
    alert(`記錄 "${recordName}" 已儲存`);
    updateRecordList();
}

function resetFormToDefaults() {
    BASIC_FIELDS.forEach(id => { document.getElementById(id).value = ''; });

    coeState.coeTotal = 82;
    coeState.selectedTierId = 'common';
    renderTierChips();
    renderScoreChips(tierById('common'));
    refreshTotalDisplay();

    referenceFields.forEach(f => {
        setReferenceScore(f.key, 5);
        document.getElementById(`${f.key}_notes`).value = '';
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            document.querySelectorAll(
                `input[name="${f.key}_${pk}"], input[name="${f.key}_${sk}"]`
            ).forEach(i => i.checked = false);
        }
        if (f.hasFlavorWheel) {
            document.querySelectorAll(`#${f.key}_flavorList .flavor-tag.selected`)
                .forEach(t => t.classList.remove('selected'));
        }
        updateRefSummary(f.key);
    });

    observationFields.forEach(f => {
        document.getElementById(`${f.key}_notes`).value = '';
        if (f.key === 'aroma') {
            document.getElementById(`${f.key}_dryAroma`).value = '';
            document.getElementById(`${f.key}_wetAroma`).value = '';
        }
        if (f.hasFlavorWheel) {
            document.querySelectorAll(`#${f.key}_flavorList .flavor-tag.selected`)
                .forEach(t => t.classList.remove('selected'));
        }
        updateObservationSummary(f.key);
    });
}

function loadRecord() {
    const recordKey = document.getElementById('recordList').value;
    if (!recordKey) return;
    const record = JSON.parse(localStorage.getItem(recordKey));
    if (!record) return;

    resetFormToDefaults();

    BASIC_FIELDS.forEach(id => {
        if (record[id] != null) document.getElementById(id).value = record[id];
    });

    if (record.schemaVersion !== 2) {
        alert('此為舊格式記錄，僅還原文字欄位；分數請重評。');
        return;
    }

    coeState.coeTotal = typeof record.coeTotal === 'number' ? record.coeTotal : 82;
    coeState.selectedTierId = record.coeTierId || tierFromScore(coeState.coeTotal).id;
    renderTierChips();
    renderScoreChips(tierById(coeState.selectedTierId));
    refreshTotalDisplay();

    if (record.evaluations) {
        referenceFields.forEach(f => {
            const data = record.evaluations[f.key];
            if (!data) return;
            if (typeof data.score === 'number') setReferenceScore(f.key, data.score);
            document.getElementById(`${f.key}_notes`).value = data.notes || '';
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
                data.flavors.forEach(id => {
                    const tag = document.getElementById(id);
                    if (tag) tag.classList.add('selected');
                });
            }
            updateRefSummary(f.key);
        });
    }

    if (record.observation) {
        observationFields.forEach(f => {
            const data = record.observation[f.key];
            if (!data) return;
            document.getElementById(`${f.key}_notes`).value = data.notes || '';
            if (f.key === 'aroma') {
                document.getElementById(`${f.key}_dryAroma`).value = data.dryAroma || '';
                document.getElementById(`${f.key}_wetAroma`).value = data.wetAroma || '';
            }
            if (f.hasFlavorWheel && Array.isArray(data.flavors)) {
                data.flavors.forEach(id => {
                    const tag = document.getElementById(id);
                    if (tag) tag.classList.add('selected');
                });
            }
            updateObservationSummary(f.key);
        });
    }

    alert('記錄已讀取');
}

function deleteRecord() {
    const recordList = document.getElementById('recordList');
    const recordKey = recordList.value;
    if (!recordKey) return;
    if (confirm(`確定要刪除記錄 "${recordKey.replace('coffee_record_', '')}" 嗎？`)) {
        localStorage.removeItem(recordKey);
        updateRecordList();
        alert('記錄已刪除');
    }
}

function updateRecordList() {
    const recordList = document.getElementById('recordList');
    recordList.innerHTML = '';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('coffee_record_')) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key.replace('coffee_record_', '');
            recordList.appendChild(opt);
        }
    }
}

// ─── Markdown export ─────────────────────────────────────────────────────────
function generateMarkdown() {
    const v = id => document.getElementById(id).value;
    const tier = tierById(coeState.selectedTierId);
    const lines = [];

    lines.push(`# 咖啡杯測報告: ${v('name')}`, '');

    lines.push('## 基本資訊');
    lines.push(`* **產地:** ${v('origin')}`);
    lines.push(`* **處理法:** ${v('process')}`);
    lines.push(`* **烘焙度:** ${v('roast')}`, '');

    lines.push('## 沖煮參數');
    lines.push(`* **研磨度:** ${v('grind')}`);
    lines.push(`* **水溫:** ${v('water_temp')}°C`);
    lines.push(`* **粉水比:** ${v('ratio')}`);
    lines.push(`* **沖煮方法:** ${v('method')}`);
    lines.push(`* **萃取時間:** ${v('extraction_time')}s`, '');

    lines.push(`## CoE 總分: ${coeState.coeTotal.toFixed(1)} / 100 — ${tierFullName(tier)}`, '');

    lines.push('## 參考分（不計入總分）');
    lines.push('| 項目 | 分數 |', '|------|------|');
    referenceFields.forEach(f => {
        lines.push(`| ${f.label} | ${getReferenceScore(f.key).toFixed(1)} |`);
    });
    lines.push('');

    // Observation (Aroma)
    observationFields.forEach(f => {
        lines.push(`## ${f.label}（觀察）`);
        if (f.key === 'aroma') {
            const dry = v(`${f.key}_dryAroma`), wet = v(`${f.key}_wetAroma`);
            if (dry) lines.push(`* **乾香:** ${dry}`);
            if (wet) lines.push(`* **濕香:** ${wet}`);
        }
        if (f.hasFlavorWheel) {
            const sel = Array.from(
                document.querySelectorAll(`#${f.key}_flavorList .flavor-tag.selected`)
            ).map(t => t.innerText);
            if (sel.length) lines.push(`* **風味詞:** ${sel.join(', ')}`);
        }
        const note = v(`${f.key}_notes`);
        if (note) lines.push(`* **備註:** ${note}`);
        lines.push('');
    });

    // Per-field details (only if something to say)
    const detailBlocks = [];
    referenceFields.forEach(f => {
        const note = v(`${f.key}_notes`);
        const details = [];
        if (f.custom) {
            const pk = Object.keys(f.custom)[0], sk = Object.keys(f.custom)[1];
            const pv = document.querySelector(`input[name="${f.key}_${pk}"]:checked`)?.value || '';
            const sv = Array.from(document.querySelectorAll(`input[name="${f.key}_${sk}"]:checked`))
                .map(cb => cb.value);
            if (pv) details.push(`* **${f.custom[pk].label}:** ${pv}`);
            if (sv.length) details.push(`* **${f.custom[sk].label}:** ${sv.join(', ')}`);
        }
        if (f.hasFlavorWheel) {
            const sel = Array.from(
                document.querySelectorAll(`#${f.key}_flavorList .flavor-tag.selected`)
            ).map(t => t.innerText);
            if (sel.length) details.push(`* **風味詞:** ${sel.join(', ')}`);
        }
        if (note) details.push(`* **備註:** ${note}`);
        if (details.length) detailBlocks.push(`### ${f.label}\n${details.join('\n')}`);
    });
    if (detailBlocks.length) {
        lines.push('## 各項細節', '', detailBlocks.join('\n\n'), '');
    }

    const defects = v('defects');
    if (defects) lines.push('## 瑕疵記錄', defects, '');
    const finalNotes = v('notes');
    if (finalNotes) lines.push('## 最終備註', finalNotes, '');

    document.getElementById('markdownOutput').textContent = lines.join('\n');
}

function copyToClipboard() {
    const text = document.getElementById('markdownOutput').textContent;
    if (!text) {
        alert('請先點「生成 Markdown」');
        return;
    }
    navigator.clipboard.writeText(text)
        .then(() => alert('Markdown 已複製到剪貼簿！'))
        .catch(() => alert('複製失敗'));
}

// ─── Init ────────────────────────────────────────────────────────────────────
function bindStaticListeners() {
    document.getElementById('loadBtn').addEventListener('click', loadRecord);
    document.getElementById('deleteBtn').addEventListener('click', deleteRecord);
    document.getElementById('saveBtn').addEventListener('click', saveRecord);
    document.getElementById('generateBtn').addEventListener('click', generateMarkdown);
    document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
}

document.addEventListener('DOMContentLoaded', () => {
    renderTierChips();
    renderScoreChips(tierById(coeState.selectedTierId));
    refreshTotalDisplay();
    initializeEvaluationAccordion();
    updateRecordList();
    bindStaticListeners();
});
