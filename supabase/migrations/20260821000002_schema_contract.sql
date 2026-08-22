-- Forward repair for the already-applied initial migration.
-- Keeps the SQL schema aligned with BackendData and enables authenticated sync.

alter table public.customers
  add column if not exists fields jsonb not null default '[]'::jsonb;

alter table public.prescriptions
  add column if not exists reminded_at bigint,
  add column if not exists scan text,
  add column if not exists scan_at bigint,
  add column if not exists transferred_out jsonb;

alter table public.transactions
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists bulk_savings numeric(12,2),
  add column if not exists loyalty_deduct numeric(12,2),
  add column if not exists points_earned integer,
  add column if not exists points_redeemed integer;

alter table public.rx_transfers
  add column if not exists prescription_id text,
  add column if not exists drug text not null default '',
  add column if not exists qty numeric(12,3) not null default 1;

alter table public.suppliers
  add column if not exists price_book jsonb not null default '[]'::jsonb;

alter table public.purchase_orders
  add column if not exists invoice_id text,
  add column if not exists note text;

alter table public.expenses
  add column if not exists recurring boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rx_transfers_prescription_id_fkey') then
    alter table public.rx_transfers
      add constraint rx_transfers_prescription_id_fkey
      foreign key (prescription_id) references public.prescriptions(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ap_invoices_po_id_fkey') then
    alter table public.ap_invoices
      add constraint ap_invoices_po_id_fkey
      foreign key (po_id) references public.purchase_orders(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_invoice_id_fkey') then
    alter table public.purchase_orders
      add constraint purchase_orders_invoice_id_fkey
      foreign key (invoice_id) references public.ap_invoices(id);
  end if;
end $$;

create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public as
$$
  select s.role
  from public.profiles p
  join public.staff s on s.id = p.staff_id
  where p.id = auth.uid();
$$;

alter table public.staff enable row level security;
alter table public.profiles enable row level security;

drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy profiles_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all to authenticated using (true) with check (true);

drop policy if exists po_read on public.purchase_orders;
drop policy if exists ap_read on public.ap_invoices;
drop policy if exists expenses_read on public.expenses;
create policy po_read on public.purchase_orders
  for select to authenticated using (true);
create policy ap_read on public.ap_invoices
  for select to authenticated using (true);
create policy expenses_read on public.expenses
  for select to authenticated using (true);

drop policy if exists snapshots_write on public.snapshots;
create policy snapshots_write on public.snapshots
  for all to authenticated using (true) with check (true);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'products','transactions','prescriptions','prescribers','customers','transfers',
      'backorders','rx_transfers','suppliers','purchase_orders','ap_invoices','expenses',
      'deliveries','web_orders','time_entries','staff','settings','restricted_log',
      'audit_log','shifts','snapshots'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
