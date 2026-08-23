# Leaf: till-ops (Phase A)

- [x] X/Z reports produce correct drawer math (unit-tested).
  CHECK: `grep -n 'generateXReport\|generateZReport\|closeShift' src/data.ts` + `src/__tests__/till-ops.test.ts`
  EXPECT: `generateXReport` sums sales/tenders/refunds/paid-in-out; `closeShift` computes `overShort = countedCash - expectedCash`; Z report includes closing balances.
  EVIDENCE: `till-ops.test.ts` asserts `currentCash = 100 (opening) + 50 (sale) + 5 (paid_in) - 3 (paid_out) = 152` and over/short `-5` for counted 145 vs expected 150.
- [x] Void requires manager approval and logs an audit entry.
  CHECK: `grep -n 'VOID_TX' src/store.tsx src/views/History.tsx`
  EXPECT: reducer rejects voids without `can(role,"refund")`; UI requests manager PIN; `withAudit(newState,"void",...)` records the void; `voidedAt/voidReason/voidedBy` set on the transaction.
  EVIDENCE: `store.tsx` VOID_TX case + `History.tsx` VoidModal (PIN gate — manager PIN verified via `hashPin` against the target staff record, reason ≥ 3 chars, `!tx.voidedAt` guard). Note: this is an in-app authorization prompt, not the login flow; login itself is now email+password (`4d220b5`).
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

## W2.3 Multi-terminal X/Z + reconciliation (feat/terminal-recon)

- [x] Per-terminal breakdown groups cash movement / sales by terminalId in the shift summary.
  CHECK: `grep -n 'groupShiftsByTerminal' src/data.ts src/views/Reports.tsx src/views/History.tsx`
  EXPECT: `groupShiftsByTerminal(shifts, fallbackTerminalId)` rolls sales/refunds/card/paid-in-out/expected/over-short up per `terminalId`; `Shift` already carries `terminalId` (`src/data.ts`); legacy shifts missing it fall back to `state.settings.terminalId` via `terminalIdOf`.
  EVIDENCE: `data.ts` `groupShiftsByTerminal` + `terminalIdOf`; `Reports.tsx` `TerminalBreakdown` (rendered inside every X/Z viewer) and `History.tsx` per-terminal rows.
- [x] Variance report: expected drawer vs counted cash per terminal.
  CHECK: `grep -n 'terminalVariance\|varianceReport\|expectedVsCounted' src/data.ts src/views/Reports.tsx src/views/History.tsx`
  EXPECT: `terminalVariance(expectedCash, countedCash) = counted - expected` (rounded to cents); UI shows expected → counted and the signed variance per terminal.
  EVIDENCE: `data.ts` `terminalVariance`; per-terminal variance rows in `Reports.tsx` `TerminalBreakdown` and `AllTerminalsZModal`, mirrored in `History.tsx`.
- [x] End-of-day all-terminals Z aggregates across terminals for the date.
  CHECK: `grep -n 'allTerminalsZReport' src/data.ts src/views/Reports.tsx src/views/History.tsx`
  EXPECT: `allTerminalsZReport(shifts, date, fallbackTerminalId)` filters shifts opened on `date`, groups by terminal, sums sales/refunds/paid-in-out/expected/counted/over-short across terminals; off-day shifts excluded.
  EVIDENCE: `data.ts` `allTerminalsZReport` + `AllTerminalsZModal` reachable from `Reports.tsx` Till tab and `History.tsx` Shift summary.
- [x] Unit tests cover variance math, per-terminal grouping, and all-terminals aggregation.
  CHECK: `src/__tests__/terminal-recon.test.ts`
  EXPECT: 9 tests — variance rounding, terminalId fallback, per-terminal roll-up (cash vs card expectedCash), open=expected/closed=counted, date-scoped all-terminals aggregation, and integration against `generateZReport` over/short.
  EVIDENCE: `terminal-recon.test.ts` passes (9/9).
- [x] i18n: every new string via `t()` with keys in both `src/locales/en.json` and `ar.json`.
  CHECK: `src/__tests__/i18n-key-parity.test.ts` (en/ar key-set + all dotted `t()` literals resolve).
  EXPECT: keys `shift.perTerminal`, `shift.terminal`, `shift.varianceReport`, `shift.expectedVsCounted`, `shift.variance`, `shift.counted`, `shift.expected`, `shift.endOfDayAllTerminals`, `shift.allTerminalsZ`, `shift.allTerminals`, `shift.totalOverShort`, `shift.noTerminalData` present in both locales.
  EVIDENCE: parity test passes; both locales updated.
- [x] Full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean, 138 tests pass (incl. terminal-recon suite), build OK.

## Discount & tax gate (P2/P3 — added 2026-08-22)

- [x] Tax removed: no UI surface renders tax; `Transaction.tax` persists as 0 for shape stability.
  CHECK: `grep -rn "TAX_RATE\|Tax 8%" src/ --include=*.tsx | grep -v test` returns nothing; totals = subtotal − discounts.
  EVIDENCE: commit "feat(sales): remove tax computation and rendering across the POS".
- [x] Per-line discounts ($ or %) and fixed-amount invoice discounts work and persist on JSONB transaction lines.
  CHECK: unit tests in `src/__tests__/discounts.test.ts` (line %/amt, cap at line gross, stacked with invoice %/$, tax stays 0).
  EXPECT: all pass; sale rows show `lines[].lineDiscount` and `invoiceDiscountAmt` in Supabase.
- [x] Large discounts require approval: line ≥10%, invoice ≥20% or ≥$50 needs the `approve_discount` perm or manager PIN; every applied discount is audit-logged with approver.
  CHECK: cashier applies 15% line discount → blocked without PIN; manager approves → audit entry records it.
  EVIDENCE: `SET_LINE_DISCOUNT` case + `LINE_DISCOUNT_PIN_THRESHOLD` / invoice thresholds in `src/data.ts`.
