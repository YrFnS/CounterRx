-- Branches table (mirrors categories RLS pattern)
create table if not exists public.branches (
  id text primary key,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  sort int not null default 0,
  organization_id uuid not null default public.current_org_id()
);

alter table public.branches enable row level security;

-- RLS: authenticated read, admin write (same pattern as categories)
create policy "branches_org_read" on public.branches
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy "branches_org_write" on public.branches
  for all to authenticated
  using (public.current_org_id() = organization_id)
  with check (public.current_org_id() = organization_id);

-- Seed (explicit org_id for RLS)
insert into public.branches (id, name, address, phone, active, sort, organization_id) values
  ('BR-01', 'Main Branch', '123 Main St, Capital City', '+1-555-0101', true, 0, '00000000-0000-0000-0000-000000000001'),
  ('BR-02', 'North Branch', '456 North Ave, Capital City', '+1-555-0102', true, 1, '00000000-0000-0000-0000-000000000001'),
  ('BR-03', 'South Branch', '789 South Blvd, Capital City', '+1-555-0103', true, 2, '00000000-0000-0000-0000-000000000001')
on conflict (id) do update set
  name = excluded.name, address = excluded.address, phone = excluded.phone,
  active = excluded.active, sort = excluded.sort, organization_id = excluded.organization_id;
