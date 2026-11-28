# Architecture details

Area-by-area detail for `public/app.js` and the Worker. `CLAUDE.md` points here; read the
section for the area you are about to change.

## 沖煮 / 品鑑 form and scoring

**沖煮 / 品鑑 share one form template** (`#tpl-form` in index.html). The mode toggle
flips visibility via `data-mode-only="cupping|tasting"` and `data-mode-text="..."`.
`setFormMode` sets display + `required` on shop select.

`bindFormHandlers` (bean type, method / process chips, shop change, defects / notes inputs)
is shared by this form and the 杯測場次 form; a binding that looks dead for one form may
serve the other.

**Scoring model — 沖煮 / 品鑑 and every 杯測 cup** (#169, #183; critical to preserve; terms in
`GLOSSARY.md`「評分」):
- 8 `adjustmentFields` in drinking order (香氣、風味、清晰度、酸 / 鹹、甜 / 苦、口感、尾韻、平衡 / 和諧), each an
  **調整分** starting at null (未判斷): −1, 0, 0.5, 1 … (0.5 steps, no cap, **no −0.5**) —
  rules in `stepAdjustment`. 分數 = `80 + Σ` (`scoreFromAdjustments`), stored in
  `coe_total`; `coe_tier_id = tierFromScore(coe_total).id`. Saving a 沖煮 / 品鑑 record is
  blocked until all 8 are judged; a 杯測 cup may stay 未評分 (fewer than 8 judged, no score,
  left out of the ranking). No picker, no 預估總分 anywhere.
- New records: `evaluations[key] = { score, notes, flavors?, …chips }` (flavors only on
  aroma / flavor), `observation: {}`, `schema_version` ≥ `ADJUSTMENT_SCHEMA` (cupping 4,
  tasting 6, session_cup 2). Each row's expanded area carries the pre-#169 descriptive chips
  (`adjustChipSpec`: `evaluationOptions[key]`, aroma → `observationOptions.aroma`; no
  `overall`), record-only, never part of the score. Notes sit collapsed behind 「加上備註」.
- **Old records and old cups keep their entered `coe_total`** (stats mix old and new on
  purpose). Their 4–8 reference scores are converted **at display time** by
  `recordAdjustments` (old − 5, anything below 0 → −1, aroma 0, `overall` dropped); the DB is
  never rewritten. The **tier** is always derived from `coe_total` (`scoreTier`), never from a
  stored `coe_tier_id`: old rows store pre-#173 tier ids.
