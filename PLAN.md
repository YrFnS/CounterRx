# CounterRx Supabase Backend — Build Plan (orchestrated, unlazy)

Branch: fix-backend-db-supabase. Target: new Supabase project `counterrx` (ref edxsfekxnkhhugejfoqi).

## Architecture (chosen)

- Supabase PostgreSQL + Auth + Row Level Security + Realtime. No custom API server.
- Keep the existing reducer/views intact (features preserved). Swap the persistence substrate:
  `load()` hydrates from Supabase (fallback: existing make* seeds → upsert); the persistence effect
  upserts changed collections; Realtime keeps state fresh across terminals.
- Nested line/detail data (tx lines, batches, uoms, fields, kit, deliveries lines, payments, credits,
  web order items, prescription insurance/PA) is embedded JSONB on parent rows — the POS app already
  models these as embedded arrays; this keeps sync 1:1 with the TS object shape. Top-level FKs still
  enforced (product, customer, prescriber, supplier ids).
- Auth: Supabase Auth email+password per staff member (`<staff_id>@counterrx.local`),
  `profiles` links auth.uid → staff + role. RLS mirrors the app's PERMS matrix via `auth_role()`.

## Contracts

- `src/lib/sync.ts` owns the `BackendData` type and exports `loadBackendData(seed)`, `persistBackendData(data)`, `subscribeToBackend(onChange)`, `signInStaff(staffId, pin)`, and `signOutStaff()`.
- `BackendData` contains every persisted State collection: products, transactions, prescriptions, prescribers, customers, transfers, backorders, rxTransfers, suppliers, purchaseOrders, apInvoices, expenses, deliveries, webOrders, timeEntries, staff, settings, restrictedLog, audit, shifts, snapshots. `currentShift`, cart, held sales, lockouts, UI state, receipt, and toasts remain local/session state.
- Sync must be best-effort offline-safe: failed reads return the provided seed; failed writes do not crash the UI; errors are surfaced via `console.warn` only. No service-role key in frontend.
- Realtime callback reports the changed table name; store decides whether to reload that collection.
- Snake-case DB columns map to existing camelCase TypeScript objects; nested JSON arrays remain the existing object shape.

## Leaves (disjoint ownership)

| Leaf | Owns | Needs | Tier |
|---|---|---|---|
| schema-seed | `supabase/migrations/*`, `supabase/seed.sql`, `supabase/config.toml` | existing `data.ts` model | high | 
| backend-sync | `src/lib/supabase.ts`, `src/lib/sync.ts` | Contracts above; migration table names | high |
| store-auth | `src/store.tsx`, `src/App.tsx` | backend-sync verified | high |
| e2e-quality | `outputs/e2e/*`, package scripts only if required | all prior leaves | medium |

## Dispatch schedule

- Dispatch schema-seed and backend-sync concurrently.
- Verify both gates and typecheck their owned code.
- Dispatch store-auth against the verified sync contract.
- Run e2e-quality only after the integrated app builds and the cloud seed is non-empty.
- Root gates are in `GATES.md`; leaf gates are in `gates/`.

## Gates

`GATES.md` (10 root gates) plus one gates file per leaf. Report must re-measure and paste the ledger.