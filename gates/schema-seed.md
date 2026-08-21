# Leaf: schema-seed
- [x] Migration file covers all persisted domains.
  CHECK: `grep -c '^create table public\.' supabase/migrations/20260821000001_init.sql`
  EXPECT: 22
  EVIDENCE: `grep -c ...` returned 22 public tables; remote introspection confirmed all 22 tables have rows/RLS.
- [x] Cloud migration is applied.
  CHECK: `supabase db push`
  EXPECT: exit 0 / Finished
  EVIDENCE: `supabase db push --dry-run` returned `upToDate: true`; remote migration ledger contains 20260821000001 and 20260821000002.
- [x] Seed parses and populates all domain tables.
  CHECK: `node scripts/db.mjs supabase/seed.sql`
  EXPECT: exit 0
  EVIDENCE: `node scripts/db.mjs supabase/seed.sql` exited 0 (`ROWCOUNT 0` on idempotent rerun); remote counts include products 40, customers 9, transactions 10, staff 5, profiles 5, auth.users 5.