- **Tiers** (#173): 寶物稀有度 F 破損 · D 普通 · C 優良 · B 稀有 · A 史詩 · S 傳說 · SS 神話,
  80 = D (all 8 judged 0), 3 points per tier, open at both ends (`totalScoreTiers`,
  `tierFromScore`). The 8 adjustment values use the same tiers for their colors
  (`adjustmentTier`: −1 F, 0 D, 0.5 C, 1 B, 1.5 A, 2 S, ≥ 2.5 SS).
- On-screen wording: 分數 (never "CoE"); 「瑕疵」 only in 杯測. Field / code names
  (`coe_total`, `coeState`, …) stay.
- The 沖煮 / 品鑑 form no longer records 負面風味: no `defects` / `defects_tags` input, and
  the payload omits both (DB defaults). The form keeps 最終備註 in its own 「備註」 card. Old
  records' `defects` still show on the detail page as 「負面風味」.
- Leaving a 沖煮 / 品鑑 form with input asks 「尚未儲存，確定離開？」 (`onHashChange` +
  `beforeunload`); no drafts (#137).


## 杯測場次 form and session save

**杯測場次 form** (`#tpl-session-form`, `viewSessionForm`) is separate from `#tpl-form` but
uses the same adjustment widget (`initAdjustmentWidget`, #183), plus its own 瑕疵與備註 card
(`initCupDefects`). Only **one cup's widgets are in the DOM at a time**. The other cups
live in `state.currentForm.cups`; call `syncActiveCup()` before reading `cups` (switch /
save / overview). `writeCupToForm` must *reset* every widget (`applyAdjustmentsToForm`
resets missing keys to 未判斷, empty notes, no chips or flavors). Every cup holds exactly
`id` + `readCupFromForm()` keys: never `created_at`, `user_id`, `session_id` or `position`.
The bulk upsert needs identical key sets. `initAdjustmentWidget` runs once per mount (a
second call stacks listeners). Every non-submit `<button>` must be `type="button"`, or
tapping it saves the whole session.

**Old cups are read-only** (#183, author 2026-11-28). A cup with `schema_version` below
`ADJUSTMENT_SCHEMA.session_cup` and a numeric `coe_total` is `adjustState.legacyCup`: its 8
items show the converted values with the buttons disabled and the rows' expand buttons
hidden, the score bar shows its stored score, and `readCupFromForm` writes its scoring
fields (`coe_total`, `coe_tier_id`, `evaluations`, `observation`, `schema_version`) back
unchanged — every session save re-inserts every cup, so anything else would rewrite the
old score. Bean info, 瑕疵 and notes stay editable. 「重新評分」 (`resetAdjustments`) clears
the 8 items and switches that cup to the new format.

**Session save**: `PUT /api/sessions/:id` serves both create and edit with
client-generated UUIDs, and the whole request is re-sendable. It validates cup codes
first (duplicates → 400 with `code: '23505'`, DB untouched), then runs one
`env.DB.batch()`: upsert the session, **delete all** its cups, re-insert every cup.
SQLite has no deferrable constraints, so delete-all-then-insert is what makes A↔B code
swaps structurally impossible to collide; it also subsumes the old `.not('id','in',…)`
cleanup of half-finished saves. Surviving cups keep their original `created_at`.
PUTting a session id that belongs to someone else is rejected as 404 before the batch.
`viewSessionForm` loads data before mounting the template, so nothing can be saved
half-loaded.
Cups reference sessions through the composite FK `(session_id, user_id)` with cascade.

## Shared visuals

Every meaning shared across pages has **one source**; a page reads it, never copies its value
(#181). Before adding or changing a place that shows one, check this section so no page is
left on an old copy. `tests/tier-palette.test.js` and `tests/single-source.test.js` fail when a
second copy appears.

| Meaning | Source | Read it with |
|---|---|---|
| Tier (徽章) colors | `--t1-*` … `--t7-*` (`bg`, `fg`, `tint`) + the tier palette block in `styles.css` | `tier.cssClass` → `var(--tier-bg)` / `--tier-fg` / `--tier-tint` / `--tier-ink` |
| Record-type colors (沖煮 / 品鑑 / 杯測) | `--type-*-bg` / `--type-*-fg` in `:root` | `.record-card-type-badge.type-*` |
| Error / danger red | `--danger`, `--danger-strong`, `--danger-bg`, `--danger-border` in `:root` | `var(--danger*)` |
| Adjustment-score colors | the tier palette | `adjustmentTier(value).cssClass` on the row |
| Flavor colors | the `flavors` constant | `decodeFlavorMeta(id).color` |
| Record-type names | `TYPE_LABELS` | `TYPE_LABELS[type]` (filter chips, new-record picker, badges) |
| Tier names and descriptions | `totalScoreTiers` | README's badge table copies it, guarded by a test |

Values that only happen to be equal are not copies: they mean different things and change
independently.

**Tier (徽章) colors.** The palette is `--t1-*` … `--t7-*` in `styles.css` `:root` (色調
「深沉」 lightened by OKLCH L +0.08 and chroma ×0.75, author 2026-11-28; #173): `bg` (solid), `fg` (text on solid), `tint` (light background). The **tier
palette** block right after it maps each `tier.cssClass` (`.t-f` … `.t-ss`) to `--tier-bg`,
`--tier-fg`, `--tier-tint`, and for F (too pale to write with) `--tier-ink`; text on white or
on the tint reads `var(--tier-ink, var(--tier-bg))`. Tiers in `totalScoreTiers` carry
`cssClass` and `medal` (the letter), no color.

The treatment depends on the place (#173): **solid** for the list badge, stats and the
杯測 ranking; **tint + colored text** for detail-page tags; **white + colored border** for an
unselected filter chip (solid once selected). There is no glow anywhere (author 2026-11-28).
The 8 adjustment rows carry the tier color on their dot only; the `− 數值 ＋` capsule has no
border and a neutral number. To show a tier:

- an element styled by the tier: add `tier.cssClass` and read `var(--tier-bg)` etc. in its
  CSS (with a fallback when the element can be tier-less);
- a tier inside text: `tierBadgeHtml(tier, text, { tint })` — default text is the
  letter + 中文 name; `tierBadgeHtml(null)` is the gray 未評分 pill.

Places that show a tier today (keep this list current):

| Where | Function | Element |
|---|---|---|
| Records list card | `renderRecordCard` | `.record-card-medal` |
| Advanced filter (等級) | `openFilterDrawer` | `.filter-tier-row .filter-chip` |
| Stats: score distribution | `statsDistMarkup` | `.stats-dist-medal`, `.stats-dist-bar` |
| 沖煮 / 品鑑 / 杯測 form score bar / panel | `renderScoreBar` | `#scoreBar.score-bar` |
| 8 adjustment rows (form and detail) | `renderAdjustRow`, `renderDetailAdjustments` | `.adjust-item`, `.detail-adjust-row` |
| 沖煮 / 品鑑 detail page | `renderRecordDetail` | `.tier-badge.is-tint` |
| 杯測 form: collapsed cup score summary | `refreshSessionSummaries` | `#cup-score-summary` |
| 杯測 detail: per-cup score, ranking | `renderSessionCupDetail`, `renderCupRanking` | `.session-cup-score`, `.cup-ranking-score` |
| 杯測 reveal cards | `renderRevealCardHead` | `.reveal-cup-medal` |

`tests/tier-palette.test.js` fails if a tier gets a color property, if `app.js` reads
`tier.color`, if `--t*-bg` / `--t*-fg` is referenced outside the palette block (fallback forms
included), if a palette background is copied outside `:root` (as hex or `rgb()`/`rgba()`), if a
`.t-*` class appears anywhere but its palette line (so no component colors one tier itself), or
if one of the components above stops reading `--tier-bg`. jsdom computes no styles, so it
checks the rules, not rendered colors: a new component still needs a line in that test.
The rendered colors are checked end to end: `e2e/tiers.spec.js` and `e2e/session.spec.js`
(Playwright, `npm run test:e2e`) compare computed styles on each of the places above with the
palette written in #173.
`tests/single-source.test.js` ties Bootstrap's danger variables (and `--bs-danger-rgb`'s
numbers) to `--danger`.

## Flavor wheel

**Flavor wheel**: up to 3 levels in the `flavors` constant. The persisted ids in
`evaluations[key].flavors` / `observation.aroma.flavors` track the selection path and
**vary in depth** — when an L1's `sub` entries are bare strings (e.g. `floral` → `'茉莉'`)
the leaf stops at `${containerId}__l1-<slug>__l2-<slug>`; only branches whose L2 is an
object with its own `sub` extend to `__l3-<slug>`. String-derived slugs strip `/` and
whitespace (see `toggleFlavor`). Selecting a deeper level auto-selects ancestors;
deselecting an ancestor cascades. `applyFlavorSelections` rebuilds the expansion state
from stored ids.

## State

**State** (`state` in app.js): in-memory only. `state.user` is `{ id, email }` from
`/api/me` — Access's application token carries no name or avatar, so the account page is
email-only. `state.shops` is a cache plus a `shopsLoaded` flag so that `shopName(id)`
doesn't mislabel transient fetch failures as "已刪除店家". CoE selection lives in
`coeState`; flavor-wheel selections in `wheelState` (keyed by container id —
`wheelState.clear()` on each route transition).

## Google Places proxy

**Google Places** is proxied through `/api/places/*`; the key is a Worker secret and
never reaches the browser. The Worker flattens the REST shapes (`displayName: {text}` →
string, `location: {latitude, longitude}` → `{lat, lng}`) so app.js's accessors are
unchanged. It is behind `requireAccess` plus a per-user rate limit — it is the only path
that spends real money.
