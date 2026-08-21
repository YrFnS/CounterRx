# CounterRx — Audit Findings Remediation Plan

Branch: `fix-backend-db-supabase`. Status: PLAN — no work done yet.
Sources: three parallel audits run 2026-08-21 against this branch —
hardcoded/mock-data audit, FEATURES.md-vs-codebase audit, i18n/RTL audit —
plus a branch-integrity check. Findings below are reproduced with file/line
evidence as of commit `6b379af`.

Every fix updates `GATES.md` (and leaf gates) in the same commit. Acceptance
for code changes: `npm run typecheck` and `npm run build` pass; G9-style
browser verification for UI changes.

---

## Finding registry

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | **Critical (data integrity)** | After successful auth, a single failing table read makes `loadBackendData` return the seed/localStorage state, which is dispatched as `HYDRATE_BACKEND` — demo data shows as live, only a `console.warn` fires, no UI error | `src/lib/sync.ts:343-346`, `src/store.tsx:1526` |
| F2 | **High** | If all 21 tables read empty, the app writes the demo dataset into the real Supabase DB automatically (`persistBackendData(seed)`) | `src/lib/sync.ts:347-348` |
| F3 | **High** | i18n layer is dead code: `t()` is never called anywhere; every UI string is a hardcoded English literal; `useTranslation` imported but unused | `src/App.tsx:3`; all views |
| F4 | **High** | No language toggle — no `changeLanguage`, no picker; locale is detector-only and changes nothing | `src/i18n.ts` |
| F5 | **High** | `dir` is never set (runtime or `index.html`); the `[dir="rtl"]` CSS block can never trigger; Arabic users get LTR + English | `src/index.css:4-9`, `index.html` |
| F6 | **Medium** | All layout uses physical utilities (`left/right/ml/mr/pl/pr/text-left/text-right/translate-x`); sidebar drawer anchored left, Settings toggle knob, native `confirm()` dialogs — latent RTL breakage once `dir` is enabled | `src/App.tsx:345,183`, `src/views/Settings.tsx:478`, `src/modals.tsx:322,362` |
| F7 | **Medium (gap)** | No role-based route guards — every authenticated user reaches every view; PERMS matrix exists but is not enforced in routing | `src/App.tsx`, `src/data.ts:PERMS` |
| F8 | **Medium (gap)** | No `organizations` table / `organization_id` scoping — DB is single-tenant; FEATURES.md P0 requires multi-tenancy | `supabase/migrations/*` |
| F9 | **Medium (gap)** | Audit `actor` comes from the client reducer, not the session (`auth.uid()`) | `src/store.tsx` audit writes; `supabase/migrations/*` |
| F10 | **Medium (gap)** | No tests (no `test` script, no unit/component tests), no ESLint, no CI; only typecheck + manual e2e evidence | `package.json` |
| F11 | **Low (gap)** | No offline outbox / conflict resolution — sync is best-effort, failed writes are `console.warn` only | `src/lib/sync.ts` |
| F12 | **Low (process)** | `FEATURES.md` (the plan doc) exists only on `origin/main` (`ac64451`), not on this branch; plan/gate docs are split across branches | branch check |
| F13 | **Low (process)** | G9 (full browser feature E2E) is the only unchecked root gate: login covered, but inventory/customers/prescriptions/sales/shifts/reports/audit/settings/role-restricted/realtime between two sessions are not | `GATES.md` |
| F14 | **Low (info)** | Broad P1 data models + seed exist (Rx, shifts, AP, expenses, deliveries, UOM, kits…) but the operational UI/reports on top are not built — not a defect, the next roadmap tranche | `sa-2` audit tables |

---

## Phase 0 — Data-integrity fixes (F1, F2) · smallest, highest value

### 0.1 Make backend load failures explicit (F1)

`src/lib/sync.ts:loadBackendData` currently returns `BackendData` with no
success signal, so the caller cannot distinguish "real backend read" from
"seed fallback". Change the contract:

- Return `{ ok: true, data }` on full success, `{ ok: false, failedTable }`
  on any table-read error (instead of returning `seed`).
- On failure with previously hydrated data present, keep the last good
  state and flip a new `backendOffline: boolean` in store state.
- On failure with no prior hydration, keep seed **but mark the UI offline**
  (banner: "Backend unavailable — showing local data"), never present it as
  live-synced.
- `src/store.tsx:1526` must not dispatch `HYDRATE_BACKEND` from a failed
  load; dispatch a `BACKEND_OFFLINE` action instead and surface the banner in
  the app shell (`src/App.tsx`).

