# CounterRx Feature Roadmap Plan — closing the pharmacy-POS gaps

Branch: `fix-backend-db-supabase`. Stack: React/Vite SPA + Supabase (Postgres, Auth, RLS, Realtime).
No custom API server; server-side work happens in Supabase Edge Functions (Deno).
AI provider: **OpenRouter**, called **only through a Supabase Edge Function proxy** — the
OpenRouter key lives in the function's env var, never in `import.meta.env`/`define` of the
client build (USER.md rule: a static SPA ships every injected key; provider keys belong
behind a serverless function).

Each phase is independently shippable (commit + gate + tests green). Gaps below are the ones
verified against the code in 2026-08-21 (see the "still lacking" analysis). Items marked
**(partner)** need a real-world credential/contract (DEA/Surescripts/NCPDP trading partner)
and are spec'd, not implemented, until a partner exists.

## Phase A — Till ops & cash handling (no AI, pure logic+UI)

Closes: X/Z reports, drawer reconciliation, paid-in/paid-out, cash over/short, voids with
manager approval, store credit, gift cards, layaway expiry.

- `TxType` already has `void | paid_in | paid_out` (`data.ts:994`); History already renders
  refunds. Extend:
  - **Voids:** manager-approval dialog (role `can(refund)`), reason required, audit entry.
  - **Paid in / paid out:** drawer button on Register, dialog, typed transaction, shown in
    History + X/Z.
  - **X/Z reports:** new Reports tab. X = sales/tenders/refunds/voids/paid-in-out summary,
    no close. Z = same + closes the shift (`currentShift`), prompts for counted cash →
    **cash over/short** variance flagged + attributed. Stores an XZ entry per shift in
    `timeEntries`-style table or a new `shifts_closure` JSONB row.
  - **Store credit / gift cards:** new `store_credits` table (customer_id, balance,
    issued_at, expires_at); redeemable as a tender in the payment modal; gift cards are a
    credit with a code (barcode-scannable). Layaway = existing `HeldSale` + `expiresAt`
    already in model — surface expiry in History/Register recall and auto-expire.
- Files: `src/views/Register.tsx`, `src/views/History.tsx`, `src/views/Reports.tsx`,
  `src/store.tsx`, `src/data.ts`, migration `2026082xxxxxxx_till_ops.sql`, `src/views/Finance.tsx`.
- Gate `gates/till-ops.md`: X/Z produces correct drawer math; void requires manager;
  store credit redeems and deducts; unit tests for shift closure math.

## Phase B — Supply chain depth (model exists, UI missing)

Closes: multi-UOM at register, per-lot cost at receive, RTV, recall workflow, expiry
write-off, cycle counting, cold-chain flag.

- **UOM at register:** `Uom`/`SAVE_UOMS` already exist (`store.tsx:89`); Inventory already
  edits batches. Add UOM editor UI in Inventory product form (per-UOM price/cost/factor,
  per-UOM barcode) and a UOM picker on the register line (sells in any UOM, converts via
  factor; stock in base unit). This is the single highest-value inventory gap.
- **Per-lot cost at receive:** receiving dialog (PO receive → add lot) gains cost/price
  fields per lot (`Batch` gets `cost`), so FIFO margin is lot-accurate.
- **RTV / recall / write-off / cycle count:** new Inventory actions — RTV creates a
  transfer-like movement + AP credit; recall lookup by lot (patient trace already exists
  via `TxLine.alloc`), expiry write-off workflow (manager approval), cycle count sheet with
  variance approval, `coldChain` boolean on Product + temp-log lines.
- Files: `src/views/Inventory.tsx`, `src/views/Register.tsx`, `src/modals.tsx`, `src/data.ts`,
  migration `2026082xxxxxxx_lot_costing.sql`.
- Gate `gates/supply-chain.md`: UOM sale deducts base units correctly; lot cost flows into
  margin report; recall by lot returns the patient list.

## Phase C — Clinical wiring (the moat; data model largely exists)

Closes: structured interaction/allergy checks at POS, C-II compliance log, restricted-OTC
capture, refill/expiry enforcement, DAW at till (already present), Rx label printing,
hard-copy scan attach, waiting bin/charge-on-pickup, patient–lot traceability.

