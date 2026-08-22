# CounterRx — Missing Features & Functionality Audit

_Date generated: 2026-08-23_  
_Sources mined: 32 session transcripts (`~C--Users-Itokoro-CounterRx--/`, 47 user messages), 8 git branches (`main`, `feat/phase-b/c/e/f/g-*`, `fix-backend-db-supabase`, `counterrx-production-build-plan-a993b`), and planning MDs on `main` — 9 root docs (`FEATURES.md`, `FEATURE-ROADMAP-PLAN.md`, `AUDIT-FINDINGS-PLAN.md`, `AUDIT-UI-FIXES-PLAN.md`, `E2E-REMEDIATION-PLAN.md`, `FIX-PLAN-2.md`, `GATES.md`, `PLAN.md`, `README.md`) + 15 leaf `gates/*.md` + 2 `outputs/*.md`. Implementation state verified against `main` source (`src/`, `supabase/`)._

_Legend: SHIPPED = merged to main + code present · SHIPPED-UNVERIFIED = built but live/undeployed path not confirmed · PARTIAL = data model or stub only · MISSING = not built · DEFERRED = decision to postpone._

---

## 1. Explicitly requested but missing/unverified

Requests derived from user/coordinator task prompts in the session transcripts, with code-verified delivery status.

| # | Request (paraphrased) | Session | Status |
|---|---|---|
| 1.1 | Replace PIN-pad lock screen with email + password login (user-approved **full replace**) | `2026-08-22T03-50…` (login-change) | **SHIPPED** — `App.tsx` email/password form, `signInStaffByEmail` in `src/lib/sync.ts`; commit `4d220b5`, 91 tests green. |
| 1.2 | Phase A — Till ops: X/Z reports, drawer reconcile, paid-in/out, voids w/ manager approval, store credit, gift cards, layaway expiry | `2026-08-21T14-45…`, `-15-01…` | **SHIPPED** — `gates/till-ops.md` checked; migration `…0006_till_ops.sql`; `Reports.tsx` TillTab. |
| 1.3 | Phase G backend — OpenRouter AI proxy edge function (OCR / classify / forecast / anomaly) | `2026-08-21T14-48…` | **SHIPPED-UNVERIFIED** — `supabase/functions/ai-proxy/` + `src/lib/ai.ts`/`ai-ui.ts` exist; but **V3 live AI smoke test is BLOCKED** (no `OPENROUTER_API_KEY`, function not deployed — `/functions/v1/ai-proxy` returns `NOT_FOUND`). UI degrades gracefully; real OCR/forecast unconfirmed. |
| 1.4 | R1 — Stay signed in across page reload (session recovery) | `FIX-PLAN-2.md` (2026-08-23) | **SHIPPED** — `3eaa380` `getSessionStaffId()` + reboot re-auth. |
| 1.5 | R2 — Password reset (replace Reset PIN) via `admin-set-password` edge function | `FIX-PLAN-2.md` | **SHIPPED** — `60e6567`; `supabase/functions/admin-set-password` present. |
| 1.6 | R3 — Discount visibility (quick-% chips + dedicated `$ off`, separate summary rows) | `FIX-PLAN-2.md` | **SHIPPED** — `b805cc0` per-line + invoice discounts. |
| 1.7 | R4 — UI cleanups (drop connection badge, scan-chip, i18n parity test) | `FIX-PLAN-2.md` | **SHIPPED** — `53cc599`, `3abfac0`. |
| 1.8 | R5 — Suppliers CRUD (Inventory sub-tab) + hardcoded-constant sweep | `FIX-PLAN-2.md` | **SHIPPED** — `2fee753` (`feat/suppliers-crud`); `outputs/hardcoded-audit.md` written (see §3). |
| 1.9 | R6 — Pay later / minimal AR (PaymentLeg method, Settle in History) | `FIX-PLAN-2.md` | **MISSING** — explicitly scheduled last in merge order (`R1+R2 → … → R6`), but **no branch exists, no commit on main** (`git log` shows no `pay-later`/`settle`). Not started. |
| 1.10 | Manager-role coverage (add K. Asante manager user) + route-guard verification | `2026-08-21T01-24…`, `-02-03…` | **SHIPPED** — S-006 manager seeded; `VIEW_ROLES`/`RequireRole` guards in `App.tsx`. |

_Notes:_ Sessions `2026-08-20T20-01…` through `2026-08-21T03-40…` are read-only audit/subagent prompts (backend migration survey, hardcoded-data audit, i18n/RTL audit, FEATURES-vs-code audit, plan-compare). Their findings drove the shipped fixes in §1.4–1.8 and are tracked as debt in §3.

