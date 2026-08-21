# Leaf: till-ops (Phase A)

- [x] X/Z reports produce correct drawer math (unit-tested).
  CHECK: `grep -n 'generateXReport\|generateZReport\|closeShift' src/data.ts` + `src/__tests__/till-ops.test.ts`
  EXPECT: `generateXReport` sums sales/tenders/refunds/paid-in-out; `closeShift` computes `overShort = countedCash - expectedCash`; Z report includes closing balances.
  EVIDENCE: `till-ops.test.ts` asserts `currentCash = 100 (opening) + 50 (sale) + 5 (paid_in) - 3 (paid_out) = 152` and over/short `-5` for counted 145 vs expected 150.
- [x] Void requires manager approval and logs an audit entry.
  CHECK: `grep -n 'VOID_TX' src/store.tsx src/views/History.tsx`
  EXPECT: reducer rejects voids without `can(role,"refund")`; UI requests manager PIN; `withAudit(newState,"void",...)` records the void; `voidedAt/voidReason/voidedBy` set on the transaction.
  EVIDENCE: `store.tsx` VOID_TX case + `History.tsx` VoidModal (PIN gate, reason ≥ 3 chars, `!tx.voidedAt` guard).
- [x] Paid in / paid out appears in History and X/Z.
  CHECK: `grep -n 'recordCashMovement\|paid_in\|paid_out' src/data.ts src/store.tsx src/views/History.tsx`
  EXPECT: `recordCashMovement` appends `CashMovement` and adjusts `expectedCash`/`paidInTotal`/`paidOutTotal`; History lists them; X report shows movements.
  EVIDENCE: `data.ts` `recordCashMovement` + History rendering of `cashMovements`.
- [x] Store credit redeems and deducts.
  CHECK: `grep -n 'applyStoreCredit\|store_credit\|StoreCredit' src/data.ts src/store.tsx src/modals.tsx`
  EXPECT: `store_credits` table (migration 0006) org-scoped; `applyStoreCredit` deducts balance; payment modal accepts `store_credit` tender.
  EVIDENCE: `store_credits` migration + `store_credits_org_idx` RLS + `applyStoreCredit` unit test (15 − 10 = 5).
- [x] Gift card code scans (credit with code).
  CHECK: `grep -n 'creditByCode' src/data.ts`
  EXPECT: `creditByCode(credits, code)` finds a gift-card credit by its scannable code.
  EVIDENCE: unit test `creditByCode(credits,"GC-123")?.id === "c1"`.
- [x] Layaway expiry surfaces and auto-expires.
  CHECK: `grep -n 'expiresAt\|auto-expire\|prune' src/store.tsx src/views/Register.tsx src/data.ts`
  EXPECT: held sales carry `expiresAt`; UI shows days-left/expired badge; expired holds are pruned from active recall.
  EVIDENCE: Register recall shows `· Nd`/`expired` badge; `activeHolds` filters by `expiresAt` (data.ts).
- [x] Migration 0006 pushed to remote.
  CHECK: `supabase db push` ledger contains `20260821000006_till_ops`
  EVIDENCE: (fill after push) — see coordinator report.
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean, 33 tests pass (incl. till-ops suite), build OK.
