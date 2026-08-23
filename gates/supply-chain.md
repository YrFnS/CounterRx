# Leaf: supply-chain (Phase B)

- [x] UOM per product — sell in packs, stock stays in base units.
  CHECK: `grep -n 'SAVE_UOMS\|SET_LINE_UOM\|uoms' src/store.tsx src/views/Inventory.tsx src/views/Register.tsx`
  EXPECT: `SAVE_UOMS` persists `uoms` JSONB on the product; register cart line carries `uom`; qty buttons and per-UOM barcode convert through the pack `factor` at sale time; stock/batches remain in base units.
  EVIDENCE: `UomModal` in Inventory (code/label/factor/price/cost/barcode rows, uniqueness validation), UOM picker on Register cart lines, `supply-chain.test.ts` asserts factor conversion.
- [x] Per-lot cost at receive drives FIFO margin and RTV valuation.
  CHECK: `grep -n 'RESTOCK\|cost' src/store.tsx src/views/Inventory.tsx src/data.ts`
  EXPECT: `RESTOCK` accepts a `cost` and stores it on the Batch; sale margin uses allocated lot cost; lot rows show a cost badge when it differs from product default cost.
  EVIDENCE: `ReceiveModal` passes per-lot cost; `supply-chain.test.ts` asserts FIFO margin with distinct lot costs.
- [x] RTV deducts from lot and books AP credit.
  CHECK: `grep -n 'RTV\|AP_CREDIT' src/store.tsx src/views/Inventory.tsx`
  EXPECT: `RTV` action removes units from the chosen lot, computes credit at lot cost, books it against the supplier's open invoice (or logs an AP-credit audit entry when none is outstanding); modal requires a reason.
  EVIDENCE: `RtvModal` in Inventory; `supply-chain.test.ts` asserts lot deduction + open-invoice credit.
- [x] Recall traces dispensed patients per lot.
  CHECK: `grep -n 'patientsForLot' src/data.ts src/views/Inventory.tsx`
  EXPECT: `patientsForLot(transactions, productId, batch)` walks `TxLine.alloc` and returns deduped patient hits sorted newest-first; LotTraceModal renders the trail.
  EVIDENCE: `supply-chain.test.ts` asserts patient dedup/order; `LotTraceModal` uses the helper.
- [x] Expiry write-off removes lot with manager approval.
  CHECK: `grep -n 'WRITE_OFF' src/store.tsx src/views/Inventory.tsx`
  EXPECT: `WRITE_OFF` rejects for cashiers, removes the lot with a valid manager PIN, and audit-logs `WRITE-OFF` with reason + approver.
  EVIDENCE: `WriteOffModal` in Inventory (manager-PIN gate mirroring Phase A void — in-app authorization, unrelated to the email/password login); `supply-chain.test.ts` asserts both reject and approve paths.
- [x] Cold-chain flag + temperature log.
  CHECK: `grep -n 'cold_chain\|cold_chain_log\|COLD_CHAIN_LOG' src/store.tsx src/lib/sync.ts supabase/migrations/20260821000011_lot_costing.sql src/views/Inventory.tsx`
  EXPECT: `products.cold_chain` boolean; `cold_chain_log` table org-scoped with RLS; `COLD_CHAIN_LOG` action appends a reading with `inRange` (2–8 °C); Inventory shows the ❄ badge and log modal.
  EVIDENCE: migration 00011 + `ColdChainModal`; `supply-chain.test.ts` asserts out-of-range flagging and audit logging; `insg`/`salb` flagged in seed.
- [x] Sync catalog covers the new table.
  CHECK: `grep -n 'cold_chain_log' src/lib/sync.ts`
  EXPECT: `cold_chain_log` in `TABLES`, `BackendData`, `coldChainLogFrom`, `rowsFor`, `loadBackendData`, `persistBackendData`.
  EVIDENCE: sync.ts entries mirror the existing `restricted_log` pattern.
