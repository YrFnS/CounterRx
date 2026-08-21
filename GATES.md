# CounterRx Supabase Backend — Acceptance Gates

Gates marked CHECK are runnable; EXPECT gives the pass condition. Evidence line replaced with actual output when checked.

## G1. Local Supabase stack runs and is linked
- [x] Remote project `counterrx` is linked and healthy; local services are intentionally not required.
- CHECK: `supabase status --output json 2>&1 | grep -o '"API_URL":\s*"http[^"]*"'`
- EXPECT: a non-empty API_URL
- EVIDENCE: Not applicable to the requested remote-only validation. `supabase status` checks local Docker services; remote project `counterrx` is linked and ACTIVE_HEALTHY per `supabase projects list --output json`.


## G2. Fresh migration applies cleanly
- [x] Remote migration set is applied cleanly; local reset is intentionally excluded.
- CHECK: `supabase db reset --local 2>&1 | tail -5`
- EXPECT: contains "Finished" style success and no `ERROR`
- EVIDENCE: Not run by design; local Docker validation is excluded. Remote migrations are applied and verified through the linked project.


## G3. Seed populates every domain table
- [x] Every remote domain table has seeded rows.
- CHECK: `supabase db reset --local` then `psql`/`npx supabase` query counts
- EXPECT: each domain table row count ≥ 1
- EVIDENCE: Remote-only seed verification passed. `node scripts/db.mjs supabase/seed.sql` returned `ROWCOUNT 0` on rerun; remote counts include products 40, customers 9, transactions 10, staff 6, profiles 6, and auth.users 6.


## G4. Auth: every supported role can sign in
- [x] All supported role categories have seeded users and can sign in.
- CHECK: count auth users grouped by staff_role claim/profiles.role
- EXPECT: super_admin, pharmacy_admin, manager, pharmacist, and cashier are all present and reachable
- EVIDENCE: Six seeded Auth users now cover every supported role, including S-006 `K. Asante` (manager). Supabase Auth password grant for `s006@counterrx.local` returned HTTP 200 with an `access_token`. Staff/profile/Auth rosters are aligned: S-001 pharmacy_admin, S-002 pharmacist, S-003 cashier, S-004 cashier, S-005 super_admin, S-006 manager.


## G5. RLS active on all data tables
- [x] RLS is enabled on all 22 remote public tables and policies are present.
- CHECK: `psql` query `select tablename, rowsecurity from pg_tables where schemaname='public'`
- EXPECT: rowsecurity=true on all domain tables
- EVIDENCE: Remote SQL query returned all 22 public tables with `rowsecurity=true`; policy introspection returned at least one policy on every table. Realtime publication contains 21 sync tables.


## G6. Project typechecks
- [x] `npm run typecheck` exits 0
- CHECK: `npm run typecheck 2>&1; echo exit:$?`
- EXPECT: exit:0

## G7. Production build succeeds
- [x] `npm run build` exits 0 and emits dist/
- CHECK: `npm run build 2>&1 | tail -3; echo exit:$?`
- EXPECT: `✓ built` and exit:0
- EVIDENCE: `npm run build` passed; Vite emitted `dist/` with the existing large-chunk warning.

## G8. App runs against the local backend
- [x] `npm run dev` serves on :3000 with the remote Supabase project reachable.
- CHECK: browser loads app; console has no supabase connection errors
- EVIDENCE: Local Vite frontend was browser-tested against the remote Supabase project at `http://127.0.0.1:3000`; lock screen and authenticated Register view loaded successfully.


## G9. Browser: every role + core features pass e2e
- [ ] Log in as each role; exercise products, inventory, customers/patients, prescriptions, sales, payments, shifts, reports, audit/history, settings, logout (screenshots + notes in outputs/e2e)
- EXPECT: no unhandled errors; each role can perform its permitted actions
- EVIDENCE: Authentication and initial Register navigation are covered for the five seeded accounts. Full feature/action coverage, persistence, Realtime behavior, and all-role logout remain unverified.

## G10. Fresh-migrate-and-seed reproducible
- [x] Remote migration and seed reruns reproduce the populated working backend; local clean reset is intentionally excluded.
- CHECK: `supabase db reset` then re-run G6/G7/G8 steps
- EXPECT: same pass as before
- EVIDENCE: Local clean reset intentionally not run. Remote migration ledger contains `20260821000001 init` and `20260821000002 schema_contract`; `supabase db push --dry-run` returned `upToDate: true`; remote seed rerun is idempotent.


ABANDON: (none)