# CounterRx Supabase Backend — Acceptance Gates

Gates marked CHECK are runnable; EXPECT gives the pass condition. Evidence line replaced with actual output when checked.

## G1. Local Supabase stack runs and is linked
- [ ] `supabase status` shows running services (db, auth, postgrest...)
- CHECK: `supabase status --output json 2>&1 | grep -o '"API_URL":\s*"http[^"]*"'`
- EXPECT: a non-empty API_URL

## G2. Fresh migration applies cleanly
- [ ] `supabase db reset` from scratch completes with 0 errors
- CHECK: `supabase db reset --local 2>&1 | tail -5`
- EXPECT: contains "Finished" style success and no `ERROR`

## G3. Seed populates every domain table
- [ ] Every table in schema has > 0 rows after seed
- CHECK: `supabase db reset --local` then `psql`/`npx supabase` query counts
- EXPECT: each domain table row count ≥ 1

## G4. Auth: every supported role can sign in
- [ ] A user exists for every role: super_admin, pharmacy_admin, manager, pharmacist, cashier
- CHECK: count auth users grouped by staff_role claim/profiles.role
- EXPECT: all 5 roles present and reachable

## G5. RLS active on all data tables
- [ ] RLS enabled and policies defined for select/insert/update/delete
- CHECK: `psql` query `select tablename, rowsecurity from pg_tables where schemaname='public'`
- EXPECT: rowsecurity=true on all domain tables

## G6. Project typechecks
- [ ] `npm run typecheck` exits 0
- CHECK: `npm run typecheck 2>&1; echo exit:$?`
- EXPECT: exit:0

## G7. Production build succeeds
- [ ] `npm run build` exits 0 and emits dist/
- CHECK: `npm run build 2>&1 | tail -3; echo exit:$?`
- EXPECT: `✓ built` and exit:0

## G8. App runs against the local backend
- [ ] `npm run dev` serves on :3000 with Supabase reachable
- CHECK: browser loads app; console has no supabase connection errors

## G9. Browser: every role + core features pass e2e
- [ ] Log in as each role; exercise products, inventory, customers/patients, prescriptions, sales, payments, shifts, reports, audit/history, settings, logout (screenshots + notes in outputs/e2e)
- EXPECT: no unhandled errors; each role can perform its permitted actions

## G10. Fresh-migrate-and-seed reproducible
- [ ] From a clean DB, migrate + seed reproduces a working app with data
- CHECK: `supabase db reset` then re-run G6/G7/G8 steps
- EXPECT: same pass as before

ABANDON: (none)