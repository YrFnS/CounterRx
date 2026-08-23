# CounterRx E2E — Wave 4 — pharmacy_admin (S-001 / D. Whitfield)

- **Date:** 2026-08-23 · **Target:** https://counterrx.vercel.app · **Role:** `pharmacy_admin`
- **Login:** s001@counterrx.local — **OK** (email+password form, signed in on first attempt; no "Backend unavailable" banner appeared)

## 1. Header identity

**PASS** — header shows `ON SHIFT · PHARMACY_ADMIN · D. Whitfield · Terminal 01 · drawer synced`. Both "D. Whitfield" and the role label visible in every view. Screenshot: `01-home-logged-in.png`.

## 2. Navigation items

| Nav item | Result | Title rendered | Data visible |
| --- | --- | --- | --- |
| Register | PASS | "Register" | 48 products across 13 categories + subcategories; product tiles with price/stock/expiry |
| Dashboard | PASS | "Dashboard — Live figures from the POS ledger" | Stat tiles (Sales today $0.00, Transactions 0, Units 0, Open alerts 17), 7-day revenue chart ($302.63 total), expiry/low-stock alert list (8), top movers (6), sales by category |
| Inventory | PASS | "Inventory — Stock on hand…" | 48-row products table; filter chips (Low stock 7, Expiring ≤60d 5, ℞ only 21, Controlled 6); export/import buttons |
| Prescriptions | PASS | "Prescriptions — Pharmacist workflow…" | Kanban board with cards, back-order queue (1 open), refill radar, transfer log (5); pharmacist-on-duty R. Mensah |
| Customers | PASS | "Customers — Loyalty balances…" | 10-row customer table; stat tiles (10 on book, 2 new this week, 1,140 loyalty pts) |
| History | PASS | "History — Every receipt this terminal has printed" | 17 receipts shown, net $302.63; method filters; Audit trail & BTC-log tabs |
| Finance | PASS | "Finance — Purchase orders, AP, expenses, P&L" | PO-101 (ORDERED, $377, LATE) and PO-102 (RECEIVED, $114); AP open $4,820 |
| Reports | PASS | "Reports — Margin, FIFO valuation, P&L, custom report builder" | Financial reports with date/category/supplier/cashier/method filters; tab set Margin / COGS & valuation / P&L / Report builder / Till / Analytics / Recall Lookup / Vaccinations due |
| Settings | PASS | "Settings — Organization profile, team, loyalty, backups" | Tabs render: Store profile, Receipt, Loyalty, Team, Time clock, Hardware, Data & backups, Language, Clinical, Delivery, Coupons, Product categories, Notifications, Promotions, Backups & restore |

Note: a **Deliveries** nav item (badge 3) also exists but was outside the requested list — not exercised beyond visibility.

## 3. Settings → Platform (super_admin-only)

**PASS (hidden).** No "Platform" tab exists for pharmacy_admin (`platformVisible: false`, no "Access denied" needed — the F7 route guard hides restricted nav entirely). Screenshot: `09-settings.png`.

## 4. Register sale flow (no payment completed)

**PASS.**
1. Searched "Paracetamol" → filtered to CALPOL Paracetamol 500mg (`10-register-search-add.png`).
2. Added to cart → "Current sale · 1 item".
3. Clicked **Complete Sale $1.20** → payment modal opened showing Amount Due $1.20, subtotal/discount/total, payment methods (Cash / Card / Insurance / Store Credit / Pay later), cash tendered shortcuts, coupon-code field, split tender (`11-payment-modal.png`).
4. **NOT completed** — modal dismissed with Esc and cart cleared ("Clear all"). No transaction created.

## 5. Reports → Till (X/Z report)

**PASS.** Till tab shows shift state: "No open shift · Open shift now", CLOSED SHIFTS list with SH-0042 (variance −$0.19, A. Okafor, end-of-day all terminals). X/Z report data reachable per shift entry. Screenshot: `12-reports-till-xz.png`.

## Screenshots

| File | Step |
| --- | --- |
| `01-home-logged-in.png` | Logged-in home (Register), header identity |
| `02-dashboard.png` | Dashboard stats |
| `03-inventory.png` | Inventory table |
| `04-prescriptions.png` | Prescriptions kanban |
| `05-customers.png` | Customers table |
| `06-history.png` | Receipt history |
| `07-finance.png` | Purchase orders / AP |
| `08-reports.png` | Financial reports |
| `09-settings.png` | Settings (no Platform tab) |
| `10-register-search-add.png` | Product search + add to cart |
| `11-payment-modal.png` | Payment modal open (not completed) |
| `12-reports-till-xz.png` | Reports → Till X/Z shifts |

## Failures / observations

- **No failures.** All 9 nav views render live backend data; role gating correct.
- Dashboard "Sales today $0.00 / -100% vs yesterday" is accurate (no sales today at test time), not a defect.
- Register "Cash In / Out" and "Issue Store Credit" are disabled while no shift is open — consistent with Till's "No open shift" state.
