# CounterRx E2E — Wave 4, Cashier 2 (s004 / J. Boateng)

- **Date:** 2026-08-23
- **Target:** https://counterrx.vercel.app (live production)
- **Account:** s004@counterrx.local — cashier role ("J. Boateng")
- **Tool:** agent-browser (headless Chrome via CDP)
- **Result:** **ALL PASS** (8/8 checks)

## 1. Login

| Check | Result |
|---|---|
| Email+password form renders (Email/Password fields, Sign in button) | ✅ |
| `s004@counterrx.local` / password accepted | ✅ |
| "Backend unavailable" banner shown | ✅ No — not seen; "Retry connection" click not needed |
| Logged-in home screen reached | ✅ |

Screenshot: `01-home-logged-in.png`

## 2. Header identity

Header shows **"J. Boateng"** with "ON SHIFT · CASHIER · Terminal 01 · drawer synced". ✅

## 3. Register default view (search → cart → total)

1. Searched "Ibuprofen" → results narrowed to 2 products (`02-register-search-ibuprofen.png`).
2. Added BRUFEN Ibuprofen 200mg ($2.40) to cart.
3. Cart shows 1 × Ibuprofen 200mg, Subtotal $2.40, **Total $2.40**, Complete Sale button reads "$2.40". ✅ Matches unit price exactly.

Screenshots: `02-register-search-ibuprofen.png`, `03-cart-with-item.png`

## 4. Connection badge

Badge in the header reads **"Online · Synced"** — dark-green text on a light-green pill. Verified on both Register and History views.

- NOT "Backend unavailable" ✅
- NOT "local ledger" ✅

## 5. Demo artifacts absent

Searched full page text on every view visited:

| Artifact | Present? |
|---|---|
| "SCANNER LIVE" chip | ❌ Absent ✅ |
| "Reset demo data" button | ❌ Absent ✅ |
| "Backend unavailable" banner | ❌ Absent ✅ |
| "local ledger" indicator | ❌ Absent ✅ |

Note: the header does contain a legitimate hardware hint **"Barcode scanner armed · F2 to scan"** — this is a scanner-readiness indicator, not the "SCANNER LIVE" demo chip.

## 6. Payment modal (not completed)

Opened via "Complete Sale $2.40" (F8). Renders:

- Amount due $2.40, discount options (0%/5%/10%)
- **Payment method legs: Cash ("Drawer opens"), Card ("Terminal #2"), Insurance, Store Credit, Pay later ("Due date")** ✅ all render
- Cash tendered quick amounts ($20/$50/$100), coupon code field, schedule-delivery toggle
- Confirm button labeled "Confirm $2.40 · Cash"

**Payment NOT completed** — modal dismissed with Esc; no sale recorded, no data modified.

Screenshot: `04-payment-modal.png`

## 7. History

Loads and shows settled sales: **17 receipts shown, net $302.63**, filter tabs (All/Cash/Card/Insurance/Pay later/Unsettled pay later), shift summary + audit trail + BTC log. Sample rows are settled cash receipts (e.g. T-3G50YS cash $1.30, T-1041 cash $18.14). ✅

Screenshot: `05-history.png`

## 8. Nav items verified (cashier role shows 6)

| Nav item | Loads? | Screenshot |
|---|---|---|
| Register F1 | ✅ default view after login | 01/02/03 |
| Dashboard F3 | ✅ loads | `06-dashboard.png` |
| Customers F7 | ✅ loads | `07-customers.png` |
| Inventory 12 F4 | ✅ loads | `08-inventory.png` |
| Deliveries 3 | ✅ loads | `09-deliveries.png` |
| History F6 | ✅ 17 receipts | `05-history.png` |

No "Backend unavailable" or "local ledger" state observed anywhere during the session.

## Actions taken

Login → header/badge checks → product search + add-to-cart + total check → payment modal open + Esc (no payment) → History check → quick load of remaining nav views → browser closed. No source files touched, no data deleted, no test patients/customers created, no payments completed.

## Failures

None. One minor note: clicking by text "Complete Sale $2.40" failed once because the button's accessible name includes "F8"; resolved by snapshot ref.