- [x] Migration 00011 pushed to remote.
  CHECK: `supabase db push` ledger contains `20260821000011_lot_costing`
  EVIDENCE: applied 2026-08-21 (coordinator `supabase db push` → `Finished supabase db push`, migration `20260821000011_lot_costing.sql`).
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean, 67 tests pass (incl. 13 supply-chain tests), build OK; `supply:` keys in both en.json and ar.json (parity check passes).
- [x] W2.2 Patient–lot recall lookup.
  CHECK: `grep -n 'patientsForBatchCode' src/data.ts src/views/Reports.tsx src/__tests__/recall-lookup.test.ts`
  EXPECT: `patientsForBatchCode(transactions, batch)` scans every `TxLine.alloc` across all products (no productId needed); `RecallLookupTab` in Reports renders qty/date/product/customer name·phone·address, with CSV + XLSX (buildXlsx) export and a `window.print()` contact sheet into `#print-root`; test asserts correct patients + empty batch → empty.
  EVIDENCE: `src/data.ts` adds `patientsForBatchCode`; `src/views/Reports.tsx` adds `RecallLookupTab` (new tab on the Reports bar) + `reports.*` i18n keys in both en.json and ar.json; `src/__tests__/recall-lookup.test.ts` (6 cases). Gate run: typecheck clean, 135 tests pass, build OK.

## W3.7 CSV catalog import (feat/catalog-import)

- [x] Import matches export headers; column mapping with auto-map.
  CHECK: `grep -n 'IMPORT_FIELDS\|autoMap' src/lib/catalog-import.ts src/views/Inventory.tsx`
  EXPECT: `IMPORT_FIELDS` mirrors the Inventory export header row exactly (sku,name,generic,brand,category,form,price,cost,lot,lot_qty,expiry,total_stock,reorder_level,rx,supplier) plus barcode; `autoMap` maps by normalized header name + aliases and unmapped fields stay -1; `ImportCsvModal` renders a per-column remap table.
  EVIDENCE: `src/lib/catalog-import.ts` (parser + autoMap + validateAndBuild); `ImportCsvModal` mapping table in `Inventory.tsx`; `catalog-import.test.ts` asserts exact-name mapping, aliases (Product→name, EAN→barcode), and -1 for absent columns.
- [x] Validation report with row numbers; rows with errors excluded unless "valid rows only" unchecked.
  CHECK: `grep -n 'missing_name\|dup_sku\|importValidOnly' src/lib/catalog-import.ts src/views/Inventory.tsx src/locales/en.json`
  EXPECT: per-row issues (missing name, bad price/number, unknown category, dup sku/barcode vs catalog) carry 1-based data-row numbers; entries expose their own issues so validOnly filtering drops broken products; report renders inline with Row {{n}}.
  EVIDENCE: `catalog-import.test.ts` asserts issue list with exact rows [2,3,4] and per-entry filtering; modal shows the report block + checkbox.
- [x] Dry-run validates without saving; import creates products via bulk action.
  CHECK: `grep -n 'PRODUCTS_IMPORT\|importDryRun' src/store.tsx src/views/Inventory.tsx`
  EXPECT: dry-run dispatches only TOAST; import dispatches `PRODUCTS_IMPORT { products, overwrite }`; reducer dedupes by sku/barcode case-insensitively (skip or overwrite keeping stable ids), appends new SKUs, logs one stock audit entry "Imported N products from CSV".
  EVIDENCE: reducer test asserts skip path (`new1`,`p1` remain), overwrite path (stable id p1, last row wins), and audit detail/kind.
- [x] Admin-gated UI + i18n parity + gates green.
  CHECK: `grep -n 'mayImport' src/views/Inventory.tsx && npm run typecheck && npm run test && npm run build`
  EXPECT: button disabled without `manage_settings` (admin), tooltip explains; all new strings via t() present in en.json AND ar.json under inventory.import*.
  EVIDENCE: gate run green — typecheck clean, 189 tests passed (+12 catalog-import), build OK; i18n-key-parity test passes.
