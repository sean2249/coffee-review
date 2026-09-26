# CLAUDE.md

This file has two parts: **Working principles** (how to behave on any change in this
repo) and **Project context** (what this app is and how it's wired). Read both before
editing.

---

## Working principles

Behavioral guidelines to reduce common LLM coding mistakes. Adapted from
<https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md>.

**Tradeoff:** these bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports / variables / functions that *your* changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
3. [step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites
due to overcomplication, and clarifying questions come *before* implementation rather
than after mistakes.

---

## Project context

Personal coffee review/cupping web app (CoE-inspired). Vanilla JS SPA served by a single
Cloudflare Worker that is also the API, backed by D1. Login is Cloudflare Access.
PWA-installable. All UI text is Traditional Chinese — keep it that way when editing.

## Tech stack

- **Frontend: no build, no framework**: vanilla ES2022 JS in `public/app.js`, classic
  `<script>` (not a module). Bootstrap 5.3 CSS+JS and Bootstrap Icons from jsDelivr CDN.
  There is no bundler and no client-side config file — the app talks to `/api/*` on its
  own origin, so there is no base URL, no CORS, and no credential in the browser.
- **Worker**: TypeScript + Hono in `src/worker/`, hand-written SQL against D1 (no ORM).
  Bundled by wrangler's esbuild at `wrangler deploy` time; that is the only "build".
- **D1**: schema in `migrations/`, applied by `wrangler d1 migrations apply`. The
  Postgres → SQLite translation rules are documented at the top of
  `migrations/0001_init.sql`.
  **Triggers cannot go in `migrations/`**: D1's `/query` endpoint — the one
  `migrations apply` uses — cannot parse `create trigger … begin … end;` and returns
  `incomplete input`. They live in `schema/triggers.sql`, applied through
  `d1 execute --file` (the `/import` endpoint) from three places that must stay in
  sync: the `db:migrate:*` npm scripts, `test/worker/setup.ts`, and `deploy.yml`.
  That file uses `create trigger if not exists` so re-running is safe, and holds
  **one statement per trigger** — nothing splits statements in it.
- **Auth**: Cloudflare Access (Google IdP) in front of `coffee.kiwi-walk.com`; the Worker
  re-verifies the forwarded JWT (`src/worker/lib/access.ts`, a dependency-free JWKS
  verifier) so a misconfigured Access application fails closed.
- **PWA**: `public/manifest.json` + `public/sw.js` (navigations are network-first so an
  expired Access session can redirect to login; stale-while-revalidate for the app
  shell; same-origin `/api/*` and `/cdn-cgi/*` are passed straight through — see
  `shouldBypass`).
- **Tooling**: ESLint flat config + typescript-eslint for `src/worker/**`, Stylelint,
  `tsc -p tsconfig.worker.json` for typecheck. **Vitest with two projects**
  (`vitest.config.ts`): `app` runs the existing jsdom tests in `tests/` (environment is
  `node` — `tests/load-app.js` builds its own JSDOM and runs `public/app.js` as a classic
  script in a vm context), `worker` runs `test/worker/**` inside real workerd with a
  miniflare-backed D1 via `@cloudflare/vitest-pool-workers`.
  `package.json` sets `"type": "module"` package-wide, but the browser files
  (`public/app.js`, `public/sw.js`) are classic scripts — ESLint's per-file overrides set
  `sourceType: 'script'` to match.
- **CI**: `ci.yml` runs typecheck + lint + test + `wrangler deploy --dry-run` (no API
  token needed) on every push/PR; `deploy.yml` applies D1 migrations, hard-fails if the
  `ACCESS_*` repo variables are empty, then deploys. Do **not** connect the Worker to the
  repo in the Cloudflare dashboard (Workers Builds) — that would be a second deploy source
  fighting GitHub Actions.

## File layout

```
public/            everything the browser loads (this is the assets directory)
  index.html       markup + <template> blocks for form/modal; mounts to <main id="app">
  app.js           router, views, api layer (fetch), CoE widget, flavor wheel
  styles.css       design tokens (:root) + section-banner-commented blocks
  sw.js            service worker (cache name bumped by VERSION constant)
  manifest.json    PWA manifest
  icons/           192/512 PNG + source SVG
src/worker/        index.ts (Hono) + routes/ + lib/{access,auth,columns,errors,json,sql,users}.ts
src/shared/        json-columns.js — array/jsonb/timestamp manifest, shared with scripts/
migrations/        D1 schema (0001_init.sql). Add new files; never edit applied ones.
schema/triggers.sql triggers — cannot live in migrations/, see Tech stack
scripts/           one-off Supabase → D1 export / import / verify
tests/             jsdom unit tests + load-app.js harness
test/worker/       workerd tests (separate directory so the include globs cannot overlap)
wrangler.jsonc     assets + D1 + rate limit + routes + Access vars
.dev.vars.example  copy → .dev.vars (gitignored)
.github/workflows  ci.yml + deploy.yml
README.md          architecture, local dev, deploy, migration runbook
purpose.md, 口感.md design notes (Chinese)
```

## Architecture

**Hash router** (`renderRoute` in `app.js`; search by function name if needed). Routes:

| Route | View |
|---|---|
| `#/records` (default) | List with type + shop filters |
| `#/new[/cupping\|tasting\|session]` | Empty form, mode selectable |
| `#/cupping/<id>` / `#/tasting/<id>` | Read-only detail (no edit/delete UI) |
| `#/session/<id>` / `#/session/<id>/edit` | 杯測場次 detail (ranking + per-cup) / edit form |
| `#/shops` / `#/shops/<id>` | Shop registry + per-shop records + 我的店家筆記 |
| `#/me` | Google sign-in / sign-out |

Every data route is gated by `renderAccessGate(root)` — it renders the sign-in prompt
when `state.user` is null and returns `true`, so the caller bails before issuing any
query. Access already blocks unauthenticated traffic at the edge, so that branch only
happens while `/api/me` is in flight or if it failed; the button is a reload. Bootstrap
`await`s `initAuth()` before the first `renderRoute()`, otherwise a signed-in user's
first paint would be the sign-in prompt.

**Three record types.** Keys vs. UI labels live in `TYPE_LABELS`: `cupping` = **沖煮**
(one bean per record; key/table/route keep the old name, no migration), `tasting` = 品鑑,
`session` = **杯測** (one session, many coded cups). On shop pages a session is flattened by
`flattenSessionCups` into `session_cup` rows, because the bean-source shop lives on each cup.

**杯測場次 form** (`#tpl-session-form`, `viewSessionForm`) is separate from `#tpl-form`. It
reuses the same CoE card / accordion ids, but only **one cup's widgets are in the DOM at a
time**. The other cups live in `state.currentForm.cups`; call `syncActiveCup()` before
reading `cups` (switch / save / draft / overview). `writeCupToForm` must *reset* every
widget (`applyEvaluationsToForm` resets missing keys to defaults). Every cup holds exactly
`id` + `readCupFromForm()` keys: never `created_at`, `user_id`, `session_id` or `position`.
The bulk upsert needs identical key sets. `initEvaluationAccordion` runs once per mount
(a second call stacks listeners). In this form `coeState.coeTotal` / `selectedTierId` can
be `null` (= 未評分; `selectTier` / `selectScore` / `refreshTotalDisplay` guard it). Every
non-submit `<button>` must be `type="button"`, or tapping it saves the whole session.

**沖煮 / 品鑑 share one form template** (`#tpl-form` in index.html). The mode toggle
flips visibility via `data-mode-only="cupping|tasting"` and `data-mode-text="..."`.
`setFormMode` (app.js:1290) sets display + `required` on shop select.

**API layer**: `apiFetch` in `public/app.js` is the single network exit — same origin,
`credentials: 'same-origin'` to carry Access's `CF_Authorization` cookie. When Access's
session expires, `/api/*` returns the login page as HTML; `apiFetch` detects that and
calls `location.reload()` so the browser walks through Access again (this replaces token
refresh). Errors carry `code`, which the Worker maps back from D1 constraint failures to
the Postgres SQLSTATEs `23505` / `23503` that two `catch` blocks in app.js branch on.
The `api` object is a thin wrapper over `apiFetch`; every fetch-by-id endpoint returns
`200 null` for a missing row (matching the old `.maybeSingle()`), so app.js never has to
handle status codes.

**Ownership is server-side.** There is no RLS. `requireAccess` verifies the Access JWT,
`withUser` resolves its email to `users.id`, and every owned-table query carries
`and user_id = ?`. `user_id` / `created_by` are stamped by the Worker and the client
literally cannot send them — `src/worker/lib/columns.ts` is a per-table write whitelist.
`test/worker/` has a "can't see another user's data" case for every owned table; keep it
that way, a missing `and user_id = ?` is a silent cross-user leak with no error message.

**Session save**: `PUT /api/sessions/:id` serves both create and edit with
client-generated UUIDs, and the whole request is re-sendable. It validates cup codes
first (duplicates → 400 with `code: '23505'`, DB untouched), then runs one
`env.DB.batch()`: upsert the session, **delete all** its cups, re-insert every cup.
SQLite has no deferrable constraints, so delete-all-then-insert is what makes A↔B code
swaps structurally impossible to collide; it also subsumes the old `.not('id','in',…)`
cleanup of half-finished saves. Surviving cups keep their original `created_at`.
PUTting a session id that belongs to someone else is rejected as 404 before the batch.
`viewSessionForm` loads data before mounting the template, so nothing can be saved
half-loaded. Restoring a *new*-session draft gives the cups fresh ids.
Cups reference sessions through the composite FK `(session_id, user_id)` with cascade.

**Google Places** is proxied through `/api/places/*`; the key is a Worker secret and
never reaches the browser. The Worker flattens the REST shapes (`displayName: {text}` →
string, `location: {latitude, longitude}` → `{lat, lng}`) so app.js's accessors are
unchanged. It is behind `requireAccess` plus a per-user rate limit — it is the only path
that spends real money.

**State** (`state` in app.js): in-memory only. `state.user` is `{ id, email }` from
`/api/me` — Access's application token carries no name or avatar, so the account page is
email-only. `state.shops` is a cache plus a `shopsLoaded` flag so that `shopName(id)`
doesn't mislabel transient fetch failures as "已刪除店家". CoE selection lives in
`coeState`; flavor-wheel selections in `wheelState` (keyed by container id —
`wheelState.clear()` on each route transition).

**CoE scoring model** (critical to preserve):
- `coe_total` is the **user-entered** total (74–96), not a sum. Two-stage picker: medal
  tier (`totalScoreTiers` at app.js:25) → score chip.
- The 8 reference fields (`referenceFields` at app.js:162) score 4–8 with 0.5 step, default
  5. They're **stored but don't compute** the total.
- `observationFields` (`aroma`) is observation-only, no score.
- Persisted shape: `coe_total`, `coe_tier_id`, `evaluations: jsonb`, `observation: jsonb`,
  `schema_version: 1`. `evaluations[key] = { score, notes, flavors?, <custom keys>? }`.

**Flavor wheel**: up to 3 levels in `flavors` (app.js:177). The persisted ids in
`evaluations[key].flavors` / `observation.aroma.flavors` track the selection path and
**vary in depth** — when an L1's `sub` entries are bare strings (e.g. `floral` → `'茉莉'`)
the leaf stops at `${containerId}__l1-<slug>__l2-<slug>`; only branches whose L2 is an
object with its own `sub` extend to `__l3-<slug>`. String-derived slugs strip `/` and
whitespace (see `toggleFlavor`). Selecting a deeper level auto-selects ancestors;
deselecting an ancestor cascades. `applyFlavorSelections` rebuilds the expansion state
from stored ids.

## Conventions

- **Indent 4 spaces**, single quotes in JS, trailing commas where ESLint allows.
- HTML class attributes use Bootstrap utilities + custom classes from `styles.css`.
- Always `escapeHtml(...)` user/DB strings before interpolating into `innerHTML`. The
  helper is at app.js:257.
- DOM ids in forms are prefixed `f-` for top-level inputs and `<key>_<suffix>` for
  evaluation widgets (e.g. `flavor_score`, `aroma_dryAroma`).
- CSS section banners use the `/* ───── Title ──── */` style — keep new sections
  consistent so the file stays scannable.
- Style tokens: prefer `var(--accent)`, `var(--text-muted)`, `var(--radius-md)` etc. from
  the `:root` block over hardcoded values.

## Workflow

```bash
npm install
cp .dev.vars.example .dev.vars   # DEV_USER_EMAIL (+ optional GOOGLE_MAPS_API_KEY)
npm run db:migrate:local         # create/refresh the local D1
npm run dev                      # wrangler dev → http://localhost:8787

npm run lint                     # lint:js + lint:css
npm run typecheck                # tsc, Worker only
npm test                         # vitest run — both projects (jsdom + workerd)
```

`wrangler dev` serves `public/` and `/api/*` on one origin, so there is no second dev
server and still no frontend build step.

Locally there is no Cloudflare Access: with both `ACCESS_*` vars empty `requireAccess`
takes its `open` branch and the identity comes from `.dev.vars`'s `DEV_USER_EMAIL`.
**Unset it and every request 503s** — deliberately, so nothing ever runs unowned. Once
`ACCESS_AUD` is set, `DEV_USER_EMAIL` is ignored by an explicit code check, not by
convention. `.dev.vars` is gitignored; never commit credentials.

If you change anything in `APP_SHELL` (public/sw.js) or want to force users off an old
cache, bump `VERSION` at the top of `public/sw.js`.

## Editing checklist

- Touching the form? Update both modes in `index.html` (#tpl-form) and the corresponding
  `buildFormPayload` / `loadRecordIntoForm` branch in app.js.
- Adding a trigger? It goes in `schema/triggers.sql`, not `migrations/` (see Tech stack),
  as a single `create trigger if not exists` statement.
- Adding a column? Add to (1) `buildFormPayload`, (2) `loadRecordIntoForm`, (3) a **new**
  file in `migrations/` (never edit an applied one), and (4) the write whitelist in
  `src/worker/lib/columns.ts` — a column missing from the whitelist is silently dropped.
  If it is an array or jsonb column, also add it to `src/shared/json-columns.js`.
  For a 杯測 cup column: `readCupFromForm` + `writeCupToForm` + `CUP_COLS` + migration.
- Shop-level experience (氛圍 / 設施 / 風格 / 材質 / 服務 / 餐點 / 飲料) lives in
  `shop_notes` — one row per (shop, user) — **not** in `tasting_records`. Its
  editor is `initTagSections(container)`, mounted by the shop detail page and by the
  tasting form's 我的店家筆記 card (`refreshFormShopNote` → `mountFormShopNote`, which
  expands when the shop has no note yet and collapses when it does; the form only
  upserts it when `formShopNoteIsDirty()`); payload assembly is `buildShopNotePayload` /
  `applyShopNoteToEditor`.
- Adding evaluation fields? Update `referenceFields` / `observationFields` and verify the
  card list / detail card still renders sensibly with old records (treat missing keys as
  default).
- Adding an endpoint? It must sit behind `requireAccess` + `withUser`, and any query on
  an owned table must carry `and user_id = ?`. Add the two-user isolation test.
- Anything that changes app-shell URLs → bump `public/sw.js` VERSION.
- After edits: `npm run lint`, `npm run typecheck` and `npm test` (CI runs all three and
  fails the PR otherwise; the suite covers scoring, flavor wheel, filters, estimated
  total, the pickers, and the whole Worker API against a real D1).

## Things to leave alone unless asked

- Isolation is **per-row and enforced in the Worker**, not open access. Records,
  sessions, cups and `shop_notes` are all `user_id = <the Access identity>`; `shops` is a
  shared registry readable by any signed-in user. Don't loosen this, and don't let the
  client supply an owner.
- `workers_dev: false` is load-bearing: a live `*.workers.dev` hostname would be a second
  entry point that bypasses Cloudflare Access entirely. Same for the absence of an
  unauthenticated `/api/*` endpoint — there is deliberately no `/api/health`.
- `shops` is a **projection of Google Places**: `name` / `location` / `lat` / `lng`
  only ever come from the Places API, and the UI offers no free-text field for them
  (create = place picker, update = "從 Google 重新同步"). A DB trigger freezes
  `google_place_id`. Don't add a manual name input "for convenience".
- Shop-to-record FKs are `ON DELETE RESTRICT` on purpose — shops and records are
  independent tables, so deleting a shop must never touch anyone's records.
- The CoE total (`coe_total`) is **input, not computed** — don't "fix" it by summing
  reference scores. (Separately, the **預估總分 / estimated total** *is* a deliberate
  computed display — `36 + 8 reference scores`, `computeEstimatedTotalFromRecord` — shown
  alongside `coe_total`, not a replacement for it.)
- UI strings are zh-TW; don't translate to English.
- `purpose.md` and `口感.md` are background design notes, not living docs — don't rewrite
  them as part of unrelated changes.
