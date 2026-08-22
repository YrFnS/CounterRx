-- Supply-chain depth (Phase B): lot costing already rides inside
-- products.batches (JSONB `cost` field written at receive); this migration
-- adds the cold-chain flag on products plus the temperature log table.
-- RLS mirrors the transfers/backorders pattern (clinical or manager writes).

alter table public.products add column if not exists cold_chain boolean not null default false;

-- Flag the seeded refrigerated SKUs (org-scoped — the seeded org owns these rows).
update public.products set cold_chain = true
where id in ('insg', 'salb')
  and organization_id = '00000000-0000-0000-0000-000000000001';

create table if not exists public.cold_chain_log (
  id              text primary key,
  organization_id uuid not null default public.current_org_id(),
  product_id      text not null references public.products(id),
  temp_c          numeric(5,2) not null,
  in_range        boolean not null default true,
  staff           text,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists cold_chain_log_org_created_idx on public.cold_chain_log (organization_id, created_at desc);
create index if not exists cold_chain_log_product_idx on public.cold_chain_log (product_id);

alter table public.cold_chain_log enable row level security;

drop policy if exists cold_chain_log_read on public.cold_chain_log;
create policy cold_chain_log_read on public.cold_chain_log for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists cold_chain_log_write on public.cold_chain_log;
create policy cold_chain_log_write on public.cold_chain_log for all to authenticated
  using (organization_id = public.current_org_id() and ((public.is_clinical() or public.is_manager())))
  with check (organization_id = public.current_org_id() and ((public.is_clinical() or public.is_manager())));

-- Seed temp-log lines. organization_id is set EXPLICITLY to the seeded org —
-- the current_org_id() default is NULL outside an authenticated session and
-- breaks `supabase db push` (same lesson as migration 00010).
insert into public.cold_chain_log (id, organization_id, product_id, temp_c, in_range, staff, note, created_at) values
  ('CCL-1001', '00000000-0000-0000-0000-000000000001', 'insg', 3.8, true, 'R. Mensah, RPh', 'Morning fridge check — zone B', now() - interval '5 hours'),
  ('CCL-1002', '00000000-0000-0000-0000-000000000001', 'insg', 4.1, true, 'D. Whitfield', 'Delivery hand-off verified', now() - interval '30 minutes'),
  ('CCL-1003', '00000000-0000-0000-0000-000000000001', 'salb', 7.4, true, 'R. Mensah, RPh', null, now() - interval '26 hours'),
  ('CCL-1004', '00000000-0000-0000-0000-000000000001', 'insg', 9.2, false, 'A. Okafor', 'Fridge door left ajar — restock check', now() - interval '49 hours');
