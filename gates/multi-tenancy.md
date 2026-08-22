# Leaf: multi-tenancy
- [x] Organizations table exists with seed org row.
  CHECK: `grep -c 'create table if not exists public.organizations' supabase/migrations/20260821000003_organizations.sql`
  EXPECT: 1
  EVIDENCE: migration 20260821000003 pushed to remote counterrx; `SELECT count(*) FROM organizations` = 1
- [x] Every domain table carries organization_id (not-null, default seed org).
  CHECK: `grep -c 'add column if not exists organization_id' supabase/migrations/20260821000003_organizations.sql`
  EXPECT: 21
  EVIDENCE: 21 alter statements in migration
- [x] current_org_id() resolves auth.uid() → profiles → staff → organization_id.
  CHECK: `grep -A6 'function public.current_org_id' supabase/migrations/20260821000003_organizations.sql`
  EXPECT: joins profiles to staff on staff_id, filters p.id = auth.uid()
  EVIDENCE: function defined in migration, pushed
- [x] Every domain-table policy is org-scoped (read and write).
  CHECK: `grep -c 'organization_id = public.current_org_id()' supabase/migrations/20260821000003_organizations.sql`
  EXPECT: ≥ 42 (read + write per table)
  EVIDENCE: 42+ occurrences; suppliers stays read-only (no write policy added)
- [x] Authenticated seeded staff still read their org's rows; a second org's rows are invisible.
  CHECK: remote SQL — sign in as a seeded user, select products; insert probe org-B row, select as org A, expect empty, delete probe
  EXPECT: org A sees only org A rows
  EVIDENCE: s001 (org A) auth via /auth/v1/token → GET /rest/v1/products count=40; org-B probe product inserted via postgres, count via s001 JWT = 0; probe deleted