- **Clinical checks at POS:** seed real `interaction_pairs` rows (a curated set, e.g.
  20–30 major pairs to start); Register already flags `severity==="major"` via
  `findInteractions` — add allergy check against `Customer.allergies` (structured table),
  duplicate-therapy (same generic in cart), and refill-too-soon (last fill + daysSupply).
  Blocking vs warn by severity; pharmacist override with audit entry.
- **C-II compliance:** `Schedule` flag exists on Product. Add `c2_movements` table (lot,
  qty, type, staff, timestamp) and a daily closing-count entry; transfer/order doc numbers
  (DEA 222-style) recorded — **(partner)** for real DEA filings.
- **Restricted OTC:** `restricted_log` table exists; add the capture form at the till
  (ID, qty limit enforcement, log entry) when a restricted product is sold.
- **Refill/expiry:** Rx model already has `refillsAuthorized/refillsRemaining/rxExpiry` —
  enforce at dispense (deny expired/refill-exhausted), surface in Prescriptions.
- **Rx label printing:** printable label view (window.print, 2×1" label CSS) with warnings;
  **hard-copy scan:** Supabase Storage bucket `rx-docs` + attach per prescription.
- **Waiting bin:** `waiting_bin` status on fill — staged for pickup, notify (Phase G SMS),
  collect payment at pickup.
- Files: `src/views/Prescriptions.tsx`, `src/views/Register.tsx`, `src/data.ts`,
  `supabase/seed.sql`, migration `2026082xxxxxxx_clinical.sql`, Storage bucket.
- Gate `gates/clinical.md`: major interaction blocks sale unless overridden+logged; C-II
  movement logged; expired Rx cannot dispense; label prints.

## Phase D — Insurance claims (NCPDP D.0-style) — **(partner)** for live adjudication

Closes: claim submission, co-pay calculation, status lifecycle, resubmission.

- Build the claim object + UI now (patient/plan/member, product, qty, pricing, DAW,
  prior-auth flag), persist as `insurance_claims` rows with status lifecycle
  (pending → verified/rejected), manual adjudication screen for now.
- Wire an API adapter interface (`lib/claims.ts`) so a real trading-partner endpoint
  (or NCPDP gateway) plugs in later. Co-pay calc per plan profile.
- Gate `gates/claims.md`: claim lifecycle round-trips; co-pay math unit-tested; adapter
  interface documented.

## Phase E — Hardware (browser-native only)

Closes: thermal receipt printer, cash-drawer kick, barcode label printing, scale.

- **Printing:** ESC/POS over Web Serial (`navigator.serial`) with a USB fallback to
  window.print for 80mm receipt; label printing reuses the label CSS from Phase C.
- **Cash drawer:** drawer-kick pulse via the printer's serial port (standard ESC `\x1bp0`).
- **Scale:** Web Serial read from a scale, auto-fill quantity — optional, flag-gated.
- This is device-dependent; implement the serial module behind a feature flag with a
  graceful "no hardware" fallback (current behavior).
- Gate `gates/hardware.md`: serial module unit-tests the escape sequence builder; fallback
  path unchanged.

## Phase F — Analytics & engagement

Closes: customer LTV, supplier performance, expiry value-at-risk, digital receipts,
configurable loyalty, promotions, notifications.

- **Reports:** LTV (lifetime spend − refunds, cohort by signup), supplier performance
  (fill rate/lead time/damage — data exists in POs/AP), expiry value-at-risk
  (cost of lots expiring ≤90d). All exportable CSV (export helper exists).
- **Digital receipts:** email/SMS receipt — send via Edge Function using a transactional
  provider (Resend for email — **(partner)** for the API key; SMS provider later). PDF or
  HTML receipt from existing receipt data.
- **Configurable loyalty/promotions:** org settings gain loyalty rate/tiers and a coupons
  table (code, %/amount, expiry, customer scope) applied in the payment modal.
- Gate `gates/analytics-engagement.md`: LTV/supplier/expiry reports match seeded data;
  coupon applies; digital receipt emails (dev mode logs instead of sending).

## Phase G — AI via OpenRouter (the PharmacyNext differentiator)

Closes: Rx OCR, interaction checker assist, demand forecasting, reorder suggestions,
anomaly detection, dashboard alerts.

### Architecture (mandatory)
- **`supabase/functions/ai-proxy`** (Deno Edge Function): the ONLY caller of OpenRouter.
  Env var `OPENROUTER_API_KEY` set server-side via `supabase secrets set`. CORS restricted
  to the app origin; auth = the user's Supabase session (RLS-style check). All calls and
  outputs logged to `ai_log` (prompt hash, model, latency, output, review status) —
  human-in-the-loop: AI outputs never auto-apply, always reviewable and audited.
- Client calls the proxy URL with the session token; no key in the bundle.
- Models via OpenRouter (swap any time): vision model for OCR (e.g. `google/gemini-flash`-class),
  fast LLM for checks/classification, LLM for forecasting prompts. Defaults live in one
  const in the function; no per-call model config in the UI.

### Features
1. **Rx OCR (P1):** photo → JSON (med, dose, sig, qty, refills, prescriber) → fuzzy match
   against catalog → pharmacist review screen → create prescription. Logged + reviewable.
2. **Interaction checker assist (P1):** LLM cross-checks cart + patient allergy list as a
   second pass over the curated Phase C pairs; surfaces novel conflicts for pharmacist
   review. Never blocks on its own.
3. **Demand forecasting + reorder (P1):** per-product next-period demand from sales
   history + seasonality, reorder suggestions w/ qty (replaces static reorderLevel).
4. **Anomaly detection (P1):** unusual return patterns, dead stock (no sales in N days),
   stock-vs-sales divergence → dashboard alerts panel (P&L summary + alerts).
- Files: `supabase/functions/ai-proxy/index.ts` + `deno.json`, `src/lib/ai.ts`,
  `src/views/Dashboard.tsx`, `src/views/Prescriptions.tsx`, `src/views/Inventory.tsx`,
  `src/views/Register.tsx`, migration `2026082xxxxxxx_ai_log.sql`.
- Gate `gates/ai-openrouter.md`: proxy returns model output with session auth; no key in
  client bundle (grep the built `dist/`); OCR → reviewed Rx end-to-end; forecast uses real
  history; alerts render; every call lands in `ai_log`.

## Phase H — Quality & operations

Closes: error tracking, CI/CD, automated backups, full org export, multi-terminal ID.

- **Error tracking:** Sentry (browser) — **(partner)** for the DSN/org; feature-flag off
  until configured.
- **CI/CD:** extend the existing GitHub Actions CI with a deploy job (Vite build → Supabase
  functions deploy + `db push` on main-merge). Backups: scheduled snapshot of the remote DB
  (`supabase db dump --remote` in a nightly workflow + retention) or Supabase PITR if
  enabled on the plan.
- **Multi-terminal:** terminal id from settings (replace hardcoded "Terminal 01",
  `App.tsx:431`) on every transaction; reconciliation per terminal in X/Z.
- **Full org export:** GDPR-style dump endpoint/button (all org tables → JSON/CSV bundle).
- Gate `gates/quality-ops.md`: CI deploys; backup restore drill logged; export contains all
  org tables; terminal id flows to transactions.

## Dispatch order & gates

Phases A→B→C are the core value and are AI-independent — build them first, in order
(each commits with its gate). D/E need partners for live use but the local spec parts can
land any time. F before G (reports + digital receipts are inputs to alerts). G last but
standalone. H can interleave.

| Phase | Gate | AI | Partner needed for live use |
|---|---|---|---|
| A Till ops | `gates/till-ops.md` | — | — |
| B Supply chain | `gates/supply-chain.md` | — | — |
| C Clinical | `gates/clinical.md` | — | — |
| D Claims | `gates/claims.md` | — | NCPDP/gateway |
| E Hardware | `gates/hardware.md` | — | device-specific |
| F Analytics & engagement | `gates/analytics-engagement.md` | — | Resend/SMS keys |
| G AI (OpenRouter) | `gates/ai-openrouter.md` | OpenRouter via Edge Function | OpenRouter key |
| H Quality & ops | `gates/quality-ops.md` | — | Sentry DSN |

Abandon-scope note: EPCS/Surescripts e-prescribing and DEA 222 filing are **(partner)** —
they're spec'd inside Phase C/D but not implemented without a real credential. Scale
integration (Phase E) is optional/flag-gated.
