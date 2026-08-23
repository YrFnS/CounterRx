# CounterRx E2E — Wave 4 — super_admin access surface

- **URL:** https://counterrx.vercel.app
- **Account:** s005@counterrx.local (super_admin, shown as "T. Okoye")
- **Date:** 2026-08-23 · Browser automation: agent-browser (headless Chrome/CDP)
- **Scope:** verification only — no source changes, no data mutations, nothing suspended or provisioned.

## Login

**OK.** Email+password form accepted credentials, Sign In succeeded on first attempt.
No "Backend unavailable" banner appeared; no retry needed. Landing view is Register,
header shows `super_admin` role chip and **T. Okoye** (`01-home-register.png`).

## 1. Header identity

**PASS** — header renders "On shift · super_admin · **T. Okoye** · Terminal 01 · drawer synced".

## 2. Navigation — every view opens and renders data

| View | Result | Evidence |
| --- | --- | --- |
| Register | PASS — 48 items, 12 categories, fast movers, current-sale pane | `01-home-register.png` |
| Dashboard | PASS — Sales Today / Transactions / Units sold tiles live | `02-dashboard.png` |
| Customers | PASS — 10 on book, 2 new this week, regulars stats | `03-customers.png` |
| Inventory | PASS — 48 products / 54 lots, stock value $11,711, FEFO list, expiry chart, low-stock (7) & expiring ≤60d (5) badges | `04-inventory.png` |
| Prescriptions | PASS — Rx workflow board, prescribers, claims tab, back-order queue (1), transfer log (5), pharmacist on duty R. Mensah | `05-prescriptions.png` |
| Finance | PASS — PO (1) / AP ($4,820 open) / Expenses / P&L tabs render | `06-finance.png` |
| Reports | PASS — FIFO lot-level financial reports, date/category/supplier/cashier/method filters, saved views | `07-reports.png` |
| History | PASS — 17 receipts, payment filters, shift summary, audit trail, BTC log (39) | `08-history.png` |
| Settings | PASS — all tabs render (see below) | `09-settings.png` |

Deliveries badge (3) also present in nav; not separately screenshotted (not in requested list).

## 3. CRITICAL: Settings → Platform Admin tab (super_admin-only)

**Tab visibility: PASS.** The "Platform Admin" tab renders in Settings for this
account (`09-settings.png`, right-most tab) and opens the Platform Admin view
(`10-platform-admin.png`) with Organizations / Provision sub-tabs.

### Feature flags — PASS

Per-org row controls render exactly as specified:

- **Claims mode:** select dropdown, values Sandbox / Live (Default org currently *Sandbox*).
- **NDC live lookup:** checkbox (unchecked).
- **Delivery:** checkbox (unchecked).
- **AI:** checkbox (unchecked).

### Suspend / activate buttons — PASS (visibility only)

"Suspend" action button rendered for the active org row (`10-platform-admin.png`,
Actions column). Nothing was clicked — no org state changed.

### Organizations table — ⚠️ PARTIAL / FINDING

Table structure is correct: columns ORGANIZATION · OWNER · STATUS · CLAIMS ·
NDC LOOKUP · DELIVERY · AI · CREATED · ACTIONS. However **only 1 row exists:
"CounterRx Default" (owner —, Active, created 21/08/2026)**. Expected at least
4 organizations (Default + demo tenants, one suspended). DOM row count
confirmed: `table tbody tr` = 1, no pagination below (`11-platform-admin-bottom.png`).

Interpretation: the expected demo tenants appear not to exist in the production
Supabase backing counterrx.vercel.app (they may be seed/local-only data). The
suspend-state UI could therefore not be observed against a suspended org either.
This is a data/environment gap, not a rendering failure of the table itself.

### Provision wizard — PASS (UI reachable, nothing submitted)

"Provision" sub-tab opens the **New tenant** wizard step 1 *Org info*
(`12-provision-wizard.png`): org name, owner email, owner name, 4-digit PIN, Next button.
Step 2 "Catalog & staff" is correctly gated/disabled until step 1 completes.
Because actually provisioning into the live DB was out of scope, step 2's
catalog CSV upload + column-mapping UI was verified in source instead of by
submission: `src/views/PlatformAdmin.tsx` lines 75–85 parse the CSV headers and
build `catalogMappings`; lines 307–319 render the `.csv` file input
(`#catalog-upload`) and the column-mapping section (`platform.columnMapping`).
Controls are implemented and wired; wizard aborts cleanly if abandoned before submit.

## 4. Settings → Staff management — ❌ FAIL (hidden for super_admin)

The Settings **Team** tab (staff add/edit: add staff, role change, activate/deactivate,
PIN reset) does **not render at all** when logged in as super_admin — the tab strip
shows Store profile … Backups & restore, Platform Admin, but no Team
(`09-settings.png`).

Root cause (source inspection, no changes made): `can()` in `src/data.ts`
(PERMS matrix, ~line 731) grants `manage_staff` only to `pharmacy_admin`;
`super_admin` is absent from every PERMS row, and Settings gates the team tab on
`can(role, "manage_staff")` (`src/views/Settings.tsx` line 58/76). Side effect of
the same matrix: Store profile / terminal fields render read-only (disabled) for
super_admin too, since `edit_settings`/`manage_settings` likewise omit `super_admin`.

Suggested fix (not applied): make `can()` treat `super_admin` as having all perms,
or add `super_admin` to the admin-scoped PERMS rows.

## Actions taken

Login; navigated each view; opened Platform Admin; inspected org table + flags;
opened Provision wizard step 1 (no submission); read frontend source read-only to
confirm gated UI. **Zero writes to app data; zero source modifications.**

## Screenshot index

| File | Step |
| --- | --- |
| `01-home-register.png` | Logged-in home (Register) + header T. Okoye |
| `02-dashboard.png` | Dashboard |
| `03-customers.png` | Customers |
| `04-inventory.png` | Inventory |
| `05-prescriptions.png` | Prescriptions |
| `06-finance.png` | Finance |
| `07-reports.png` | Reports |
| `08-history.png` | History |
| `09-settings.png` | Settings, tab strip incl. Platform Admin, no Team tab |
| `10-platform-admin.png` | Platform Admin: org table, flags, Suspend button |
| `11-platform-admin-bottom.png` | Platform Admin scrolled — confirms single org row |
| `12-provision-wizard.png` | Provision wizard step 1 (Org info) |

## Summary

- Login & header: PASS
- All 9 nav views: PASS
- Platform Admin tab: PASS (flags PASS, suspend control visible, provision wizard reachable)
- Organizations ≥4 expected: **FAIL — only 1 org in prod DB** (environment/data gap)
- Staff management: **FAIL — Team tab hidden for super_admin** (permission-matrix bug)
