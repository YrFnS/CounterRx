# Leaf: schema-seed
- [ ] Migration file covers all persisted domains.
  CHECK: `grep -c '^create table public\.' supabase/migrations/20260821000001_init.sql`
  EXPECT: 22
  EVIDENCE: pending
- [ ] Cloud migration is applied.
  CHECK: `supabase db push`
  EXPECT: exit 0 / Finished
  EVIDENCE: pending
- [ ] Seed parses and populates all domain tables.
  CHECK: `node scripts/db.mjs supabase/seed.sql`
  EXPECT: exit 0
  EVIDENCE: pending
