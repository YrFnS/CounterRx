# AUDIT-UI-FIXES-PLAN.md — Post-deploy cleanup & feature fixes ✅ COMPLETE (2026-08-22)

Shipped through commit `c039947` on main; deployed to https://counterrx.vercel.app.
P0 root cause: page refresh never recovered the Supabase session (`backendAuthenticated` reset to false with no re-check), so the app silently ran on seed data. Fixed via `getSessionStaffId()` + reboot re-auth in `PosProvider`.

Source: user review of https://counterrx.vercel.app (screenshot 2026-08-22) + code audit.
Every item lists the exact files touched. One commit per phase; gates updated in the same commit.

---

## Answers to the direct questions (no code needed)

| Question | Answer |
| --- | --- |
| Return for **selling**? | **Yes — already implemented.** History → any sale → Refund (reason required, permission-gated `refund`: manager/pharmacy_admin, creates negative transaction linked via `refundOf`, restocks lots). |
| Return for **buying**? | **Yes — already implemented.** Inventory → lot → RTV (return-to-vendor): deducts lot qty, books AP credit against the supplier, audit-logged. |
| Open/close shift? | **Yes — already implemented.** Till → Open shift (opening float) / Close shift (counted cash + variance), plus X and Z reports and the full shift ledger (Phase A). |
| Is the app on Supabase, not localStorage? | Yes by design: after login the store hydrates every collection from Supabase (`loadBackendData`) and persists each mutation back (`persistBackendData`). localStorage is only an offline cache. **But see P1 — hydration currently fails silently on prod and falls back to seeded local data, which is exactly the "fake data" impression. That bug is the root cause and is fixed first.**

---

## P0 ✅ — Fix "Backend unavailable — showing local data" on production  🔴 ROOT CAUSE

The banner means `loadBackendData()` failed or returned an empty tenant, so the app fell back to
the local seed. On the Vercel deployment this must never be the steady state.

