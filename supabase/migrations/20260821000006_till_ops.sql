-- CounterRx Phase A till ops: store-credit / gift-card balances (F-A).
-- A gift card is simply a credit that carries a scannable `code`; both redeem as the
-- store_credit tender. Table is org-scoped exactly like shifts/transactions so the
-- existing current_org_id() RLS resolver (20260821000003_organizations.sql) applies.

create table if not exists public.store_credits (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  customer_id    text,                              -- null for anonymous gift cards
  balance        numeric(12,2) not null default 0,
  issued_at      bigint not null default extract(epoch from now())::bigint * 1000,
  expires_at     bigint,                            -- optional expiry (epoch ms)
  code           text,                              -- scannable gift-card / credit code
  note           text,
  created_at     timestamptz not null default now(),
  constraint store_credits_balance_nonneg check (balance >= 0)
);

create index if not exists store_credits_org_idx on public.store_credits(organization_id);
create index if not exists store_credits_code_idx on public.store_credits(code) where code is not null;
create index if not exists store_credits_customer_idx on public.store_credits(customer_id) where customer_id is not null;

-- Backfill org scope for any pre-existing rows (mirrors the 0003 migration pattern).
update public.store_credits set organization_id = public.current_org_id() where organization_id is null;

-- RLS: any signed-in staff member in the org may read/write credit balances,
-- exactly like shifts/transactions (till ops are performed by the acting cashier).
alter table public.store_credits enable row level security;

drop policy if exists store_credits_read on public.store_credits;
drop policy if exists store_credits_write on public.store_credits;
create policy store_credits_read on public.store_credits for select to authenticated
  using (organization_id = public.current_org_id() and (true));
create policy store_credits_write on public.store_credits for all to authenticated
  using (organization_id = public.current_org_id() and (true))
  with check (organization_id = public.current_org_id() and (true));
