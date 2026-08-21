-- CounterRx multi-tenancy: organizations + organization_id scoping (F8).
-- Adds an organizations table, org-scopes every domain table's RLS, and
-- backfills existing rows to the seed organization. App reads keep working:
-- current_org_id() resolves auth.uid() -> profiles -> staff -> organization_id.

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name) values ('00000000-0000-0000-0000-000000000001', 'CounterRx Default') on conflict (id) do nothing;

alter table public.staff add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.settings add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.products add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.prescribers add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.customers add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.prescriptions add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.transactions add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.shifts add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.audit_log add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.restricted_log add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.transfers add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.backorders add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.rx_transfers add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.suppliers add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.purchase_orders add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.ap_invoices add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.expenses add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.deliveries add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.web_orders add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.time_entries add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.snapshots add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';

-- each org gets exactly one settings row (drop the single-row id=1 guard)
alter table public.settings drop constraint if exists settings_id_check;
alter table public.settings add constraint settings_organization_id_key unique (organization_id);

create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public as
$$
  select s.organization_id
  from public.profiles p
  join public.staff s on s.id = p.staff_id
  where p.id = auth.uid();
$$;

drop policy if exists products_read on public.products;
drop policy if exists products_write on public.products;
create policy products_read on public.products for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy products_write on public.products for all to authenticated using (organization_id = public.current_org_id() and ((public.is_clinical() or public.is_manager()))) with check (organization_id = public.current_org_id() and ((public.is_clinical() or public.is_manager())));

drop policy if exists prescribers_read on public.prescribers;
drop policy if exists prescribers_write on public.prescribers;
create policy prescribers_read on public.prescribers for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy prescribers_write on public.prescribers for all to authenticated using (organization_id = public.current_org_id() and (public.is_clinical())) with check (organization_id = public.current_org_id() and (public.is_clinical()));

drop policy if exists suppliers_read on public.suppliers;
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated using (organization_id = public.current_org_id() and (true));

drop policy if exists snapshots_read on public.snapshots;
drop policy if exists snapshots_write on public.snapshots;
create policy snapshots_read on public.snapshots for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy snapshots_write on public.snapshots for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists staff_read on public.staff;
drop policy if exists staff_write on public.staff;
create policy staff_read on public.staff for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy staff_write on public.staff for all to authenticated using (organization_id = public.current_org_id() and (public.is_admin())) with check (organization_id = public.current_org_id() and (public.is_admin()));

drop policy if exists customers_read on public.customers;
drop policy if exists customers_write on public.customers;
create policy customers_read on public.customers for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy customers_write on public.customers for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists prescriptions_read on public.prescriptions;
drop policy if exists prescriptions_write on public.prescriptions;
create policy prescriptions_read on public.prescriptions for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy prescriptions_write on public.prescriptions for all to authenticated using (organization_id = public.current_org_id() and (public.is_clinical())) with check (organization_id = public.current_org_id() and (public.is_clinical()));

drop policy if exists transactions_read on public.transactions;
drop policy if exists transactions_write on public.transactions;
create policy transactions_read on public.transactions for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy transactions_write on public.transactions for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists audit_log_read on public.audit_log;
drop policy if exists audit_log_write on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy audit_log_write on public.audit_log for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists restricted_log_read on public.restricted_log;
drop policy if exists restricted_log_write on public.restricted_log;
create policy restricted_log_read on public.restricted_log for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy restricted_log_write on public.restricted_log for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists shifts_read on public.shifts;
drop policy if exists shifts_write on public.shifts;
create policy shifts_read on public.shifts for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy shifts_write on public.shifts for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists transfers_read on public.transfers;
drop policy if exists transfers_write on public.transfers;
create policy transfers_read on public.transfers for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy transfers_write on public.transfers for all to authenticated using (organization_id = public.current_org_id() and ((public.is_manager() or public.is_clinical()))) with check (organization_id = public.current_org_id() and ((public.is_manager() or public.is_clinical())));

drop policy if exists backorders_read on public.backorders;
drop policy if exists backorders_write on public.backorders;
create policy backorders_read on public.backorders for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy backorders_write on public.backorders for all to authenticated using (organization_id = public.current_org_id() and ((public.is_manager() or public.is_clinical()))) with check (organization_id = public.current_org_id() and ((public.is_manager() or public.is_clinical())));

drop policy if exists rx_transfers_read on public.rx_transfers;
drop policy if exists rx_transfers_write on public.rx_transfers;
create policy rx_transfers_read on public.rx_transfers for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy rx_transfers_write on public.rx_transfers for all to authenticated using (organization_id = public.current_org_id() and (public.is_clinical())) with check (organization_id = public.current_org_id() and (public.is_clinical()));

drop policy if exists purchase_orders_read on public.purchase_orders;
drop policy if exists purchase_orders_write on public.purchase_orders;
create policy purchase_orders_read on public.purchase_orders for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy purchase_orders_write on public.purchase_orders for all to authenticated using (organization_id = public.current_org_id() and (public.is_manager())) with check (organization_id = public.current_org_id() and (public.is_manager()));

drop policy if exists ap_invoices_read on public.ap_invoices;
drop policy if exists ap_invoices_write on public.ap_invoices;
create policy ap_invoices_read on public.ap_invoices for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy ap_invoices_write on public.ap_invoices for all to authenticated using (organization_id = public.current_org_id() and (public.is_manager())) with check (organization_id = public.current_org_id() and (public.is_manager()));

drop policy if exists expenses_read on public.expenses;
drop policy if exists expenses_write on public.expenses;
create policy expenses_read on public.expenses for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy expenses_write on public.expenses for all to authenticated using (organization_id = public.current_org_id() and (public.is_manager())) with check (organization_id = public.current_org_id() and (public.is_manager()));

drop policy if exists deliveries_read on public.deliveries;
drop policy if exists deliveries_write on public.deliveries;
create policy deliveries_read on public.deliveries for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy deliveries_write on public.deliveries for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists web_orders_read on public.web_orders;
drop policy if exists web_orders_write on public.web_orders;
create policy web_orders_read on public.web_orders for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy web_orders_write on public.web_orders for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists time_entries_read on public.time_entries;
drop policy if exists time_entries_write on public.time_entries;
create policy time_entries_read on public.time_entries for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy time_entries_write on public.time_entries for all to authenticated using (organization_id = public.current_org_id() and (true)) with check (organization_id = public.current_org_id() and (true));

drop policy if exists settings_read on public.settings;
drop policy if exists settings_write on public.settings;
create policy settings_read on public.settings for select to authenticated using (organization_id = public.current_org_id() and (true));
create policy settings_write on public.settings for all to authenticated using (organization_id = public.current_org_id() and (public.is_admin())) with check (organization_id = public.current_org_id() and (public.is_admin()));