### 0.2 Stop auto-writing demo data to the real DB (F2)

- Remove the `persistBackendData(seed)` call at `src/lib/sync.ts:347-348`
  (empty-tables branch returns `{ ok: false }` — an empty tenant is a real
  state, not a reason to inject demo rows).
- If first-run seeding is wanted, make it an explicit Settings action
  ("Load demo dataset") behind a confirm, never automatic.

**Acceptance:** a fresh empty tenant shows the empty UI + offline/empty banner,
never demo rows; a single dead table read shows the banner and keeps last
state; typecheck + build pass. New gate: `gates/sync-integrity.md`.

### 0.3 Co-locate the plan docs (F12)

- Cherry-pick `ac64451` (`Add FEATURES.md`) from `origin/main` onto this
  branch so `FEATURES.md`, `PLAN.md`, and `GATES.md` live together.

---

## Phase 1 — i18n + RTL (F3, F4, F5, F6)

Translation content is complete (364/364 keys aligned in `en.json`/`ar.json`);
the work is wiring + layout.

### 1.1 Route strings through `t()` (F3)

- Add `const { t } = useTranslation()` in every view component and replace
  hardcoded user-visible literals with keys. Inventory of files:
  `src/App.tsx` (page titles, nav, aria-labels, toasts), `src/views/`
  (Register, Dashboard, Customers, Inventory, Finance, Reports,
  Prescriptions, History, Deliveries, Settings), `src/modals.tsx`,
  `src/ui.tsx`.
- Add any missing keys to both `en.json` and `ar.json` in the same commit —
  keep 364-alignment (a lint-able invariant: key sets must stay identical).
- `src/store.tsx` toast/audit messages (~30, e.g. "Signed in — …") route
  through `t()` with interpolation; keep message text as keys, values as args.
- New keys carry the same key path in both files; brand/technical tokens
  (`CounterRx`, `PIN`, `GTIN`, `NDC`) stay identical in both.

### 1.2 Language toggle (F4)

- Add a language picker to `src/views/Settings.tsx` calling
  `i18n.changeLanguage('en' | 'ar')`; persist via the existing detector
  cache (`localStorage`).
- `index.html`: `<html lang="en" dir="ltr">` as the default shell.

### 1.3 RTL activation (F5)

- On language change, set `document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'`
  (small effect in `src/App.tsx` keyed on `i18n.language`).
- The `[dir="rtl"]` block and `[dir="rtl"] .num` number-reversal rule in
  `src/index.css` then activate.

### 1.4 Convert physical layout to logical (F6)

- Drawer/sidebar: `src/App.tsx:345-346` `left-0 -translate-x-full` →
  logical `start-0` + `-translate-x-full` with an RTL-aware slide
  (`[dir="rtl"] .drawer { transform: translateX(100%) }` or `inset-inline`).
- Toggle knob: `src/views/Settings.tsx:478` `left-[18px]` → `start-[18px]`.
- Text alignment: `text-left`/`text-right` → `text-start`/`text-end`
  across views (grep-driven sweep).
- Input padding: `pl-9 pr-3` → `ps-9 pe-3` (`src/App.tsx:183` and others).
- `src/modals.tsx:322,362`: replace native `confirm()` with the existing
  custom modal so the dialog is translatable and RTL-correct.
- Sweep `grep -rn "left-\|right-\|ml-\|mr-\|pl-\|pr-\|text-left\|text-right"` —
  convert only layout-affecting instances; decorative animation
  `translateX` (shake/toast/scan) stays.

**Acceptance:** switching to Arabic in Settings flips `dir` and mirrors the
layout; sidebar comes from the right; no `text-left/right` or `left/right`
utilities remain that affect layout; a native `confirm()` no longer appears in
the payment path. New gate: `gates/i18n-rtl.md` (key-set parity check +
toggle + dir-flip browser verification).

---

## Phase 2 — P0 platform foundation (F7, F8, F9, F10, F11)

### 2.1 Organizations + multi-tenant scoping (F8)

- Migration: `organizations` table; add `organization_id` to every domain
  table (or a single-tenant `org_id` default on first tenant).
- RLS: every policy scoped by `organization_id` (via `current_setting` or a
  session claim); tenant row exists per seed.
- Seed: one org row; existing rows linked to it.
- **Acceptance:** a second org's data is invisible to the first org's RLS.

### 2.2 Role-based route guards (F7)

- `PERMS` matrix exists in `src/data.ts` — add a `<RequireRole roles={…}>`
  wrapper around route/NAV targets in `src/App.tsx`; unauthorized roles get a
  denied view instead of the content.
