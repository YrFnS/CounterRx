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

## W3.6 Full patient profiles (`feat/patient-profiles`)

- [x] Structured med history derived read-only from the ledger.
  CHECK: `grep -n 'export function medHistory' src/data.ts`
  EXPECT: derives product/qty/date/rxRef from dispensed Rx (name-matched) + ℞ sale lines (customerId-matched), refunds excluded, newest first; ProfileModal renders it.
  EVIDENCE: `patient-profiles.test.ts` — derivation, ordering, refund exclusion.
- [x] Allergies editor: structured entries (allergen/severity/reaction) with add/remove/archive; legacy strings still screen.
  CHECK: `grep -n 'AllergyEntry\|normalizeAllergies' src/data.ts src/views/Customers.tsx`
  EXPECT: `allergyConflicts` accepts strings + entries, archived never screen; Register + Prescriptions call sites unchanged (severity now propagated).
  EVIDENCE: `patient-profiles.test.ts` — add/remove round-trip, legacy-string conflicts, archived exclusion.
- [x] Register allergy warning at dispensing reuses the existing check.
  CHECK: `grep -n 'allergyConflicts' src/views/Register.tsx`
  EXPECT: cart-conflict banner unchanged, now severity-aware via shared helper.
  EVIDENCE: typecheck green across both call sites after `AllergyInput` widening.
- [x] Conditions list with optional ICD-style code + notes timeline (newest first).
  CHECK: `grep -n 'PATIENT_CONDITIONS\|ADD_PATIENT_NOTE' src/store.tsx`
  EXPECT: reducer actions persist `conditions` / `patientNotes`; note author from session staff; blank notes rejected.
  EVIDENCE: `patient-profiles.test.ts` — conditions store/clear, timeline ordering + authorship.
- [x] Print patient profile (demographics + meds + allergies + conditions + notes).
  CHECK: `grep -n 'PrintProfile\|patientProfilePayload' src/views/Customers.tsx src/store.tsx`
  EXPECT: hidden `#print-root` sheet rendered via portal, sole visible region under `@media print`; payload built by shared `patientProfilePayload()`.
  EVIDENCE: `patient-profiles.test.ts` — payload assembly + unknown-customer null.
- [x] Migration pushed live + i18n parity.
  CHECK: `supabase/migrations/20260823000020_patient_profiles.sql`
  EXPECT: `conditions jsonb default '[]'`, `patient_notes jsonb default '[]'` on customers; sync mapper reads/writes both columns; every new string keyed in en.json + ar.json.
  EVIDENCE: pushed live 2026-08-23 ("Applying migration 20260823000020_patient_profiles.sql… Finished supabase db push"); PostgREST resolves both new columns (bogus-column control 42703); i18n-key-parity gate passes.

Full gate: `npm run typecheck && npm run test && npm run build` — typecheck clean, 184 tests pass (7 new patient-profiles), build OK.
