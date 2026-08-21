# Phase C — Clinical Wiring (isolated worktree)

> Branch: `feat/phase-c-clinical` · Base: `20260821000007_ai_log.sql`
> All deliverables below are **decoupled** — no Phase A-owned files were edited.
> Phase A integration points are marked with `TODO(Phase A)` markers.

## What's implemented

### §1 — Drug–drug interactions
- **`INTERACTIONS`** in `src/data.ts` expanded from 11 → 20 pairs (9 additional moderate pairs).
- **`findInteractions(ids)`** now consults a runtime override (`setRuntimeInteractions`) before
  falling back to the in-memory constant — works offline with the seed, swaps to the
  `interaction_pairs` table rows when online.
- **`interaction_pairs`** table + seed (migration `0010_clinical.sql`) — 20 rows, RLS-gated to
  clinical staff. Loaded by `sync.ts` → `setRuntimeInteractions()`.
- Tests: `src/__tests__/clinical.test.ts` — 21 tests covering pair detection, override swap,
  fallback, and all 20 pairs have valid fields.

### §2 — Duplicate therapy detection
- **`detectDuplicateTherapy(ids, products)`** in `src/lib/clinical.ts` — flags two products in
  the same therapeutic category prescribed together. O(n) scan via category index.
- Integrated into `PrescriptionCard` — shows a honey-amber warning banner and blocks dispense.

### §3 — Allergy conflicts (pre-existing, re-exported)
- **`allergyConflicts(allergies, product)`** was already in `data.ts` — re-exported from
  `clinical.ts` so Prescriptions.tsx imports one place.
- Pharmacist-only override UI already exists in PrescriptionCard.

### §5 — Refill / expiry enforcement
- **`canRefill(rx)`**, **`rxExpired(expiry)`**, **`refillTooSoon(rx)`**, **`dispenseBlockers(rx)`**
  in `src/lib/clinical.ts`.
- **`PrescriptionCard`** dispense button is now **disabled** when any blocker fires
  (expired Rx, no refills, already dispensed, refill too soon, major interaction,
  duplicate therapy, or unresolved allergy). Human-readable tooltip explains why.
- Seed prescriptions include edge cases: RX-2431 (0 refills), RX-2429 (expired), RX-2428
  (refill too soon — 1 day after dispense, 30-day supply).

### §4 — C-II compliance
- **`c2_movements`** table (migration `0009_c2.sql`) — DEA movement log with org_id, direction,
  qty, patient, pharmacist, DEA number. RLS: clinical staff can insert, anyone in-org can read.
- **`recordC2Movement(input)`** in `src/lib/c2.ts` — persists to the table; falls back to a
  `localStorage` pending queue when offline. Includes `isC2()` helper and `c2MovementsFor()`.
- Seed: sample dispense/receive movements for `oxy30`.
- Added C-II products `oxy30` (Oxycodone 30mg) and `mor15` (Morphine 15mg) to seed data +
  `makeProducts()`.

### §7 — Hard-copy scan → Supabase Storage
- **`rx-docs`** storage bucket (migration `0010_clinical.sql`) with RLS policy.
- **`uploadRxScan(rxId, dataUrl, patientName)`** in `src/lib/rxdocs.ts` — uploads the resized
  JPEG data-URL from the existing scan flow to the bucket, returns the storage path.
- **`resolveScanUrl(scan)`** — resolves storage paths to public URLs; data-URLs pass through.
- **`deleteRxScan(path)`** — for scan replacement.
- TODO(Phase A): Wire `uploadRxScan` into the `SCAN_ATTACH` reducer so the prescription's `scan`
  field swaps from data-URL to storage path on successful upload. Currently the data-URL
  stays in the local record (offline-safe).

### §3/§6 — Rx label printing
- **`RxLabel`** component in `Prescriptions.tsx` — printable 2×1" thermal label via hidden iframe
  with `@page { size: 2in 1in; }`. Renders drug name, qty, patient, sig, refills, expiry, terminal.
- "Label" button appears on dispensed Rx cards → opens label modal → "Print label" triggers
  browser print dialog scoped to the iframe.

### §3/§4 — Restricted OTC catalog editor
- New **"Clinical" tab** in `Settings.tsx` — admin-only, lists all products with `restricted`
  set, shows `limitPerSale` per product, toggle via checkbox.
- **`TOGGLE_RESTRICTED`** reducer action in `store.tsx` — updates the product's `restricted` flag.
- TODO(Phase A): Register `interaction_pairs` and `c2_movements` in the sync `TABLES` list and
  the `rowsFor()` serializer — **already done** — so they persist on backend save.

## Pending Phase A integration (not started — Register.tsx is Phase A-owned)

| TODO | What Phase A must wire | File |
|---|---|---|
| `TODO(Phase A)` | Call `recordC2Movement()` at `COMPLETE_SALE` for C-II products. | `Register.tsx` |
| `TODO(Phase A)` | Mount `findInteractions()` + `detectDuplicateTherapy()` + `allergyConflicts()` on the Register basket (interaction badges currently only show major DDI). | `Register.tsx` |
| `TODO(Phase A)` | Enforce the `restricted.limitPerSale` cap at the till — the flag exists, Settings edits it, Register must cap the cart line and write to `restricted_log`. | `Register.tsx` |
| `TODO(Phase A)` | `SCAN_ATTACH` in `store.tsx` → call `uploadRxScan()` after storing the data-URL; swap to storage path on success. | `store.tsx` |

## Files created
- `supabase/migrations/20260821000009_c2.sql`
- `supabase/migrations/20260821000010_clinical.sql`
- `src/lib/clinical.ts`
- `src/lib/c2.ts`
- `src/lib/rxdocs.ts`
- `src/__tests__/clinical.test.ts`

## Files modified (Phase A files untouched)
- `src/data.ts` — expanded INTERACTIONS (11→20 pairs), added `setRuntimeInteractions()` + runtime override, added `oxy30`/`mor15` products
- `src/store.tsx` — added `interactionPairs` to State/seed/load/HYDRATE_BACKEND, `TOGGLE_RESTRICTED` action, `setRuntimeInteractions` call on hydrate
- `src/lib/sync.ts` — added `interaction_pairs` to TABLES, BackendData, load/persist
- `src/views/Prescriptions.tsx` — dispense guards, interaction/duplicate banners, RxLabel component
- `src/views/Settings.tsx` — Clinical tab with restricted OTC catalog editor
- `supabase/seed.sql` — C-II products, interaction_pairs seed, c2_movements sample
- `src/locales/en.json` + `src/locales/ar.json` — `settings.clinical`, `settings.restrictedCatalog`