---

## 2. Planned but incomplete

Items marked unchecked / pending / deferred in the branch planning MDs, or whose code-verified state disagrees with the plan.

| # | Item | Source (file·branch) | Status |
|---|---|---|---|
| 2.1 | **Pay later / AR** (minimal accounts-receivable) | `FIX-PLAN-2.md` (R6, main) | **MISSING** — deferred to after R1–R5 merge; never started. |
| 2.2 | **Phase D — Insurance claims (NCPDP D.0)** | `FEATURE-ROADMAP-PLAN.md` (deferred), `FEATURES.md §3` | **MISSING / SIMULATED** — only deterministic mock adjudication in `src/store.tsx` (`/* simulated PBM adjudication */`); no `rx_claims` lifecycle UI, no NCPDP adapter (`lib/claims.ts` absent). Deferred pending trading-partner gateway. |
| 2.3 | **Phase H — Quality & ops**: Sentry, CI/CD, automated backups, multi-terminal reconciliation, full org export | `FEATURE-ROADMAP-PLAN.md` (deferred), `FEATURES.md §9` | **PARTIAL / DEFERRED** — CI exists (`.github/workflows/ci.yml`); Sentry, scheduled backups, org export, per-terminal reconciliation **not built**. |
| 2.4 | **Prescriber directory UI + per-prescriber Rx history** | `AUDIT-FINDINGS-PLAN.md` Phase 4 (#5) | **MISSING** — `Prescriber` data model exists (`src/data.ts`); no dedicated UI. |
| 2.5 | **Generic-substitution prompt at till + DAW on Rx/receipt** | `AUDIT-FINDINGS-PLAN.md` Phase 4 (#6) | **MISSING** — DAW flag exists on model; no till-time generic-available prompt UI. |
| 2.6 | **Waiting bin / charge-on-pickup payment flow** | `AUDIT-FINDINGS-PLAN.md` Phase 4 (#7); `FEATURES.md §3` | **PARTIAL** — `waiting_bin` status + pickup-notification field exist (`src/data.ts`); no charge-on-pickup payment UI. |
| 2.7 | **Patient–lot recall lookup UI** | `AUDIT-FINDINGS-PLAN.md` Phase 4 (#8) | **MISSING** — `TxLine.alloc` lot traceability data exists; no recall-by-lot UI returning patient list. |
| 2.8 | **Nested category tree + roll-up reporting** | `AUDIT-FINDINGS-PLAN.md` Phase 4 (#9); `FEATURES.md §5` | **PARTIAL** — flat dynamic categories shipped (`…0013_categories.sql`, `Settings` Categories tab); nested parent/child tree + roll-up reporting **not built**. |
| 2.9 | **Excel export for reports** (currently CSV only) | `AUDIT-FINDINGS-PLAN.md` Phase 4 (#10); `FEATURES.md §6` | **MISSING** — `Reports.tsx` exports `.csv` only (line 548); no `.xlsx`/Excel anywhere in `src/` or `package.json`. |
| 2.10 | **Offline outbox UX / conflict resolution** | `AUDIT-FINDINGS-PLAN.md` F11; `gates/offline-outbox.md` | **SHIPPED (gate) / NO UX** — `offline-outbox` leaf gate checked, but no `sync_queue` table, no LWW/conflict UI; sync remains best-effort console.warn. UX for offline conflict resolution is **never built**. |
| 2.11 | **Custom report builder** (date range, filters, saved views) | `FEATURES.md §6` | **MISSING** — fixed report tabs only. |
| 2.12 | **Phase 5 P2 engagement** (notifications, promotions engine beyond coupons, vaccinations, consignment, leaflets, accounting export) | `AUDIT-FINDINGS-PLAN.md` Phase 5 | **MISSING** — tracked as deferred; none started. |

---

## 3. Known gaps & technical debt

| # | Gap / debt | Evidence | Note |
|---|---|---|---|
| 3.1 | **`BRANCHES` hardcoded constant** (inter-branch transfer `toBranch` picker) | `outputs/hardcoded-audit.md` (R5 sub-item); `src/data.ts:822` | Should be DB/settings-backed multi-site config; flagged "move to DB". Single-org today. |
| 3.2 | **Insurance adjudication is a simulation** | `src/store.tsx:640,1268` (`/* simulated PBM adjudication */`) | Not real; member ids ending in `9` deterministically fail. Blocks any real claims flow. |
| 3.3 | **NDC "directory" is a hardcoded 4-entry array** | `src/data.ts:121-124` (`NDC_DIRECTORY`) | No live NDC/GS1 lookup; auto-fill is from a fake static list. |
| 3.4 | **AI features non-functional until key deployed** | `E2E-REMEDIATION-PLAN.md` V3 (BLOCKED) | `OPENROUTER_API_KEY` + `supabase functions deploy ai-proxy` required; function currently `NOT_FOUND` on remote. |
| 3.5 | **Seed-as-fallback can still surface demo rows** | `AUDIT-FINDINGS-PLAN.md` F1/F2 (mitigated by `sync-integrity` gate) | `loadBackendData` failure path improved but the seed fallback remains the pre-auth/offline path; risk documented, not eliminated. |
| 3.6 | **`terminalId` default `"T-01"`** | `src/data.ts:718`; now editable in `Settings.tsx:126` | Configurable, but per-terminal reconciliation in X/Z not implemented (Phase H item). |
| 3.7 | **Only 1 TODO/FIXME/ponytail marker in entire `src/`** | `grep` → `src/lib/hardware.ts:8` | Healthy; the lone marker is a deliberate "avoid extra dep" note, not debt. |
| 3.8 | **Backups are local JSON download only** | `src/App.tsx:174-201` | `backup()`/`restore()` serialize to a local file; no scheduled/cloud backup or PITR drill. |
| 3.9 | **`EXPENSE_CATEGORIES` closed enum** | `outputs/hardcoded-audit.md` | Audited as acceptable; listed for completeness, do not refactor. |

---

## 4. Never-built features mentioned anywhere

Cross-referenced against `FEATURES.md` and session transcripts; none have corresponding implementation on `main` (verified by grep + view inventory — 11 view files: Customers, Dashboard, Deliveries, Finance, History, Inventory, Prescriptions, Register, Reports, Settings, Till).

**Platform / multi-tenancy (FEATURES §1)**
- Pharmacy **platform admin console** (list/manage pharmacies, plan/feature-flag, suspend) — single-org scaffold only.
- Tenant **provisioning + CSV bulk import** of staff/catalog.
- True **multi-branch shared ledger** — `BRANCHES` is a hardcoded list (`src/data.ts:822`); transfers stay within one org.

**Clinical/regulatory (FEATURES §3)**
- **E-prescribing (EPCS/Surescripts)** inbound/outbound.
- **Real-time insurance eligibility** check / card scan.
- **Prescriber directory UI** (data model only — §2.5).
- **Vaccination/immunization records** per patient.
- **Reverse-distributor & destruction logs**; **third-party payer refunds**.
- **Counseling documentation & signature capture** at dispense.
- **Compounding** support (formulation, fees, label).
- **Med-sync / MTM / adherence packaging** workflows.
- **Refill authorization requests** (fax/electronic) with status.
- **Patient education leaflets** (printable monographs).
- **Rx transfer in/out** between pharmacies with documentation (lifecycle stub only).
- **Generic-substitution prompt at till** (§2.6).
- **Waiting bin charge-on-pickup UI** (§2.7).
- **Patient–lot recall lookup UI** (§2.8).
- **Restricted-OTC sale log capture form** at till (table exists; UI uncertain — possibly partial).

**Reporting / analytics (FEATURES §6)**
- **Excel/`.xlsx` export** for any report (§2.9).
- **Custom report builder** (§2.11).
- COGS/inventory valuation, P&L, purchase-history, sales-by-hour/tender/staff as dedicated exported reports — some exist as tabs, export coverage is CSV-only.

**Customers / engagement (FEATURES §7)**
- **Email/SMS notifications** ("ready for pickup", refill reminders, due-list) — only `notifiedAt`/`phone` fields; no sending provider. _(Digital receipts explicitly excluded by decision.)_
- **Promotions engine** beyond flat coupons (birthday rewards, targeted offers).
- **Delivery module** (address book, route/driver assignment, proof-of-delivery) — `Deliveries.tsx` exists for receiving; patient delivery not built.
- **Full patient profiles** beyond loyalty book (DOB, med history structured).

**Hardware / POS (FEATURES §2)**
- **Customer-facing display** (secondary screen) — never built.
- **Scale integration** (Web Serial auto-fill qty) — `hardware.ts` flag-gated; probably unbuilt path.
- **Barcode scanner "hardware modes"** — scanner is keyboard-wedge into search only; no dedicated modes UI.
- **Quotes/estimates** (save + convert to sale).
- **Tip handling**; **free-form sale lines** (services/fees).
- Hardware printing itself **SHIPPED** (Web Serial ESC/POS in `src/lib/hardware.ts`, `…0008_hardware.sql`) behind an org setting — not missing.

**Operations (FEATURES §9)**
- **Sentry / error tracking** — not present.
- **Scheduled/cloud backups + restore drill** (§3.8).
- **Full org export** (GDPR-style JSON/CSV bundle) — not built.
- **Supplier statement matching**; **accounting export** (QuickBooks/Xero).
- **Multi-terminal reconciliation** in X/Z (terminalId editable, no per-terminal breakdown).
- **Online refill / e-commerce intake** with curbside/delivery flags.
- **Mobile/tablet touch-flow optimization** — responsive shell present, touch flows not optimized.

**Inventory (FEATURES §5)**
- **Product variants** (strength/pack-size under one product).
- **Vendor price book**; **landed cost**; **kit/bundle** auto-deduction; **consignment stock**; **free/sample stock**; **near-expiry markdown** suggestions; **item images**; **CSV catalog import** (export exists, import not built).

---

## 5. Priority ranking

Order = user-facing impact × blocker status × effort. Effort guess: S (<1d) · M (1–3d) · L (>3d / external dependency).

| Order | Item | Source | User impact | Effort | Why this order |
|---|---|---|---|---|---|
| 1 | **R6 Pay later / AR** | §1.9, FIX-PLAN-2 | H | S | Already specced, no-migration, explicitly next; closes a stated request. |
| 2 | **Excel export for reports** | §2.9, FEATURES §6 | M | S | One helper + CSV→XLSX lib; high reporting-value, low risk. |
| 3 | **Insurance claims real flow** (adapter + lifecycle UI) | §2.2, §3.2 | H | L | Core pharmacy need but blocked on NCPDP partner; start adapter interface now. |
| 4 | **Customer/SMS/email notifications** | §4 (engagement) | M | M | No provider; build notification preferences + a pluggable sender (Resend deferred per decision — use a stub). |
| 5 | **Prescriber directory + generic-substitution prompt** | §2.5, §2.6 | M | M | Data models exist; mostly UI wiring on existing Prescriptions/Register. |
| 6 | **Waiting bin / charge-on-pickup UI** | §2.7 | M | M | Model fields exist; finish the pickup-payment flow. |
| 7 | **Nested category tree + roll-ups** | §2.8 | M | M | Builds on shipped flat categories; needed for category reporting. |
| 8 | **Patient–lot recall lookup UI** | §2.8/§2.7 | H | M | Safety/traceability; recall-by-lot → patient list. |
| 9 | **Multi-terminal reconciliation + scheduled backups** | §2.3, §3.8 | H | M | Operational robustness; terminalId already editable. |
| 10 | **Offline conflict-resolution UX** | §2.10 | M | L | Needs `sync_queue` + LWW merge; architectural. |
| 11 | **Platform admin / multi-tenant provisioning** | §4 (platform) | L | L | Single-tenant today; large surface, external. |
| 12 | **E-prescribing / real-time eligibility** | §4 (clinical) | H | L | Requires external trading partners; long-horizon. |
| 13 | **Custom report builder** | §2.11 | M | M | Nice-to-have after exports land. |
| 14 | **Sentry / error tracking** | §2.3 | M | S | Feature-flag off until DSN; small add. |
| 15 | **Inventory: variants, vendor price book, CSV import, landed cost, kits, consignment** | §4 (inventory) | M | L | Broad tranche; tackle per highest-ops-value after §5–7. |

---

### Caveats / uncertainty
- Statuses marked **SHIPPED** are verified present on `main` source + commit history; **SHIPPED-UNVERIFIED** (AI proxy, §1.3) means code exists but the live/undeployed path is unconfirmed (key/function not deployed).
- "MISSING" means no implementation found via grep/view inventory; a few clinical items (restricted-OTC capture, reconciliation) may be partly present and are flagged **PARTIAL** where uncertain.
- Phase D (claims) and Phase H (quality/ops) are **deferred by explicit decision**, not oversights.
- Stripe billing and tax configuration are **excluded by decision** (tax already removed in `AUDIT-UI-FIXES-PLAN.md` P2); they are intentionally absent.
- No agent-attribution language used; findings derive from transcripts, branch MDs, and code.
