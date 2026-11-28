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

**Scoring model — 沖煮 / 品鑑** (#169, critical to preserve; terms in `GLOSSARY.md`「評分」):
- 8 `adjustmentFields` in drinking order (香氣、風味、清晰度、酸 / 鹹、甜 / 苦、口感、尾韻、平衡 / 和諧), each an
  **調整分** starting at null (未判斷): −1, 0, 0.5, 1 … (0.5 steps, no cap, **no −0.5**) —
  rules in `stepAdjustment`. 分數 = `80 + Σ` (`scoreFromAdjustments`), stored in
  `coe_total`; `coe_tier_id = tierFromScore(coe_total).id`. Saving is blocked until all 8
  are judged, so new 沖煮 / 品鑑 records always have a score. No picker, no 預估總分.
- New records: `evaluations[key] = { score, notes, flavors?, …chips }` (flavors only on
  aroma / flavor), `observation: {}`, `schema_version` ≥ `ADJUSTMENT_SCHEMA` (cupping 4,
  tasting 6). Each row's expanded area carries the pre-#169 descriptive chips
  (`adjustChipSpec`: `evaluationOptions[key]`, aroma → `observationOptions.aroma`; no
  `overall`), record-only, never part of the score. Notes sit collapsed behind 「加上備註」.
- **Old records keep their entered `coe_total`** (stats mix old and new on purpose). Their
  4–8 reference scores are converted **at display time** by `recordAdjustments`
  (old − 5, anything below 0 → −1, aroma 0, `overall` dropped); the DB is never rewritten.
- On-screen wording: 分數 (never "CoE"); 「瑕疵」 only in 杯測. Field / code names
  (`coe_total`, `coeState`, …) stay.
- The 沖煮 / 品鑑 form no longer records 負面風味: no `defects` / `defects_tags` input, and
  the payload omits both (DB defaults). The form keeps 最終備註 in its own 「備註」 card. Old
  records' `defects` still show on the detail page as 「負面風味」.
- Leaving a 沖煮 / 品鑑 form with input asks 「尚未儲存，確定離開？」 (`onHashChange` +
  `beforeunload`); no drafts (#137).

**Scoring model — 杯測場次 (unchanged by #169)**: `coe_total` is still picked directly with
the two-stage tier → score-chip picker (`coeState`, `selectTier` / `selectScore`); the 8
`referenceFields` (4–8, default 5) are stored but don't compute it; `observationFields`
(`aroma`) is observation-only; `renderEstimatedTotalBlock` shows the 36 + Σ estimate.

## 杯測場次 form and session save

**杯測場次 form** (`#tpl-session-form`, `viewSessionForm`) is separate from `#tpl-form`. It
is now the only user of the tier/score picker + `#evaluationAccordion` (`#tpl-form` uses the
adjustment widget, `initAdjustmentWidget`), and only **one cup's widgets are in the DOM at a
time**. The other cups live in `state.currentForm.cups`; call `syncActiveCup()` before
reading `cups` (switch / save / overview). `writeCupToForm` must *reset* every
widget (`applyEvaluationsToForm` resets missing keys to defaults). Every cup holds exactly
`id` + `readCupFromForm()` keys: never `created_at`, `user_id`, `session_id` or `position`.
The bulk upsert needs identical key sets. `initEvaluationAccordion` runs once per mount
(a second call stacks listeners). In this form `coeState.coeTotal` / `selectedTierId` can
be `null` (= 未評分; `selectTier` / `selectScore` / `refreshTotalDisplay` guard it). Every
non-submit `<button>` must be `type="button"`, or tapping it saves the whole session.

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
| Tier (徽章) colors | `--t1-bg` … `--t7-bg` / `--t*-fg` + the tier palette block in `styles.css` | `tier.cssClass` → `var(--tier-bg)` / `var(--tier-fg)` |
| Record-type colors (沖煮 / 品鑑 / 杯測) | `--type-*-bg` / `--type-*-fg` in `:root` | `.record-card-type-badge.type-*` |
| Error / danger red | `--danger`, `--danger-strong`, `--danger-bg`, `--danger-border` in `:root` | `var(--danger*)` |
| Adjustment-score levels | `--adj-*` in `:root` | `adjustmentLevel(value)` → `data-level` |
| Flavor colors | the `flavors` constant | `decodeFlavorMeta(id).color` |
| Record-type names | `TYPE_LABELS` | `TYPE_LABELS[type]` (filter chips, new-record picker, badges) |
| Tier names and descriptions | `totalScoreTiers` | README's badge table copies it, guarded by a test |

Values that only happen to be equal are not copies: `--adj-neg` and `--brew-temp` are both
`#b4532a` but mean "worse than normal" and "water temperature".

**Tier (徽章) colors.** The palette is `--t1-bg` … `--t7-bg` / `--t*-fg` in `styles.css`
`:root`; the **tier palette** block right after it maps each `tier.cssClass` (`.t-trash` …
`.t-godly`) to `--tier-bg` / `--tier-fg`. Tiers in `totalScoreTiers` carry `cssClass` and
no color. To show a tier:

- an element styled by the tier: add `tier.cssClass` and read `var(--tier-bg)` /
  `var(--tier-fg)` in its CSS (with a fallback when the element can be tier-less);
- a tier name inside text: `tierBadgeHtml(tier)` (its `badgeName`; pass a second argument
  for other text, e.g. the medal char; `tierBadgeHtml(null)` is the gray 未評分 pill).

Places that show a tier today (keep this list current):

| Where | Function | Element |
|---|---|---|
| Records list card | `renderRecordCard` | `.record-card-medal` |
| Advanced filter (等級) | `openFilterDrawer` | `.filter-tier-row .filter-chip` |
| Stats: score distribution | `statsDistMarkup` | `.stats-dist-medal`, `.stats-dist-bar` |
| 沖煮 / 品鑑 form score bar / panel | `renderScoreBar` | `#scoreBar.score-bar` |
| 沖煮 / 品鑑 detail page | `renderRecordDetail` | `.tier-badge` |
| 杯測 form: tier picker, score chips, total | `renderTierMedals`, `renderScoreChips`, `refreshTotalDisplay` | `.tier-medal`, `.score-chip-row`, `#coeTotalTierBadge` |
| 杯測 form / detail: 預估總分 | `updateEstimatedTotalDisplay`, `renderEstimatedTotalBlock` | `.evaluation-estimated-tier` |
| 杯測 form: collapsed cup score summary | `refreshSessionSummaries` | `#cup-score-summary` |
| 杯測 detail: per-cup score, ranking | `renderSessionCupDetail`, `renderCupRanking` | `.session-cup-score`, `.cup-ranking-score` |
| 杯測 reveal cards | `renderRevealCardHead` | `.reveal-cup-medal` |

`tests/tier-palette.test.js` fails if a tier gets a color property, if `app.js` reads
`tier.color`, if `--t*-bg` / `--t*-fg` is referenced outside the palette block (fallback forms
included), if a palette background is copied outside `:root` (as hex or `rgb()`/`rgba()`), if a
`.t-*` class appears anywhere but its palette line (so no component colors one tier itself), or
if one of the components above stops reading `--tier-bg`. jsdom computes no styles, so it
checks the rules, not rendered colors: a new component still needs a line in that test.
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
