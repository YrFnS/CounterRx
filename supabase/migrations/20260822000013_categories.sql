-- Categories table (P4 — dynamic categories).
-- Replaces the hardcoded CATEGORIES union: admins add/rename/recolor/archive
-- product categories from Settings; every view reads the runtime list.
-- Products keep their `category text` column — values are the category id slugs.
-- RLS mirrors coupons: org-scoped, authenticated read, admin write.

create table if not exists public.categories (
  id            text primary key,                 -- slug used by products.category (e.g. "antibiotics")
  organization_id uuid not null default public.current_org_id(),
  label         text not null,
  color         text not null default '#3b8668',  -- dot color in the UI
  group_id      text not null default 'technical', -- roll-up group (acute/chronic/selfcare/technical)
  sort          int not null default 100,
  archived      boolean not null default false,   -- hidden from pickers, kept for history
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists categories_org_idx on public.categories (organization_id);

alter table public.categories enable row level security;

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (organization_id = public.current_org_id() and public.is_admin())
  with check (organization_id = public.current_org_id() and public.is_admin());

-- seed the original 12 categories with their exact UI colors and groups
-- (organization_id explicit: current_org_id() is NULL outside an auth session)
insert into public.categories (organization_id, id, label, color, group_id, sort) values
  ('00000000-0000-0000-0000-000000000001', 'antibiotics', 'Antibiotics',   '#c24a2e', 'acute',     1),
  ('00000000-0000-0000-0000-000000000001', 'pain',        'Pain relief',   '#e0a63c', 'acute',     2),
  ('00000000-0000-0000-0000-000000000001', 'coldflu',     'Cold & flu',    '#5da184', 'acute',     3),
  ('00000000-0000-0000-0000-000000000001', 'firstaid',    'First aid',     '#b8543f', 'acute',     4),
  ('00000000-0000-0000-0000-000000000001', 'cardio',      'Cardio',        '#a05a79', 'chronic',   5),
  ('00000000-0000-0000-0000-000000000001', 'diabetes',    'Diabetes',      '#4f7d9e', 'chronic',   6),
  ('00000000-0000-0000-0000-000000000001', 'cns',         'CNS & sleep',   '#6b7f8c', 'chronic',   7),
  ('00000000-0000-0000-0000-000000000001', 'vitamins',    'Vitamins',      '#7d9c5a', 'selfcare',  8),
  ('00000000-0000-0000-0000-000000000001', 'derma',       'Skin care',     '#c98d5f', 'selfcare',  9),
  ('00000000-0000-0000-0000-000000000001', 'baby',        'Baby care',     '#8a7fb5', 'selfcare', 10),
  ('00000000-0000-0000-0000-000000000001', 'devices',     'Devices',       '#5c6b66', 'technical',11),
  ('00000000-0000-0000-0000-000000000001', 'compound',    'Compounds',     '#8a6fae', 'technical',12)
on conflict (id) do nothing;
