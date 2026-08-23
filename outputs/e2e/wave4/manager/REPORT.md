# CounterRx E2E — Wave 4, Manager Access Surface

- **Date:** 2026-08-23 (evening, live site)
- **Target:** https://counterrx.vercel.app
- **Account:** s006@counterrx.local (K. Asante, role `manager`, S-006)
- **Method:** agent-browser (headless Chromium via CDP), accessibility-tree snapshots + screenshots
- **Result: PASS with 2 spec discrepancies** (both are shipped route-guard design, not defects — see Denied items)

## Login

- **OK.** Email + password form accepted `s006@counterrx.local` / password; Sign in succeeded on first attempt.
- No "Backend unavailable" banner appeared; no Retry needed.
- Home screen (Register view) rendered with live catalog data (48 products across categories).
- Console: 0 errors / 0 warnings in the session buffer.

## Header

- ✅ Shows **"K. Asante"**, badge "ON SHIFT · MANAGER", terminal "Terminal 01 · drawer synced".

## Nav items verified (each opens and renders data)

| Nav item | Renders | Evidence screenshot |
| --- | --- | --- |
| Register | Product grid (48 items), category chips, cart actions, Till & Reports button | `00-home-logged-in.png` |
| Dashboard | Revenue chart (7d), Needs attention list (expiry/stock/prescription queue), Top movers | `01-dashboard.png` |
| Customers | Customer table (Grace Lin, Maple Family Clinic…) with visits/spend/points | `02-customers.png` |
| Inventory | Products tab (filters, reports, count sheet, transfers) + Suppliers tab present | `03-inventory.png` |
| Finance | Tabs PO/AP/Expenses/P&L; PO-101 MediSource ORDERED $377.00 LATE | `06-finance.png` |
| Reports | Filter bar + tabs Margin/COGS/P&L/Builder/Till/Analytics/Recall/Vaccinations; margin table populated | `07-reports.png` |
| Deliveries | Online intake queue (3 requests, Fulfill/Decline), route plans, route board w/ driver assign | `12-deliveries.png` |
| History | Transaction ledger with method filters, Shift summary, Audit trail, BTC log | `13-history.png` |

## Till (#3)

- ✅ "Till & Reports" button on Register opens the **Reports view**, which contains the **Till tab**: shift ledger ("Open shift now", shift SH-0042 −$0.19 A. Okafor · 02:13 AM, "End of day — all terminals").
- Screenshots: `14-till-and-reports.png` (entry point → Reports view), `08-reports-till-xz.png` (Till tab ledger).

## Reports deep checks (#4)

- ✅ **X/Z report viewer:** clicked shift SH-0042 → "Z Report · SH-0042 · A. Okafor · T-01": transaction count 2, total sales $65.31, tender totals (Cash/Card/Paid In/Paid Out), cash movements (float top-up +$100.00), Over/Short −$0.19.
- ✅ **Per-terminal breakdown (multi-terminal recon):** "PER-TERMINAL BREAKDOWN → Terminal · T-01" plus "VARIANCE REPORT · EXPECTED VS COUNTED → T-01 Expected $273.19 → Counted $273.00 (−$0.19)". Screenshot `09-xz-report-terminal-breakdown.png`.
- ✅ **Recall Lookup tab:** lot/batch search surface ("Scan or type a batch code and press Search"). Screenshot `10-reports-recall.png`.
- ✅ **Report builder:** group-by dimensions (Product/Category/Day/Tender), metric toggles (Units/COGS/Margin), grouped result table (8 groups over 30-day ledger), CSV/XLSX export; the global filter bar (date range, Category, Supplier, Cashier, Method, Rx/OTC, saved views) feeds it. Screenshot `11-reports-builder.png`.

## Inventory deep checks (#5)

- ✅ **Products / Suppliers tabs** both present (`03-inventory.png`).
- ✅ **Cycle count:** "Count sheet" opens "Physical count sheet" modal with SKU filter, COUNTED inputs, disabled "Apply count · 0 variances". Screenshot `04-inventory-count-sheet.png`.
- ✅ **Transfer pickers read branches:** Inter-branch transfers modal has product picker + branch dropdown offering all three branches — Main Branch / North Branch / South Branch = seed IDs **BR-01/BR-02/BR-03** (`src/data.ts:1145-1147`). The UI shows branch *names*, not the BR codes; codes confirmed via source. Screenshot `05-inventory-transfers.png`.

## Settings / Platform (#6) — DENIED BY DESIGN (spec discrepancy)

The task expected manager to open Settings (Team tab visible, Platform tab denied). The shipped build does not match that expectation:

- ❌ **Settings is not reachable for manager at all.** Per `VIEW_ROLES` (`src/data.ts:750-762`): `settings: ["super_admin", "pharmacy_admin"]` — `manager` is not included, so F7 route guards hide the nav item entirely (verified: no Settings button anywhere in the DOM, page text contains no "Settings"). Views have no URL routing, so there is no user-reachable path.
- Same for **Prescriptions**: `prescriptions: ["super_admin", "pharmacy_admin", "pharmacist"]` — hidden from manager nav.
- **Consequence:** "manager manages staff via Team tab but gets Access denied on Platform" could NOT be verified as specified — that behavior would require pharmacy_admin or super_admin credentials. The "Access denied" pane itself exists in App.tsx (rendered when a disallowed view is somehow reached) and was previously verified for other roles in G9.

## Denied items (summary)

1. Prescriptions — nav hidden for manager (VIEW_ROLES, by design).
2. Settings (incl. Team tab) — nav hidden for manager (VIEW_ROLES, by design). Task premise #6 does not match shipped role matrix; needs either a VIEW_ROLES change or an admin-credential re-run to test Team/Platform tabs.

## Actions taken

- Logged in, navigated every visible nav item, opened modals (Count sheet, Transfers, Z report, Recall, Report builder). Read-only throughout: no sales, no data creation/deletion/modification, no source changes.

## Screenshots

`00-home-logged-in.png`, `01-dashboard.png`, `02-customers.png`, `03-inventory.png`, `04-inventory-count-sheet.png`, `05-inventory-transfers.png`, `06-finance.png`, `07-reports.png`, `08-reports-till-xz.png`, `09-xz-report-terminal-breakdown.png`, `10-reports-recall.png`, `11-reports-builder.png`, `12-deliveries.png`, `13-history.png`, `14-till-and-reports.png`

## Failures

- None functional. Two spec mismatches documented above (Prescriptions/Settings hidden for manager).
