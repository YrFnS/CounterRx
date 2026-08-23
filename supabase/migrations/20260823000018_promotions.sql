-- Promotions engine (W3.4) — rules that auto-apply at the register.
--
-- kinds:
--   birthday       → customer.birthday month/day matches today → N% off the invoice
--   first_visit    → customer has no prior transactions       → N% off the invoice
--   category_pct   → window active AND cart has products in category_id → N% off that category's lines
--
-- birthday uses the existing customers.dob column (NO migration needed — added in 20260821000001).
-- RLS: org-scoped; authenticated users can read, pharmacy_admin can write.
-- Mirrors the coupons table shape (see migration 00012_coupons.sql).

create table if not exists public.promotions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  name            text not null,
  kind            text not null check (kind in ('birthday', 'first_visit', 'category_pct')),
  category_id     text,                               -- category_pct only: matches product.category slug
  pct             int  not null check (pct > 0 and pct <= 100),
  window_start    timestamptz,                        -- nullable = open-ended
  window_end      timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists promotions_org_idx    on public.promotions (organization_id);
create index if not exists promotions_kind_idx   on public.promotions (organization_id, kind);
create index if not exists promotions_active_idx on public.promotions (organization_id, active);

alter table public.promotions enable row level security;

drop policy if exists promotions_read on public.promotions;
create policy promotions_read on public.promotions for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists promotions_write on public.promotions;
create policy promotions_write on public.promotions for all to authenticated
  using (organization_id = public.current_org_id() and public.is_admin())
  with check (organization_id = public.current_org_id() and public.is_admin());

-- seed: one rule per kind for the default org (organization_id explicit; current_org_id() is NULL outside a session)
insert into public.promotions (organization_id, name, kind, category_id, pct, window_start, window_end, active) values
  ('00000000-0000-0000-0000-000000000001', 'Birthday reward', 'birthday',     null, 15, null, null, true),
  ('00000000-0000-0000-0000-000000000001', 'First visit welcome', 'first_visit', null, 10, null, null, true),
  ('00000000-0000-0000-0000-000000000001', 'Acute & infection 15% off', 'category_pct', 'antibiotics', 15, now() - interval '7 days', now() + interval '30 days', true)
on conflict do nothing;
