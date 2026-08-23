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

## W2.4 — Custom report builder (feat/report-builder)

- [x] Global report filter bar applied across all report tabs.
  CHECK: `grep -n 'applyReportFilters\|FilterBar' src/views/Reports.tsx src/lib/report-filters.ts`
  EXPECT: date range (presets + from/to inputs) plus category/supplier/cashier/method/Rx-OTC filters; one filtered ledger feeds Margin, Valuation, P&L, Builder, Till (date/cashier on closed shifts) and Analytics LTV. Exports consume the already-filtered rows.
  EVIDENCE: `ReportFilters` + pure `applyReportFilters` in `src/lib/report-filters.ts`; `FilterBar` + unified `ledger`/`filtered` in Reports.tsx.
- [x] Named report views persisted in org settings JSONB (no migration).
  CHECK: `grep -n 'savedReportViews' src/data.ts src/lib/sync.ts src/views/Reports.tsx`
  EXPECT: `OrgSettings.savedReportViews: SavedReportView[]` defaulting to `[]`; round-trips through the existing `settings.loyalty` jsonb column (read/written as a sibling key, stripped on read) — no schema migration.
  EVIDENCE: `saveView`/`loadView`/`deleteView` in report-filters.ts; save/load dropdown in FilterBar; sync rowsFor/settingsFrom wiring.
- [x] i18n parity for new strings.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: new `reports.*` + `pos.storeCredit` keys added to BOTH locales (parity test passes, 880 keys each); 147 tests pass (18 new in `src/__tests__/report-builder.test.ts` covering filter application + view round-trip); build OK.

## W3.4 — Promotions engine (feat/promotions)

- [x] `promotions` table + RLS (migration 0018).
  CHECK: migration `20260823000018_promotions.sql` + `grep -n 'promotions' src/lib/sync.ts`
  EXPECT: org-scoped table (kind ∈ birthday/first_visit/category_pct, pct, category_id, window bounds, active), RLS mirroring coupons, seeded demo rules; pushed live with `npx supabase db push`.
  EVIDENCE: migration applied to remote (`migrations:["20260823000018_promotions.sql"]`); sync catalog wired (BackendData/TABLES/rowsFor/promotionFrom/loadBackendData).
- [x] Rules engine — pure applicability math.
  CHECK: `src/lib/promotions.ts`
  EXPECT: birthday month/day match on `customers.dob` (no schema change needed), first-visit = no prior non-refund transactions, category window (open-ended when a bound is missing) discounting only matching lines; stacking capped at subtotal.
  EVIDENCE: unit-tested in `src/__tests__/promotions.test.ts` (birthday match/malformed dob, first-visit incl. refund exclusion, window math, per-category scoping, cap).
- [x] Auto-apply at register + manager override.
  CHECK: `grep -n 'applicablePromotions\|promoOverride\|promotionDiscount' src/modals.tsx src/store.tsx`
  EXPECT: PaymentModal computes applicable rules on open, shows them as a discount row with per-rule Override → manager PIN (approve_discount holders or PIN match) → AUDIT_LOG entry; COMPLETE_SALE records `Transaction.promotionDiscount` + `promotionNames` and writes a "promotion auto-applied" audit line.
  EVIDENCE: PaymentModal promotions block + PIN prompt; `cartTotals(..., promoDiscount)`; reducer tests assert tx fields + audit entries and absence after dismissal.
- [x] Settings CRUD for promotion rules.
  CHECK: `grep -n 'PromotionsTab\|SAVE_PROMOTION\|DELETE_PROMOTION' src/views/Settings.tsx src/store.tsx`
  EXPECT: admin-gated tab listing kind/pct/scope/window/status with create/edit/delete via SAVE_PROMOTION/DELETE_PROMOTION (mirrors CouponsTab); persists through the sync catalog.
  EVIDENCE: PromotionsTab in Settings.tsx; store actions mirror SAVE_COUPON gating + toasts.
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: new `settings.promo*`, `pos.promo*`, `toast.promotion*` keys added to BOTH locales (parity test passes); 193 tests pass (16 new in promotions.test.ts); build OK.