**Diagnose first** (before touching code):
- [ ] Load https://counterrx.vercel.app, sign in, capture network tab: does `GET /rest/v1/*` return 200, 401 (bad/missing anon key env), or 0 rows (RLS filters everything because request is unauthenticated / `current_org_id()` NULL)?
- [ ] Confirm `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are actually baked into the deployed bundle (they are — verified in `assets/index-*.js`) and match the live project `edxsfekxnkhhugejfoqi`.
- [ ] Check RLS policies for anon/authenticated reads on tenant tables; check whether hydration runs before `signInWithPassword` resolves so requests go out unauthenticated.

**Fix whichever branch fails**, then change behavior so this state is loud, not quiet (P5 covers UX):
- Acceptance: fresh signed-in session on prod shows zero banner; DevTools shows successful REST reads; a sale created on prod appears in Supabase `transactions` within seconds.

## P1 ✅ — Quick removals (one commit)

| Item | Location | Action |
| --- | --- | --- |
| "SCANNER LIVE" chip | `src/views/Register.tsx:230` | Delete the `<span className="scan-chip …">SCANNER LIVE</span>` block (scanner still works — hardware input into the search box). |
| "v3.0 · local ledger" corner label | `src/App.tsx:325`, key `common.versionLedger` in both locales | Replace with a real connection badge: "Supabase · connected" (pine dot) vs "Reconnecting…" (amber) driven off `state.backendOffline`. Never says "local ledger". |
| "Reset demo data" button | `src/App.tsx:321-324`, `RESET` case `src/store.tsx:1542`, keys `common.resetDemoData*` | Remove the sidebar button and the `RESET` action entirely. It only wiped local state and reseeded mocks — meaningless and dangerous-looking on a live DB. |
| Notification/toast defect | `src/ui.tsx` ToastHost | **User-confirmed:** toasts cover the Register action bar (customer & sort buttons). Fix: render toasts top-center directly under the TopBar (empty space), stack downward; errors stay 6s; max-width wrap; RTL-safe. |

- Acceptance: none of the three strings exist anywhere in the bundle; i18n parity test green; toast fix visible.

## P2 ✅ — Remove tax

Tax was hardcoded at 8% (`TAX_RATE = 0.08`, `src/data.ts:780`). Removing:

- [ ] `cartTotals()`: drop tax math — `tax: 0` always (keeps the transaction shape stable).
- [ ] Register cart footer + payment modal + receipt rendering: remove Tax rows.
- [ ] Reports/Dashboard/Finance/Z-report: remove tax lines from summaries (net = subtotal − discounts).
- [ ] `sync.ts`: keep mapping but always write `tax: 0` — **DB columns stay** (non-destructive; historical rows keep their stored values).
- [ ] Customers' `taxExempt` flag: leave in place (harmless, clinic accounts still meaningful if tax returns).
- Acceptance: no UI surface shows tax; totals = subtotal − discounts; all tests updated; typecheck/build green.

## P3 ✅ — Discounts: per-item and per-invoice

Currently only invoice-level **%** discount + coupons exist. Add:

- [ ] **Line discount**: each cart line gets editable discount (amount or %, toggle) — new `discount?: { mode: "amt"|"pct"; value: number }` on cart lines; `cartTotals()` subtracts per line; receipt prints discounted unit price.
- [ ] **Invoice discount**: keep existing % field, **add fixed-amount mode** (same `{mode,value}` shape).
- [ ] Permission guard: discounts above a threshold (e.g. >10% line or >20% invoice) require manager PIN re-entry (reuse existing PIN verify helper).
- [ ] Lines are JSONB in `transactions.lines` → **no migration needed**; extend `sync.ts` line mapper.
- [ ] Audit entry records who applied which discount.
- Acceptance: apply $5 off a $20 item and 10% off invoice → totals correct on screen, receipt, History detail, and Supabase row. Unit tests for mixed coupon+line+invoice discounts.

## P4 ✅ — Dynamic categories

`CategoryId` is a hardcoded union + `CATEGORIES` const (`src/data.ts:6-33`) consumed by Register, Inventory, Dashboard, Finance, Reports.

- [ ] Migration `…_categories.sql`: `categories` table (id uuid pk default gen_random_uuid(), org_id, name text unique per org, color text, sort int, archived bool) + RLS + seed the current ~12 categories with stable slugs.
- [ ] Product `category` column becomes `text` (slug) — products carry their old slug values unchanged.
- [ ] `CATEGORIES` const → loaded from state like other collections; `catLabel/groupOf` read runtime list; group roll-ups become optional tags on categories (`group` text column).
- [ ] Settings → new Categories section: add / rename / recolor / archive. Archive hides from new products, keeps history.
- [ ] Product form + inventory filters + register chips populate from DB list.
- Acceptance: admin adds "Cosmetics" in Settings → it appears in the product form and register filter immediately after persist; existing products unaffected.

## P5 ✅ — Mock/hardcoded data sweep + honest failure states

After P0, the app is genuinely backend-driven; this phase removes the remaining fakes so nothing can render invented data again:

- [ ] `seed()` mega-dataset stays ONLY as the pre-auth/offline-dev fallback path; when authenticated hydration fails, replace silent fallback with a full-screen "Can't reach pharmacy database — Retry / Sign out" state (no demo rows on screen). 
- [ ] Delete/neutralize hardcoded constants that pretend to be data: `STORE` (use `settings.orgName/branch/address/phone` everywhere incl. receipts/labels), `DRIVERS` (deliveries get driver from staff list), `CASHIER` constant in refund path (use actual signed-in user), demo audit row `"Ledger initialized — demo dataset v10"`.
- [ ] Grep-gate: add a lint/test asserting no `Branch 04`, `Maple Avenue`, `demo dataset`, `SCANNER LIVE` strings ship in `src/` outside test fixtures.
- [ ] Receipts/invoices print org data from Settings only.
- Acceptance: signing in on a freshly-wiped browser shows only DB rows; grep gate passes; every rendered name traces to a Supabase table or user-entered settings.

## P6 ✅ — Verification & redeploy

- [ ] `npm run typecheck && npm run test && npm run build` per commit.
- [ ] Push any migrations to live remote in order (explicit `organization_id` in seeds!).
- [ ] Deploy to Vercel, then live smoke: sign in s001 → no banner → open/close shift → sell item with line+invoice discount → refund it → RTV a lot → add category → confirm rows land in Supabase REST.
- [ ] Update gates: `store-auth.md` (banner semantics), `till-ops.md` (discount thresholds), `e2e-quality.md` (grep gate).

---

## Order & risk

P0 → P1 → P2 (small) → P3 (medium) → P4 (medium, migration) → P5 (depends on P0) → P6.
Biggest risks: P0 may reveal an RLS/env misconfig on the live project (fix before anything else ships);
P4 touches five views — keep the union→string change mechanical.
