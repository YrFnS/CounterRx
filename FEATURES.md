# CounterRx — Full Feature Buildout

> Requirements doc for taking CounterRx from front-end POS demo to a production
> pharmacy POS. **Excluded by decision: Stripe billing and all tax configuration.**
> Everything else comes from the gap analysis against PharmacyNext's claims plus
> real-world pharmacy POS requirements.
>
> Priority legend: **P0** = foundation, blocks everything else · **P1** = core pharmacy
> operations · **P2** = engagement, polish, scale.

---

## 0. Foundation — database & users (recommendation)

### Database: Supabase (Postgres)

**Recommendation: Supabase.** It is already in `package.json` (`@supabase/supabase-js` v2),
and gives Postgres + row-level security + auth + storage + webhooks in one product.

| Need | Why Supabase |
| --- | --- |
| Tenant isolation | Postgres RLS scoped by `organization_id` — the PharmacyNext model, enforceable server-side |
| Audit & reporting | Real SQL: joins, window functions, exportable reports (CSV/Excel) |
| Auth | Built-in staff auth, MFA, sessions |
| Storage | Rx hard-copy scans, label templates, receipts |
| Webhooks / integration | Audit stream → downstream systems (the repo's "data-exchange surface" becomes real) |

**Core schema sketch:**

- `organizations` — one row per pharmacy (id, name, branch, currency, loyalty config, invoice template)
- `staff` — profile per auth user: `user_id`, `organization_id`, `role`, `pin_hash` (argon2/bcrypt via pgcrypto), `active`
- `products`, `batches` — catalog + lots (already modeled in `src/data.ts`)
- `transactions`, `tx_lines`, `payments` — sales ledger with legs (split payments)
- `prescriptions`, `rx_claims` — Rx queue + per-claim insurance status
- `customers`, `loyalty_ledger` — customer book + point movements
- `transfers` — inter-branch stock movements (already modeled)
- `audit_log` — append-only, server-side actor from session, tamper-evident (hash chain or sealed entry)
- `sync_queue` — local outbox for offline pushes

**Offline-first strategy (keep the repo's design, make it real):**
- Local cache: keep the existing IndexedDB/localStorage ledger as the working copy
- Outbox pattern: every mutation appends to a local queue; on reconnect, push to Postgres and pull changes since `updated_at` cursor
- Conflict rule: last-write-wins per record with a server-assigned version; count/physical stock merges are additive (audited)

**Alternatives considered:**
- Firebase Firestore — native offline sync, but weak relational queries and tenant isolation; awkward for the reporting/audit needs
- PocketBase — single binary, auth + SQLite, but self-hosting ops burden and SQLite concurrency ceiling
- Convex — great reactive sync, but young ecosystem and same relational ceiling for pharmacy reporting
- Custom API + Postgres — you'd rebuild auth, RLS, storage, and sync for free; Supabase already ships them
- **Sync layer option:** add PowerSync on top of Supabase when multi-device conflict handling needs to be more than LWW

### Users & roles: Supabase Auth + `staff` profiles

- **Auth accounts** (email/password, optional magic link) for every staff member; the till stays PIN-first for speed but the PIN is now backed by a real account
- **PIN fast sign-in:** 4–6 digit PIN, stored only as `pin_hash` (pgcrypto `crypt`/`gen_salt('bf')`) — never plaintext (current repo ships plaintext PINs in `src/data.ts:126`). Verify via a Postgres RPC so hashes never leave the server; rate-limit + lockout after N failures
- **Roles** (map 1:1 to PharmacyNext marketing): `super_admin` (platform), `pharmacy_admin`, `pharmacist`, `manager`, `cashier`
- **Permission matrix** enforced server-side (RLS policies + per-role check function), not just UI hiding:
  - cashier: sell, refund with approval, hold/recall, customer lookup
  - pharmacist: Rx verify/dispense, interaction overrides, clinical notes
  - manager: voids, drawer opens, stock adjustments, staff schedule
  - pharmacy_admin: staff CRUD, settings, transfers, reports
  - super_admin: organizations, platform dashboards
- **Sessions:** JWT refresh; client-side idle lock (reuse the existing lock screen); route guards per role; every audit entry's `actor` comes from the session, never from the client
- **User management screens:** add/edit/deactivate staff, reset PIN (admin only), shift/time-clock tracking

---

## 1. Platform & multi-tenancy (P0)

- **`organization_id` scoping** on every table + RLS policies — staff at one pharmacy can never read another's data
- **Tenant provisioning:** create pharmacy = insert `organizations` row + default admin staff, in one transaction; no per-tenant infrastructure
- **Platform admin console:** list/manage pharmacies, plan & feature-flag config, usage dashboards (pharmacies, staff, transactions), tenant suspend/activate
- **Pharmacy provisioning without payments:** manual onboarding + CSV bulk import of staff and catalog per pharmacy

## 2. POS till operations (P1)

- **Shift/register sessions:** open/close drawer, cash in / cash out ("paid in/out"), per-shift transaction log
- **X/Z reports:** end-of-day summary — sales, refunds, tender totals, drawer reconciliation; Z closes the shift (excludes tax detail per scope)
- **Voids with manager approval** (logged, audit-trail)
- **Refunds:** full, partial, and exchange; reason required; restock-or-not decision per line
- **Layaway / holds** with expiry (build on existing hold/recall, `store.tsx:47`)
- **Store credit / store account** per customer, separate from loyalty points
- **Gift cards** (issue, reload, redeem, balance lookup)
- **Hardware:** thermal receipt printer (80mm ESC/POS), auto-open cash drawer, barcode **label** printing, scale integration
- **Multiple tender types** per sale (already there) + **tip handling** where applicable
- **Quotes / estimates:** price a sale without completing it, save as quote, convert to sale later (expiry on quotes)
- **Digital receipts:** email/SMS receipt option per customer in addition to print
- **Cash over/short log:** expected-vs-counted drawer per shift, variance flagged and attributed
- **Free-form sale lines:** services, delivery fees, and sundries as register lines (no product required) (P2)
- Keep keyboard shortcuts (F1–F8) and scanner-beep UX

## 3. Clinical & regulatory (P1 — the pharmacy-specific moat)

- **NDC/GS1 support:** NDC codes as first-class identifier, NDC database lookup (rxnorm/NDC directory) for auto-filling catalog fields
- **Controlled-substance (C-II) compliance:** lot-level C-II movement log, daily closing inventory, DEA 222-style transfer/order records (repo only flags `Schedule` on products, `data.ts:26`)
- **E-prescribing:** EPCS/Surescripts inbound/outbound (phase 2; manual intake first), **prior-authorization** workflow with status tracking
- **Hard-copy scanning:** attach scanned Rx images per prescription (Supabase Storage)
- **Clinical checks at POS/dispense:** drug–drug, drug–allergy (use existing customer allergy field, `Customers.tsx:148`, plus structured allergy table), duplicate therapy, dose-check (adult/pediatric/renal), refill-too-soon, pregnancy/lactation flags
- **Insurance claims:** NCPDP D.0-style claim submission (or API adapter), co-pay calculation, claim status/adjudication lifecycle (pending/verified/rejected exists as a stub), resubmission; Medicare/Medicaid plan profiles; discount-card (GoodRx-style) cash pricing override
- **HIPAA/privacy:** encrypted storage at rest, audit log tamper-evidence (hash chain), patient consent flags, role-scoped data access (pharmacist-only clinical notes), idle lock
- **Counseling documentation & signature capture** at dispense
- **Rx label printing** with warnings/interaction flags; **compounding** support (formulation, fees, label)
- **Medication synchronization (med-sync), MTM, adherence packaging** workflows
- **Generic substitution at the till:** generic-available prompt with DAW codes (dispense as written) documented on the Rx and receipt
- **Refill tracking:** refills remaining and Rx expiration date per prescription (currently absent from the Rx model, `data.ts:107`)
- **Restricted OTC sale log:** age-gated and monitored products (e.g., pseudoephedrine) — ID capture, purchase limits, mandatory log
- **Prescriber directory:** doctor profiles (NPI, DEA, contact, fax) linked to prescriptions, with per-prescriber Rx history
- **Patient back-order queue:** out-of-stock Rx → order for patient, notify on arrival, convert to sale
- **Rx transfer in/out** between pharmacies with transfer documentation
- **Real-time insurance eligibility check** (plan lookup / card scan) before filling (P2)
- **Vaccination/immunization records** per patient (administered doses, schedules) (P2)
- **Patient–lot traceability:** forward/backward lot tracing — every sale records which lots were dispensed, so a recall lookup shows exactly which patients received a lot
- **Reverse distributor & destruction:** C-II and expired returns go through a reverse distributor; destruction/disposal logs with approval
- **Third-party payer refunds:** when an insurance-paid Rx is returned, credit/recoupment to the payer (not just cash to patient)
- **Waiting bin / charge-on-pickup:** dispensed Rx staged for pickup, patient notified, payment collected at pickup (standard pharmacy pickup flow)
- **Refill authorization requests:** fax/electronic refill requests to the prescriber with status tracking (P2)
- **Patient education leaflets:** printable monographs with warnings generated per Rx (P2)

## 4. AI & decision support (PharmacyNext differentiator — P1)

- **Handwritten prescription OCR** → extract meds/dosages → fuzzy match against catalog/inventory, pharmacist review before accept
- **Drug interaction checker** at POS: flag dangerous combos before checkout; pharmacist override with documentation
- **Demand forecasting:** per-product/per-pharmacy next-period demand from sales history; **reorder suggestions** with suggested quantity (repo has only a static `reorderLevel`, `data.ts:30`)
- **Anomaly detection:** unusual return patterns, dead stock (no sales in X days), stock vs sales divergence — surfaced as dashboard alerts
- All AI outputs must be **reviewable and logged** (human-in-the-loop; audit entries)

## 5. Inventory & supply chain (P1)

- **Supplier management:** supplier entity (name, contact, payment terms, lead time, min order qty) replacing the free-text `supplier` string on products (`data.ts:37`); supplier list with per-supplier products and balances
- **Purchase orders & receiving:** create PO from reorder suggestions, receive against PO, batch/expiry entry at receive, PO linked to supplier invoice
- **Returns to vendor (RTV)** and **recall handling** (batch-level recall lookup + patient notification)
- **Dead-stock report** and **expiry write-off workflow** (approval-gated)
- **Cycle counting** with variance approval; **inventory valuation** (FIFO by cost — cost field exists)
- **Negative-stock prevention** (enforced at transaction level)
- **Cold-chain / temperature logging** for refrigerated items
- **Multi-branch shared ledger** with real transfer lifecycle (requested → approved → shipped → received exists as stub, `data.ts:149`) — persisted and synced
- **CSV import** of catalog (export already exists, `Inventory.tsx:78`)
- **Reorder automation:** auto-generate POs at reorder point, with manager approval
- **Product variants:** strength/pack-size variants under one product (e.g., Amoxicillin 250/500 mg) sharing supplier and ingredient data
- **Category tree:** nested categories (parent/child, e.g., Analgesics → NSAIDs → Ibuprofen) replacing the flat `CategoryId` list (`data.ts:5`); drives roll-up reporting
- **Item tree:** product → variants → UOMs → ingredients/compounding recipe (item master hierarchy), browseable in Inventory; ingredient costs roll up into compounded items (P2)
- **Vendor price book:** store each supplier's current price list per product; compare prices when creating POs
- **Landed cost:** freight/duty added to received cost for true margin (P2)
- **Kit / bundle products** composed from components with auto-stock deduction (P2)
- **Free / sample stock:** zero-cost lots tracked separately from paid stock (P2)
- **Near-expiry markdown suggestions** driven by the expiry horizon (P2)
- **Item images** per product (storage + catalog display) (P2)
- **Consignment stock:** supplier-owned lots on the shelf, visible but unpaid; settled on sale through AP (pay-on-sale) (P2)

### Accounts payable (supplier invoices) (P1)

- **Invoice tracking:** one invoice per received PO (number, date, due date, terms: net-7/30, early-payment discount)
- **Pay later / open balance:** invoices are recorded unpaid at receive time — payment is not required up front
- **Partial payments:** pay any amount against an invoice (e.g., half now), track the remaining balance; multiple partial payments per invoice
- **Selective payment:** pay some invoices, leave others open — per-invoice workflow, not bulk settlement
- **Payment methods:** cash, bank transfer, card — each payment recorded with date, method, reference
- **Credit/debit notes** for supplier returns (RTV) and price corrections, offset against the supplier balance
- **AP report ("see everything"):** supplier balance summary, open invoices with due dates, aging buckets (current / 30 / 60 / 90+), partial-payment history per invoice, paid-vs-open totals, projected cash out per week; export to CSV/Excel
- **Notifications:** due-soon and overdue invoice alerts on the dashboard bell
- **Supplier statement matching:** reconcile supplier statements against our AP ledger, flag mismatches
- **Accounting export:** journal of sales, AP payments, and refunds for QuickBooks/Xero/CSV handoff

### Expenses (operating costs) (P1)

- **Expense tracking:** every non-stock cash-out — rent, salaries, utilities, transport, repairs, misc opex — with category, amount, date, and payee
- **Expense categories** (rent, salaries, utilities, marketing, admin…) with per-category budgets
- **One-off and recurring expenses** (monthly rent auto-suggested; recurring templates)
- **Entry at the till or admin:** record an expense like a cash-out on the register (ties into X/Z drawer reconciliation), or via the admin panel
- **Receipt scans** attached per expense (Supabase Storage)
- **Expense reports:** by category/period/payee, recurring totals, export CSV/Excel
- **P&L:** revenue − COGS − expenses per period (with margin report, §6)

### Units of measure (multi-UOM pricing) (P1)

- **Per-product UOM set:** e.g., tablet, strip of 10, box of 100, bottle — each with its own **sale price and cost** (sell a strip at strip price, a box at box price)
- **Conversion factors:** base unit (e.g., tablet) + conversion (strip = 10, box = 100); stock is tracked in the base unit, sales convert automatically
- **Sell in any UOM:** pick the UOM at the register; UOM's own price wins over base-price conversion
- **Per-UOM barcode** for scanner-driven UOM selection; UOM shown on receipts, labels, and CSV export
- **Purchase UOM vs sale UOM** (order by box, sell by strip), with cost per UOM for true margin
- **Reorder levels in base UOM**; transfers and count sheets convert via base unit
- Replace single `price`/`cost` fields (`data.ts:34`) with a UOM table per product, keeping current fields as the default/base UOM for back-compat

### Batch & lot costing (P1)

- **Per-lot cost and price recorded at receive** — today only a lot-level *clearance* price exists (`data.ts:24`); margin and valuation become per-lot accurate
- FEFO remains the sell order; per-lot valuation for FIFO cost-of-goods

## 6. Analytics & reports (P1/P2)

- **Profit margin** per product/category/period (cost is already tracked; no margin reporting today)
- **COGS & inventory valuation report:** cost of goods sold per period, ending stock value (FIFO per lot)
- **P&L report:** revenue − COGS − expenses per period (see Expenses, §5)
- **Purchase reports:** buy history by supplier/product, price-change history, stock movement (in/out/adjust) log
- **Expiry value-at-risk report:** cost value of lots expiring ≤90 days (potential loss exposure) (P2)
- **Supplier performance report:** fill rate, lead time, damage/credit history per supplier (P2)
- **Customer LTV** (lifetime spend − refunds, cohort by signup period)
- **Category breakdowns** (categories exist; no category reporting)
- **Report exports:** CSV + Excel for every report (today: inventory lots only)
- Sales by hour/day, tender mix, staff performance, top/bottom sellers, customer churn/regulars
- **Custom report builder** (date range, filters, saved views)
- Live dashboard upgrade: P&L summary, alerts panel (forecast + anomaly outputs)

## 7. Customers & engagement (P2)

- **Full patient profiles:** DOB, address, prescriber links, medication history, allergies (structured), notes — beyond the current loyalty book (`data.ts:117`)
- **Notifications:** SMS/email "ready for pickup", refill reminders, adherence nudges, **due-list generation** (scripts due in N days)
- **Promotions engine:** coupons, discount rules, birthday rewards, targeted offers — beyond the flat % discount (`modals.tsx:18`)
- **Delivery module:** patient address book, delivery-fee lines, driver/route assignment, proof-of-delivery capture (P2)
- **Configurable loyalty:** points rate, tiers (Bronze/Silver/Gold exist as demo), redemption rules per organization

## 8. Settings (per-organization, non-tax) (P0/P1)

- **Currency** and **invoice/receipt template** (footer text, logo, terms) — replace hardcoded `STORE`/`TAX_RATE` constants (`data.ts:158`)
- **Loyalty program configuration** per pharmacy
- **Receipt/label printer defaults**, scanner behavior, keyboard shortcut remap
- **Notification preferences** (SMS/email channels per pharmacy)
- **Branch/store profile** (name, address, phone, NPI/DEA numbers shown on labels)

## 9. Quality & operations (P0/P2)

- **Tests:** unit (reducers/ledger logic), component, e2e — repo currently has none (`package.json` has no test script)
- **Lint + CI** (typecheck exists; add ESLint, CI pipeline, pre-merge checks)
- **Error tracking** (Sentry or equivalent), health checks, structured logging
- **Deployment:** CI/CD for the web app + migrations management for the DB
- **Automated backups:** scheduled DB snapshots + retention policy; restore drill tested (today backup/restore is manual JSON, `App.tsx:199`)
- **Full data export** per organization (GDPR-style) for migration or audit
- **Localization/i18n** (currently en-US hardcoded)
- **Mobile/tablet support** (responsive shell exists; optimize touch flows)
- **Online refill requests / e-commerce intake** with curbside/delivery workflow flags
- **Multi-terminal reconciliation** per pharmacy (terminal id on every transaction — "Terminal 01" is currently a hardcoded string)
- **Staff time-clock / scheduling** tied to staff profiles

---

### Suggested build order

1. **P0:** Supabase setup (schema, RLS, auth, PIN RPC), settings core, user management, tests+CI baseline, automated backups
2. **P1:** clinical checks + CS compliance + restricted OTC logs, insurance claims, prescriber directory, generic substitution/DAW, refill tracking, patient–lot traceability, reverse distributor & third-party refunds, waiting bin/charge-on-pickup, X/Z & drawer ops, PO/receiving + accounts payable + expenses, UOM pricing + product variants + category tree, forecasting + reorder
3. **P1:** Rx OCR + interaction checker (AI), anomaly detection, margin/LTV + COGS reporting, accounting export
4. **P2:** patient engagement (digital receipts, notifications, promotions, configurable loyalty), vaccination records, back-order queue, Rx transfer, consignment stock, delivery module, patient leaflets, localization, e-commerce intake

> Source: gap analysis of `CounterRx` (branch `pos-system-features-review-b5fac`) vs
> PharmacyNext claims and standard pharmacy POS requirements. Stripe billing and tax
> configuration excluded by project decision.