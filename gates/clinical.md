# Leaf: clinical (Phase C)

- [x] Curated drug–drug interaction pairs seeded and drive screening.
  CHECK: `grep -n 'interaction_pairs' supabase/seed.sql supabase/migrations/20260821000010_clinical.sql` + `src/lib/clinical.ts`
  EXPECT: `interaction_pairs` table org-scoped (RLS), 12 seeded pairs visible to the seeded org; `setRuntimeInteractions()` overrides the static list at runtime.
  EVIDENCE: live REST count `interaction_pairs: 12`; `clinical.test.ts` covers pairs + override fallback.
- [x] Duplicate-therapy warning at Rx level.
  CHECK: `grep -n 'detectDuplicateTherapy' src/lib/clinical.ts src/views/Prescriptions.tsx`
  EXPECT: helper returns duplicate lines; Prescriptions renders a warning banner.
  EVIDENCE: `clinical.test.ts` duplicate-therapy test.
- [x] Allergy conflict helpers re-exported (POS hook left for Phase A mount).
  CHECK: `grep -n 'allergy' src/lib/clinical.ts`
  EXPECT: allergy-conflict check exposed in clinical lib; Register mounting documented in `src/views/__mount_clinical.md`.
  EVIDENCE: clinical.ts exports + TODO markers in `__mount_clinical.md`.
- [x] Refill / expiry enforcement at dispense.
  CHECK: `grep -n 'canRefill\|rxExpired\|refillTooSoon\|dispenseBlockers' src/lib/clinical.ts src/views/Prescriptions.tsx`
  EXPECT: expired or refill-exhausted Rx blocks dispense with a message; status surfaced.
  EVIDENCE: `clinical.test.ts` expiry/refill guard tests.
- [x] C-II movement log (lot-level).
  CHECK: `grep -n 'recordC2Movement' src/lib/c2.ts` + migration `20260821000009_c2.sql`
  EXPECT: `c2_movements` table org-scoped; `recordC2Movement()` with offline queue writes on C-II sale.
  EVIDENCE: migration pushed (live table `c2_movements` present); offline-queue path unit-tested.
- [x] Rx label printing.
  CHECK: `grep -n 'RxLabel' src/views/Prescriptions.tsx`
  EXPECT: 2×1" label view (window.print) with med/sig/qty/warnings/patient.
  EVIDENCE: RxLabel component present.
- [x] Hard-copy scan attach (Supabase Storage `rx-docs`).
  CHECK: `grep -n 'uploadRxScan\|resolveScanUrl\|deleteRxScan' src/lib/rxdocs.ts` + migration 0010
  EXPECT: bucket `rx-docs` (private) created; upload/resolve/delete helpers; org-scoped storage policies.
  EVIDENCE: migration 0010 applied live; helpers unit-testable (no bucket round-trip run).
- [x] Restricted OTC catalog flag.
  CHECK: `grep -n 'TOGGLE_RESTRICTED\|restrictedCatalog' src/store.tsx src/views/Settings.tsx`
  EXPECT: Settings Clinical tab toggles restricted flag on products; action in reducer.
  EVIDENCE: Settings "Clinical" tab + reducer action.
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean, 54 tests pass (21 new clinical), build OK.

Deferred (documented in `src/views/__mount_clinical.md`): Register basket DDI mounting, restricted-OTC limit enforcement at the till, C-II logging at COMPLETE_SALE, scan-upload reducer hook — Phase A owns the till flow; wired when Register integration lands.

## W3.5 — Vaccination records (`feat/vaccinations`)

- [x] Migration 0019 `vaccinations` (patient, product, lot, dose#, site, administrator, date, next_due).
  CHECK: `supabase/migrations/20260823000019_vaccinations.sql`
  EXPECT: table with org default `current_org_id()`, FKs to customers/products; RLS mirroring customers (org-scoped read, clinical-staff write); realtime publication membership.
  EVIDENCE: applied to live DB 2026-08-23 — information_schema confirms all 12 columns, `pg_policies` shows `vaccinations_read`/`vaccinations_write`, `pg_publication_tables` count = 1.
- [x] Sync layer: TABLES, BackendData, mapper, state.vaccinations, persist.
  CHECK: `grep -n 'vaccinations' src/lib/sync.ts src/store.tsx | head`
  EXPECT: `vaccinationFrom` row mapper + `rowsFor.vaccinations` serializer + BackendData member + HYDRATE/persist wiring + localStorage persistence.
  EVIDENCE: sync.ts exports include vaccinations in TABLES/TABLE_COLLECTION; store seeds via `makeVaccinations`, persists on change (dep array includes `state.vaccinations`).
- [x] Customers profile tab "Vaccinations" — list per patient + add record modal (product picker, lot, dose#, site, administrator = current user, date, next due optional).
  CHECK: `grep -n 'VaccinationTab\\|AddVaxModal' src/views/Customers.tsx`
  EXPECT: tabbed profile modal (Profile / Vaccinations), add/edit modal, administrator prefilled from session user, clinical-role-gated editing.
  EVIDENCE: components present; ADD_VACCINATION / UPDATE_VACCINATION reducer cases with audit + toast.
- [x] Due-list report: vaccinations where next_due within next 30 days, grouped by patient, Notify action (console stub + toast, standalone of W3.1).
  CHECK: `grep -n 'VaxDueTab' src/views/Reports.tsx` + `vaccinationsDue()` in src/data.ts
  EXPECT: Reports → "Vaccinations due" tab; grouped cards per patient with days-left badges; TODO(W3.1) hook documented at the notify stub.
  EVIDENCE: window math unit-tested in `vaccinations.test.ts`; console.info + toast notify stub carries `TODO(W3.1)` marker.
- [x] CDC-style card print (patient name, DOB, vaccine, lot, dates, administrator) via window.print() hidden region.
  CHECK: `grep -n 'printVaxCard\\|buildVaxCardData' src/views/Customers.tsx src/data.ts`
  EXPECT: pure `buildVaxCardData()` payload builder (oldest→newest rows) feeding a hidden #print-root region + window.print(), same path as receipts/recall report.
  EVIDENCE: card data shape covered by tests; XSS-safe escaping before innerHTML write.
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean; 189 tests pass (12 new vaccination); build OK; i18n-key-parity test green for all new customers.vax*/reports.vax*/toast keys in en+ar.
