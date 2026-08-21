-- Coupons table (Phase F — Analytics & engagement).
-- Configurable discount codes: percent or fixed amount, optional customer scope, expiry, active flag.
-- Applied at the payment modal as a discount line on the sale total.
-- RLS: org-scoped; authenticated users can read, pharmacy_admin can write.

create table if not exists public.coupons (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  code          text not null,                    -- human-readable code (e.g. "WELCOME10")
  type          text not null default 'percent',  -- 'percent' | 'amount'
  value         numeric(10,2) not null,           -- percent (e.g. 10 for 10%) or currency amount
  expires_at    timestamptz,                      -- optional expiry
  customer_id   text,                             -- optional: restrict to specific customer
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists coupons_org_idx on public.coupons (organization_id);
create index if not exists coupons_code_idx on public.coupons (organization_id, code);
create index if not exists coupons_active_idx on public.coupons (organization_id, active);

alter table public.coupons enable row level security;

drop policy if exists coupons_read on public.coupons;
create policy coupons_read on public.coupons for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists coupons_write on public.coupons;
create policy coupons_write on public.coupons for all to authenticated
  using (organization_id = public.current_org_id() and public.is_admin())
  with check (organization_id = public.current_org_id() and public.is_admin());

-- seed: two example coupons (organization_id set explicitly because default
-- current_org_id() is NULL outside an auth session)
insert into public.coupons (organization_id, code, type, value, expires_at, customer_id, active) values
  ('00000000-0000-0000-0000-000000000001', 'WELCOME10', 'percent', 10, null, null, true),
  ('00000000-0000-0000-0000-000000000001', 'SAVE5', 'amount', 5.00, null, null, true)
on conflict do nothing;

-- add loyalty rate/tiers columns to settings table if not present
-- (these ride the existing settings table; loyalty config already in OrgSettings JSONB)
alter table public.settings
  add column if not exists loyalty_rate numeric(6,4) default 1.0,      -- points per currency unit
  add column if not exists loyalty_tier_silver numeric(10,2) default 500, -- lifetime spend for silver
  add column if not exists loyalty_tier_gold numeric(10,2) default 1500;  -- lifetime spend for gold