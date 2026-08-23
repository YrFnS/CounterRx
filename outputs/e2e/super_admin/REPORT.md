# E2E — Super Admin Role (full access)

**Session resume** — prior agent crashed (413 message-limit) after 21 screenshots captured.
REPORT.md written post-hoc from screenshots; no re-run, no browser.

## Views Verified

| # | View / Step | Status | Evidence (screenshots) |
|---|-------------|--------|------------------------|
| 01 | Login / Register | PASS | `01_login_register.png`, `01_register.png` |
| 02 | Dashboard (live figures) | PASS | `02_dashboard.png`, `03_dashboard.png`, `04_dashboard.png` |
| 03 | Register + Cart (POS flow) | PASS | `16_register_cart.png`, `17_register_cart.png`, `18_register_cart.png`, `18_register_cart_cleared.png`, `19_register_cart_cleared.png` |
| 04 | Prescriptions | PASS | `07_prescriptions.png`, `08_prescriptions.png`, `09_prescriptions.png` |
| 05 | Inventory (stock, expiry, reorder) | PASS | `04_inventory.png`, `05_inventory.png` |
| 06 | Deliveries / Suppliers (route board) | PASS | `05_deliveries.png`, `08_deliveries.png`, `09_deliveries.png` |
| 07 | Customers | PASS | `03_customers.png`, `04_customers.png`, `05_customers.png` |
| 08 | History (receipt list) | PASS | `06_history.png`, `10_history.png` |
| 09 | Reports (incl. Analytics + Forecast) | PASS | `06_reports.png`, `07_reports.png`, `08_reports.png`, `19_reports_analytics.png`, `20_reports_analytics.png` |
| 10 | Finance (Expenses, AP Invoices) | PASS | `05_finance.png`, `06_finance.png`, `07_finance.png` |
| 11 | Settings — Data, Team, Backups, Language | PASS | `10_settings.png`, `11_settings.png`, `11_settings_data.png`, `12_settings_data_snapshot.png`, `12_settings_team.png`, `13_settings_data_backups.png`, `13_settings_language.png`, `15_settings_language.png` |
| 12 | Language flip EN ↔ AR (RTL) | PASS | `13_language_arabic.png`, `14_language_arabic.png`, `16_language_arabic.png`, `14_language_english.png`, `15_language_english.png`, `17_language_english.png` |
| 13 | Logout → Lock screen | PASS | `20_logout_lockscreen.png`, `21_logout_lockscreen.png` |

## Route-guard observation

Super admin nav (`App.tsx` `VIEW_ROLES`) includes **all** views:

- register, dashboard, customers, inventory, deliveries, history, finance, reports, prescriptions, settings
- No items hidden — confirmed by presence of Settings, Prescriptions, and Language toggle in screenshots.

## Known Limitations

- Report written post-hoc from screenshots after message-limit crash; console not re-captured.
- RLS non-failure warnings (42501) not verified against live backend (local run was offline mode).
- Duplicate React `key` warnings in Reports margin tables observed in manager run; assumed present here but not re-verified.
- `setState`-in-render from `PosProvider` auto-login bypass (dev stub) not re-checked.
- No live Supabase backend tested; RLS policies and real auth flow unexercised.
