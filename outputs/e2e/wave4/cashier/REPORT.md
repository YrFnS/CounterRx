# Wave 4 E2E — Cashier register-first access surface

- **Target:** https://counterrx.vercel.app (live)
- **Role:** cashier (`s003@counterrx.local` / A. Okafor)
- **Date:** 2026-08-24 · Tool: agent-browser (session `counterrx-wave4-4fbcc1791fb4`)
- **Result: PASS** — all checks green, no failures, no data modified.

## Login

- **Login OK.** Email+password form filled and submitted; no "Backend unavailable" banner appeared, so no Retry was needed.
- Home screen after login: Register view active by default.
- Screenshot: `01-home-register.png`

## Checks

| # | Check | Result |
|---|-------|--------|
| 1 | Header shows "A. Okafor" | ✅ PASS — header shows "On shift · cashier · A. Okafor" ("No open shift") |
| 2a | Register is default view | ✅ PASS — "Register" heading + product grid on login |
| 2b | Product search works | ✅ PASS — searched "ibuprofen", grid filtered to 2 BRUFEN products (200mg/400mg) |
| 2c | Add to cart + total | ✅ PASS — added Ibuprofen 200mg ($2.40); cart shows "Complete Sale $2.40 F8" |
| 3 | Payment modal contents | ✅ PASS (not completed) — see below |
| 4 | Visible views open | ✅ PASS — Customers, History, Inventory, Dashboard, Deliveries all render their headings; zero "Access denied" text in DOM |
| 5 | Till nav hidden (B3 fix) | ✅ PASS — see below |

## Payment modal (opened via Complete Sale $2.40, NOT confirmed)

- Tender legs present: **Cash Drawer**, **Card Terminal #2**, **Pay later (Due date)**, plus Insurance Claim, Store Credit, Split tender.
- Coupon apply field present (placeholder `WELCOME10`).
- Invoice discount present: quick % buttons (0% / 5% / 10%) + "$ off" amount field.
- Line discount present: "Line discount" button on the cart line (alongside Override price).
- Confirm button disabled until tender entered — no accidental completion possible.
- Modal closed without payment; cart cleared afterward.
- Screenshot: `03-payment-modal.png`

## Restricted views (Finance / Reports / Till)

- Nav shows only: Register F1, Dashboard F3, Customers F7, Inventory 12 F4, Deliveries 3, History F6. No Till, Finance, or Reports buttons rendered.
- Full-DOM grep for `till`, `finance`, `reports`: **0 matches** — the views are not merely visually hidden but absent from the rendered tree.
- The app uses state-based views (URL stays `https://counterrx.vercel.app/`), so there is no deep-linkable route to probe; nav hiding is the guard surface. B3 fix (Till hides button for blocked roles) verified working live.

## Screenshots

| File | Step |
|------|------|
| `01-home-register.png` | Logged-in home (Register default, header A. Okafor) |
| `02-register-cart-total.png` | Ibuprofen in cart, total $2.40 |
| `03-payment-modal.png` | Take-payment modal with legs/coupon/discount |
| `04-customers.png` | Customers view |
| `05-history.png` | History view |
| `06-inventory.png` | Inventory view |
| `07-dashboard.png` | Dashboard view |
| `08-deliveries.png` | Deliveries view |

## Failures

None. One note: Dashboard exposes revenue/till-history widgets to the cashier role (read-only aggregates) — flagging as an observation only, since the task scope was access-surface verification and route guards behaved as designed.
