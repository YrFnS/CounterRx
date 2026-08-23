# COMPLETE-BUILDOUT-PLAN.md — CounterRx full gap closure
_Created 2026-08-23. Sources: MISSING-FEATURES.md audit (32 transcripts, 8 branches, 9 root plans) + outstanding user requests. Execution: parallel agent waves in git worktrees; coordinator merges, gates, deploys, verifies live._

**Conventions for every task:** conventional commits · no AI-attribution trailers · i18n en+ar for every string · `npm run typecheck && npm run test && npm run build` green before commit · migrations pushed to live remote in order · seeds set `organization_id='00000000-0000-0000-0000-000000000001'` explicitly · gates updated in same commit · grep-gate/i18n-parity tests must stay green.

---

## WAVE 1 — directly requested + high-value, independent files

### W1.1 Pay later / minimal AR ✦ branch `feat/pay-later-ar` — DONE
User asked "can we pay later?" — FIX-PLAN-2 R6, never started.
- New `PayMethod` value `"pay_later"` (src/data.ts). Requires customer attached (else block with toast).
- Payment modal: Pay later leg option with due-date picker (default +14d); manager-or-owner perm optional per spec — allow cashier, flag requiresCustomer.
- Outstanding balance = sum of unsettled `pay_later` legs across transactions (compute from state.transactions payments[] JSONB — **no migration**).
- Customer profile (Customers view): balance display + History filter "unsettled".
- Settle flow in History row action: collect payment (method + ref), append settling leg, mark original leg settled (`settledAt`) inside JSONB.
- Receipt shows PAY LATER DUE notice. Tests: settle math, unsettleable-without-customer, double-settle guard.

### W1.2 Excel export ✦ branch `feat/excel-export` — DONE
- Reports (and Finance where CSV exists): add `.xlsx` export beside CSV using `xlsx` (SheetJS CE) — only new dependency allowed this wave.
- One helper `src/lib/export.ts` (buildXlsx(rows, filename)) reused everywhere; column headers localized via existing t() labels.
- Coverage: sales history, till reports, inventory valuation, reorder suggestions, suppliers list, AR aging (from W1.1 output shape once merged — leave a TODO hook if W1.1 not yet merged).
- Test: helper produces non-empty workbook buffer for sample rows.

### W1.3 Prescriber directory ✦ branch `feat/prescriber-directory` — DONE
Data model exists (`Prescriber`, synced table). Build UI:
- Prescriptions view: new "Prescribers" tab — searchable card/table list (name, credentials, specialty, NPI, DEA masked, phone, fax, active), create/edit/archive modal (perm `manage_settings` or pharmacist), per-prescriber Rx history drawer (filter state.prescriptions by prescriberId).
- Store: PRESCRIBER_SAVE/PRESCRIBER_DELETE (archive-guard like suppliers: block delete when prescriptions reference), audit entries. sync.ts already persists prescribers — mapper needs `archived` parity with suppliers approach.
- i18n `prescribers.*`. Tests: reducer save/delete/guards.

### W1.4 Register clinical workflows ✦ branch `feat/register-clinical` — DONE
Two flows touching Register/modals (single owner avoids conflicts):
- **Generic substitution prompt**: when adding an Rx product that has `genericOf`/is brand with cheaper generic in stock, show inline prompt (dispense generic / DAW). Persists existing `daw`/`substitutedFrom` TxLine fields. i18n keys.
- **Waiting-bin charge-on-pickup**: prescription in `waiting_bin` status gets "Charge on pickup" action → creates cart pre-filled from Rx (qty, price), links customerId, marks Rx `ready→dispensed` on sale completion. Uses existing fields only.

### W1.5 Branches DB-backed + Suppliers page promotion ✦ branch `feat/db-branches` — DONE
- Migration `20260823000014_branches.sql`: `branches` table (id text pk, name, address, phone, active bool, organization_id uuid default current_org_id(), sort int), RLS mirroring categories, seed with current HOME_BRANCH value. Push to live.
- Replace `BRANCHES` const in src/data.ts: hydrate through sync TABLES (`branches`), store state.branches, transfer pickers read runtime list; keep constant as seed fallback only. Retire `HOME_BRANCH` into org settings field `homeBranchId`.
- **Suppliers promotion**: Inventory suppliers manager becomes a first-class tab (full page table + form) instead of toolbar modal, per user's "supplier need page".
- outputs/hardcoded-audit.md updated (BRANCHES resolved).

## WAVE 2 — reporting depth + safety

### W2.1 Nested categories + roll-ups ✦ `feat/category-tree`
Migration 0015: `parent_id text references categories(id)` + tree helpers; Settings CategoriesTab gains parent picker (depth ≤2); Register/Inventory/Dashboard/Reports roll up child totals into parents. Live-push + seed parenting.

### W2.2 Patient–lot recall lookup ✦ `feat/recall-lookup`
Inventory/Reports: enter lot/batch → returns patients (customers) who received units from that lot via `TxLine.alloc`, with qty/date; printable contact sheet + CSV/XLSX export.

### W2.3 Multi-terminal X/Z + reconciliation ✦ `feat/terminal-recon`
Shift records already carry terminalId: Till/History shift summary gains per-terminal breakdown, expected-vs-counted variance report, end-of-day all-terminals Z. No migration.