- Keep guards client-side for UX; server enforcement stays RLS.
- **Acceptance:** cashier cannot open Settings/Reports; manager cannot open
  platform-admin surfaces; verified per role in browser.

### 2.3 Audit actor from session (F9)

- Write audit entries via a Postgres RPC/trigger that stamps
  `auth.uid()`/role server-side, or default `actor` in RLS from session
  claims; the client stops fabricating the actor name.
- **Acceptance:** audit rows for live actions carry the session actor, not a
  client-supplied string.

### 2.4 Tests, lint, CI (F10)

- Unit tests for reducers/ledger logic (`vitest`, `npm test`), component
  smoke tests for views; lint via ESLint config matching the repo's
  TypeScript settings; `npm run typecheck` stays.
- CI: product repo — a GitHub Actions workflow running typecheck → lint →
  tests → build is appropriate here (this is not the Second Brain repo,
  which keeps local gates by decision).
- **Acceptance:** `npm test` green; CI green on push; no new lint findings.

### 2.5 Offline outbox + conflict resolution (F11)

- Migration: `sync_queue` table + `version`/`updated_at` cursor columns per
  FEATURES.md; every mutation appends to the local outbox; on reconnect,
  push queued ops then pull since `updated_at`.
- Conflict rule: LWW per record with server-assigned version; count/stock
  merges additive (audited).
- **Acceptance:** offline edits persist and replay on reconnect; two
  terminals converge on the same state; conflicts resolve deterministically.

---

## Phase 3 — G9 full browser E2E (F13)

Run after Phase 0–1 land (i18n changes the UI text; test after, not before).

- Browser-driven coverage (agent-browser/Playwright) across: Inventory
  (add/edit/restock), Customers, Prescriptions, Sales + payment completion,
  Shifts (open/close drawer, X/Z), Reports, History/audit, Settings,
  role-restricted actions per role, and Realtime convergence between two
  browser sessions. Evidence into `outputs/e2e/`.
- Mark G9 `[x]` in `GATES.md` only when every item above has evidence.

---

## Phase 4 — P1 operational UI on existing models (F14)

Not defects — the roadmap tranche on top of the seeded data models. Ordered by
revenue/ops value. Each item: UI + report + gate, models already exist:

1. **Till ops:** X/Z report UI, drawer open/close, void-with-manager-approval,
   refund flow (reason + restock decision).
2. **Clinical at checkout:** wire `findInteractions` + `allergyConflicts` into
   the sale flow with pharmacist-override documentation; add duplicate-therapy
   / refill-too-soon checks.
3. **Supply-chain finance UI:** create/receive PO with batch+expiry entry,
   AP payment screen, AP report (aging buckets, projected cash-out),
   expense entry, P&L.
4. **UOM at register:** UOM picker, per-UOM price, UOM on receipts.
5. **Prescriber directory UI** + per-prescriber Rx history.
6. **Generic substitution prompt at till** + DAW on Rx/receipt.
7. **Waiting bin / charge-on-pickup** payment flow.
8. **Patient–lot recall lookup** UI.
9. **Category tree + roll-up reporting** (nested categories in DB).
10. **Reports + exports:** profit margin, COGS/valuation, purchase history,
    sales-by-hour/tender/staff, CSV/Excel export for every report.

Each ships with its own gate under `gates/` and browser evidence. Priority
follows FEATURES.md (Stripe and tax configuration remain **excluded by
decision** — F14 never reopens them).

---

## Phase 5 — P2 (deferred, tracked in FEATURES.md)

Notifications (SMS/email), promotions engine, configurable loyalty UI,
vaccination records, consignment stock, delivery module polish, patient
leaflets, custom report builder, accounting export, supplier performance,
customer LTV, expiry value-at-risk, landed cost, item images, near-expiry
markdown suggestions, free/sample stock, kit item tree, touch-flow
optimization. No work until Phase 0–4 is closed; each item gets a gate when
started.

---

## Cross-cutting rules

- **One commit per finding or cohesive group**, conventional message, gate
  updated in the same commit; no agent-attribution trailers.
- **Key-set parity invariant** for `en.json`/`ar.json` (F3) and **no demo
  write to real DB** (F2) are lint-able — add checks once ESLint exists
  (Phase 2.4) or as scripts before that.
- Verification is evidence-based: browser screenshots for UI changes
  (`outputs/e2e/`), `npm run typecheck`/`build`/`test` for code.
- Anything labeled "gap/not a defect" (F11, F14) stays in the plan; nothing
  is silently dropped.
