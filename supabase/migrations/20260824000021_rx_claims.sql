-- W4.1 — NCPDP D.0 claims lifecycle.
-- Tracks the claim lifecycle for a dispensed Rx: submitted → paid / rejected
-- (→ resubmitted on reversal). Sandbox mode until a live NCPDP partner lands.
-- Mirrors the RLS pattern of `rx_transfers` (org-scoped, clinical write).

create table if not exists public.rx_claims (
  id              text primary key,
  organization_id uuid not null default public.current_org_id(),
  prescription_id text not null references public.prescriptions(id),
  patient         text not null default '',
  drug            text not null default '',
  qty             numeric(12,3) not null default 0,
  submitted_at    timestamptz not null default now(),
  status          text not null default 'submitted'
                  check (status in ('submitted','paid','rejected','resubmitted')),
  payer           text not null default '',
  amount          integer not null default 0,   -- minor units (cents)
  adjudication    jsonb,                        -- raw payer response (sandbox fields)
  created_at      timestamptz not null default now()
);

create index if not exists rx_claims_org_idx         on public.rx_claims (organization_id);
create index if not exists rx_claims_prescription_idx on public.rx_claims (prescription_id);
create index if not exists rx_claims_status_idx      on public.rx_claims (status);

alter table public.rx_claims enable row level security;

drop policy if exists rx_claims_read on public.rx_claims;
create policy rx_claims_read on public.rx_claims for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists rx_claims_write on public.rx_claims;
create policy rx_claims_write on public.rx_claims for all to authenticated
  using (public.is_clinical() and organization_id = public.current_org_id())
  with check (public.is_clinical() and organization_id = public.current_org_id());

-- Settings: claims gateway mode (sandbox until a partner account is provisioned).
alter table public.settings
  add column if not exists claims_mode text not null default 'sandbox';

-- Add rx_claims to the Supabase Realtime publication so live reload + persist stay wired.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    table_name := 'rx_claims';
    if not exists (
      select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end if;
end $$;
