# Leaf: analytics-engagement (Phase F)

- [x] Customer LTV report.
  CHECK: `grep -n 'calculateLTV' src/data.ts src/views/Reports.tsx`
  EXPECT: lifetime spend − refunds per customer, ranked table + cohort summary, preset range filter.
  EVIDENCE: `AnalyticsTab` in Reports.tsx; `calculateLTV` unit-tested in `src/__tests__/analytics.test.ts`.
- [x] Supplier performance report.
  CHECK: `grep -n 'supplierPerformance' src/data.ts src/views/Reports.tsx`
  EXPECT: on-time rate / avg lead days / total spend / invoice count from seeded PO/AP/delivery data.
  EVIDENCE: `supplierPerformance` helper + Reports render; unit-tested against seeded data.
- [x] Expiry value-at-risk report.
  CHECK: `grep -n 'expiryAtRisk' src/data.ts src/views/Reports.tsx`
  EXPECT: cost of lots expiring ≤90 days (sum `Batch.cost` × qty); window configurable.
  EVIDENCE: `expiryAtRisk(products, 90)` + Reports render; unit-tested.
- [x] CSV export for all three reports.
  CHECK: `grep -n 'csv\|download\|export' src/views/Reports.tsx`
  EXPECT: reuse of the existing CSV export helper; no new library.
  EVIDENCE: export buttons on each report block.
- [x] Configurable loyalty (rate + tiers) persisted per org.
  CHECK: `grep -n 'loyalty' src/data.ts src/views/Settings.tsx`
  EXPECT: `OrgSettings.loyalty` (ptsPerUnit, chunkPts/chunkValue, tier thresholds) editable in Settings Loyalty tab; persisted via the `settings` sync table.
  EVIDENCE: `LoyaltyTab` in Settings.tsx (pre-existing surface, Phase F wired it to org settings).
- [x] Coupons table + CRUD.
  CHECK: `grep -n 'coupons\|SAVE_COUPON\|DELETE_COUPON' src/store.tsx src/views/Settings.tsx` + migration `20260821000012_coupons.sql`
  EXPECT: `coupons` table org-scoped (RLS), `Coupon` model, `SAVE_COUPON`/`DELETE_COUPON` actions (admin-gated), `CouponsTab` CRUD in Settings.
  EVIDENCE: migration 00012; CouponsTab; store actions; sync catalog wiring.
- [x] Coupon applied at the payment modal.
  CHECK: `grep -n 'couponCode\|couponDiscount' src/modals.tsx src/store.tsx`
  EXPECT: code entry validates (exists/active/not-expired/customer-scope), applies percent or amount discount, `cartTotals` includes it, `Transaction.couponDiscount` recorded, visible in History/X-Z math.
  EVIDENCE: PaymentModal coupon block; `cartTotals(state, pct, taxExempt, couponDiscount)`; `couponDiscount` on Transaction.
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: `analytics:` namespace in both locales (parity test passes); 87 tests pass (6 new analytics); build OK.

Notes:
- Loyalty earning/redemption already existed (points per dollar, chunk redemption at 100 pts = $5) — Phase F added per-org configurability and the coupon layer; the seeded `settings.loyalty` default matches previous behavior.
- Digital receipts excluded per scope decision (no mail/SMS provider).
- Migration 00012 pushed to remote by the coordinator (not run here).