### W2.4 Custom report builder ✦ `feat/report-builder`
Reports: date-range + filters (category, supplier, cashier, method, Rx/OTC) applied across existing tabs; save/load named views into org settings JSONB (no migration); export respects filters.

### W2.5 Backups + org export ✦ `feat/backups-org-export`
Scheduled local backup (daily auto-download prompt / localStorage rotation) + full-org export bundle (every synced table → single JSON + optional CSVs) + restore validation. Restore-drill doc in README.

## WAVE 3 — engagement + resilience

### W3.1 Notifications framework ✦ `feat/notifications`
Provider-agnostic sender interface (`src/lib/notify.ts`) with console/stub backend; org settings toggles + template strings (i18n); triggers: Rx ready, refill due, credit balance low. [EXTERNAL] real Resend/Twilio later — drop-in adapter point documented. Log table `notification_log` (migration 0016) so history is auditable.

### W3.2 Delivery module (patient deliveries) ✦ `feat/delivery-module`
Build on Deliveries: patient delivery intake from sale (address book reuses customer.address), driver assignment from staff roster, route list view, POD capture (existing proof field), fee policy in settings.

### W3.3 Offline queue + conflict UX ✦ `feat/offline-queue`
`sync_queue` localStorage/outbox table (migration 0017 optional), LWW by `updatedAt`, conflict banner with keep-local/keep-remote choice; replaces best-effort warn path. Gates: offline-outbox.md updated with real queue evidence.

### W3.4 Promotions engine (beyond coupons) ✦ `feat/promotions`
Rules: birthday reward, first-visit, category % off window; stored in settings/promotions table (migration 0018); auto-applies at register with audit + manager override. Builds on coupon apply path.

### W3.5 Vaccination records ✦ `feat/vaccinations`
Migration 0019 `vaccinations` (patient, product, lot, dose#, site, administrator, date, next_due); Customers profile tab + due-list report; CDC-style card print.

### W3.6 Full patient profiles ✦ `feat/patient-profiles`
Customers: structured med history (from dispensed Rx), allergies editor improvements, conditions list, notes timeline; print patient profile.

### W3.7 CSV catalog import ✦ `feat/catalog-import`
Inventory: import products/CSV with column mapping preview, validation report, dry-run mode; matches export headers.

### W3.8 NDC live lookup ✦ `feat/ndc-lookup`
Replace fake `NDC_DIRECTORY` with RxNorm/openFDA API lookup (free, no key) + cache table (migration 0020); graceful offline fallback to cached/local directory. Flag in settings.

## WAVE 4 — platform + external integrations (adapters/sandbox first)

### W4.1 Claims adapter interface + sandbox ✦ `feat/claims-adapter`
[EXTERNAL] Real NCPDP D.0 needs a trading-partner gateway. In-repo: `src/lib/claims.ts` interface (submit/adjudicate/reverse), keep current simulation behind `settings.claimsMode: "sandbox"`; `rx_claims` lifecycle table (migration 0021) + Claims tab in Prescriptions (submitted/paid/rejected/resubmit). Production switch documented, blocked on partner account.

### W4.2 Eligibility adapter stub ✦ `feat/eligibility-stub`
Interface + sandbox responder; card-scan capture field on customer insurancePlan; real-time payer connection deferred [EXTERNAL].

### W4.3 E-prescribing readiness ✦ `docs/eprescribe-readiness`
Surescripts/EPCS requirement doc + inbound RxMessage parser skeleton + storage mapping to prescriptions; outbound new-Rx payload builder behind interface. Certification impossible without account — code seam only.

### W4.4 Platform admin console ✦ `feat/platform-admin` (last, large)
Super_admin-only org list, suspend, feature flags; tenant provisioning wizard + bulk staff/catalog import. Requires auth-domain refactor (org claim) — schedule after W1–W3 stable.

### W4.5 Accounting export ✦ `feat/accounting-export`
QuickBooks/Xero-compatible CSV exports of daily sales, expenses, AP from existing data; Finance tab buttons.

### W4.6 Ops hardening ✦ `feat/ops-hardening`
Sentry (@sentry/react) behind `VITE_SENTRY_DSN` flag-off default; error boundary improvements; CI uploads test/build artifacts.

## USER ACTION ITEMS (cannot be done from repo)
1. Provide `OPENROUTER_API_KEY` → coordinator runs `supabase secrets set` + deploys `ai-proxy` (unblocks OCR/forecast/anomaly — currently NOT_FOUND live).
2. Choose notification provider (Resend/Twilio) + keys when W3.1 lands (stub works meanwhile).
3. NCPDP trading-partner account for real claims (W4.1 stays sandbox until then).
4. Surescripts/EPCS certification decision (W4.3).

## EXECUTION ORDER & MERGES
Waves sequential; within a wave agents run parallel on disjoint files (assignments above deliberately partition Register/Inventory/Prescriptions/Reports ownership). Coordinator merges wave branches in listed order, resolves locale unions (rebuild-union script from 3abfac0 lesson), runs full gates + live headless E2E per wave, deploys once per wave.

## STATUS TRACKING
Checkboxes per task get ticked here as waves land; per-task commits referenced in gate files as usual.
