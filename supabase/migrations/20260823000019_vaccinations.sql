-- W3.5 — Vaccination records per patient.
-- Mirrors the RLS pattern of `customers`: org-scoped, clinical-staff
-- write, authenticated-staff read.

create table if not exists public.vaccinations (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  patient_id     text  not null references public.customers(id),
  product_id     text  not null references public.products(id),
  lot            text,
  dose_number    int,
  site           text,
  administrator  text,
  administered_at timestamptz not null,
  next_due       timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists vaccinations_org_idx    on public.vaccinations (organization_id);
create index if not exists vaccinations_patient  on public.vaccinations (patient_id);
create index if not exists vaccinations_product  on public.vaccinations (product_id);
create index if not exists vaccinations_next_due on public.vaccinations (next_due);

alter table public.vaccinations enable row level security;

drop policy if exists vaccinations_read on public.vaccinations;
create policy vaccinations_read on public.vaccinations for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists vaccinations_write on public.vaccinations;
create policy vaccinations_write on public.vaccinations for all to authenticated
  using (public.is_clinical() and organization_id = public.current_org_id())
  with check (public.is_clinical() and organization_id = public.current_org_id());

-- W3.5: add vaccinations to the Supabase Realtime publication so live reload + persist stay wired.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    table_name := 'vaccinations';
    if not exists (
      select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end if;
end $$;
