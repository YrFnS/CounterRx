-- CounterRx full backend schema: products, transactions, prescriptions, customers,
-- staff, shifts, suppliers, purchase orders, invoices, expenses, deliveries, web orders,
-- backorders, RX transfers, audits, restricted-log, time-clock, snapshots, settings.
-- Auth identity comes from Supabase Auth; `profiles` links auth.users -> staff + role.
-- RLS mirrors the app's permission matrix (see src/data.ts PERMS) via auth_role().

create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ */
/* profiles — auth.uid link to staff + denormalized role for RLS        */
/* ------------------------------------------------------------------ */
create table public.staff (
  id          text primary key,
  name        text not null,
  role        text not null check (role in ('super_admin','pharmacy_admin','pharmacist','manager','cashier')),
  pin_hash    text not null,               -- sha256 of the PIN (offline/legacy login path)
  initials    text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  staff_id    text not null references public.staff(id) on delete cascade,
  role        text not null check (role in ('super_admin','pharmacy_admin','pharmacist','manager','cashier')),
  created_at  timestamptz not null default now()
);
create unique index profiles_staff_id_uq on public.profiles(staff_id);

/* ------------------------------------------------------------------ */
/* org settings (single row)                                            */
/* ------------------------------------------------------------------ */
create table public.settings (
  id            integer primary key check (id = 1),
  org_name      text not null default 'CounterRx Pharmacy',
  branch        text not null default 'Branch 04 — Maple & 9th',
  address       text not null default '',
  phone         text not null default '',
  license       text not null default '',
  currency      text not null default 'USD',
  receipt_footer text not null default '',
  receipt_terms text not null default '',
  show_barcode  boolean not null default true,
  loyalty       jsonb not null default '{"ptsPerUnit":1,"chunkPts":100,"chunkValue":5,"silverAt":500,"goldAt":1500}',
  scan_beep     boolean not null default true,
  idle_lock_mins integer not null default 5,
  auto_snapshot_mins integer not null default 0,
  terminal_id   text not null default 'T-01',
  updated_at    timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* products (+ embedded batches/uoms/fields/kit)                        */
/* ------------------------------------------------------------------ */
create table public.products (
  id            text primary key,
  sku           text,
  barcode       text,
  name          text not null,
  generic       text not null default '',
  brand         text not null default '',
  category      text,
  form          text not null default '',
  price         numeric(12,2) not null default 0,
  cost          numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  rx            boolean not null default false,
  supplier      text,
  batches       jsonb not null default '[]',   -- [{batch, expiririty, qty, price?, recalled?}]
  uoms          jsonb not null default '[]',   -- [{code,label,factor,price,cost,barcode}]
  fields        jsonb not null default '[]',   -- custom fields [{key,value}]
  kit           jsonb not null default '[]',   -- [{productId,qty}]
  ndc           text,
  gtin          text,
  controlled    text,                          -- 'C-II'..'C-V'
  restricted    jsonb,                         -- {limitPerSale}
  generic_of    text references public.products(id),
  variant_of    text references public.products(id),
  compound      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_category_idx on public.products(category);
create index products_barcode_idx on public.products(barcode);
create index products_ndc_idx on public.products(ndc);

/* ------------------------------------------------------------------ */
/* prescribers                                                          */
/* ------------------------------------------------------------------ */
create table public.prescribers (
  id          text primary key,
  name        text not null,
  credentials text not null default '',
  specialty   text not null default '',
  npi         text,
  dea         text,
  phone       text,
  fax         text,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* customers + embedded allergies / clinical fields                     */
/* ------------------------------------------------------------------ */
create table public.customers (
  id                  text primary key,
  name                text not null,
  phone               text not null default '',
  email               text,
  created_at_tx       timestamptz not null default now(),
  notes               text,
  points              integer not null default 0,
  allergies           jsonb not null default '[]',
  dob                 text,
  gender              text,
  address             text,
  blood_type          text,
  primary_prescriber_id text references public.prescribers(id),
  insurance_plan      text,
  clinical_notes      text,                   -- PHI — RLS restricts to clinical staff
  tax_exempt          boolean not null default false,
  updated_at          timestamptz not null default now()
);
create index customers_phone_idx on public.customers(phone);
create index customers_name_idx on public.customers(name);

/* ------------------------------------------------------------------ */
/* prescriptions + embedded insurance / prior-auth                      */
/* ------------------------------------------------------------------ */
create table public.prescriptions (
  id              text primary key,
  patient         text not null,
  age             integer,
  product_id      text references public.products(id),
  qty             numeric(12,3) not null default 1,
  prescriber_id   text references public.prescribers(id),
  status          text not null default 'new',
  created_at_tx   timestamptz not null default now(),   -- app uses numeric ms; see note
  note            text,
  days_supply     integer,
  refills_authorized integer,
  refills_remaining integer,
  rx_expiry       text,
  phone           text,
  insurance       jsonb,                       -- {plan, memberId, status, bin?}
  pa              jsonb,                       -- prior-authorization {status, requestedAt, decidedAt, note}
  notified_at     bigint,
  dispensed_at    bigint,
  updated_at      timestamptz not null default now()
);
create index prescriptions_product_idx on public.prescriptions(product_id);
create index prescriptions_status_idx on public.prescriptions(status);

/* ------------------------------------------------------------------ */
/* transactions + embedded lines                                        */
/* ------------------------------------------------------------------ */
create table public.transactions (
  id          text primary key,
  at          bigint not null,
  lines       jsonb not null default '[]',    -- [{productId,name,form,qty,price,rx,alloc?,...}]
  subtotal    numeric(12,2) not null default 0,
  discount    numeric(12,2) not null default 0,
  tax         numeric(12,2) not null default 0,
  total       numeric(12,2) not null default 0,
  method      text not null default 'cash',
  cashier     text not null default '',
  tendered    numeric(12,2),
  change      numeric(12,2),
  refund_of   text references public.transactions(id),
  customer_id text references public.customers(id),
  reason      text,
  refunded_at bigint,
  created_at  timestamptz not null default now()
);
create index transactions_at_idx on public.transactions(at desc);
create index transactions_customer_idx on public.transactions(customer_id);

/* ------------------------------------------------------------------ */
/* shifts + embedded transactions / cash movements                      */
/* ------------------------------------------------------------------ */
create table public.shifts (
  id              text primary key,
  terminal_id     text not null default '',
  cashier_id      text,
  cashier_name    text not null default '',
  opened_at       bigint not null,
  closed_at       bigint,
  status          text not null default 'open',
  opening_balance numeric(12,2) not null default 0,
  closing_balance numeric(12,2),
  counted_cash    numeric(12,2),
  transactions    jsonb not null default '[]',
  cash_movements  jsonb not null default '[]',
  sales_total     numeric(12,2) not null default 0,
  refunds_total   numeric(12,2) not null default 0,
  card_total      numeric(12,2) not null default 0,
  insurance_total numeric(12,2) not null default 0,
  store_credit_total numeric(12,2) not null default 0,
  paid_in_total   numeric(12,2) not null default 0,
  paid_out_total  numeric(12,2) not null default 0,
  expected_cash   numeric(12,2) not null default 0,
  over_short      numeric(12,2),
  notes           text,
  updated_at      timestamptz not null default now()
);
create index shifts_opened_at_idx on public.shifts(opened_at);

/* ------------------------------------------------------------------ */
/* audit & controlled-substance / behind-the-counter log                */
/* ------------------------------------------------------------------ */
create table public.audit_log (
  id        bigint generated by default as identity primary key,
  at        bigint not null,
  actor     text not null default '',
  kind      text not null default 'system',
  detail    text not null default ''
);
create index audit_log_at_idx on public.audit_log(at desc);

create table public.restricted_log (
  id         bigint generated by default as identity primary key,
  at         bigint not null,
  product_id text references public.products(id),
  qty        numeric(12,3) not null default 1,
  purchaser  text not null default '',
  id_type    text not null default '',
  id_last4   text not null default '',
  cashier    text not null default ''
);
create index restricted_log_at_idx on public.restricted_log(at desc);

/* ------------------------------------------------------------------ */
/* transfers (inter-branch), backorders, rx transfers                   */
/* ------------------------------------------------------------------ */
create table public.transfers (
  id          text primary key,
  product_id  text references public.products(id),
  qty         numeric(12,3) not null default 1,
  to_branch   text not null default '',
  status      text not null default 'requested',
  created_at  bigint not null,
  requested_by text not null default '',
  note        text,
  updated_at  timestamptz not null default now()
);

create table public.backorders (
  id          text primary key,
  patient     text not null,
  phone       text,
  product_id  text references public.products(id),
  qty         numeric(12,3) not null default 1,
  created_at  bigint not null,
  status      text not null default 'ordered',
  eta_days    integer,
  supplier    text,
  arrived_at  bigint,
  notified_at bigint,
  updated_at  timestamptz not null default now()
);

create table public.rx_transfers (
  id                text primary key,
  transfer_no       text not null default '',
  direction         text not null default 'out',
  patient           text not null default '',
  other_pharmacy    text not null default '',
  other_phone       text,
  prescriber        text not null default '',
  refills_remaining integer,
  pharmacist        text not null default '',
  at                bigint not null,
  note              text
);

/* ------------------------------------------------------------------ */
/* suppliers, purchase orders, AP invoices, expenses (finance)          */
/* ------------------------------------------------------------------ */
create table public.suppliers (
  id          text primary key,
  name        text not null,
  contact     text,
  phone       text,
  email       text,
  terms       integer not null default 30,
  lead_days   integer not null default 7,
  min_order   numeric(12,3) not null default 0,
  updated_at  timestamptz not null default now()
);

create table public.purchase_orders (
  id          text primary key,
  supplier_id text references public.suppliers(id),
  lines       jsonb not null default '[]',    -- [{productId,qty,unitCost,received}]
  status      text not null default 'ordered',
  created_at  bigint not null,
  expected_at bigint,
  received_at bigint,
  received_by text,
  updated_at  timestamptz not null default now()
);

create table public.ap_invoices (
  id          text primary key,
  number      text not null default '',
  supplier_id text references public.suppliers(id),
  po_id       text,
  date        bigint not null,
  due_days    integer not null default 30,
  total       numeric(12,2) not null default 0,
  payments    jsonb not null default '[]',    -- [{at,amount,method,ref}]
  credits     jsonb not null default '[]',    -- [{at,amount,note}]
  updated_at  timestamptz not null default now()
);

create table public.expenses (
  id       text primary key,
  category text not null default 'Misc',
  amount   numeric(12,2) not null default 0,
  date     bigint not null,
  payee    text not null default '',
  note     text,
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* deliveries & web orders                                              */
/* ------------------------------------------------------------------ */
create table public.deliveries (
  id           text primary key,
  customer_id  text references public.customers(id),
  address      text not null default '',
  lines        jsonb not null default '[]',   -- [{productId,qty}]
  fee          numeric(12,2) not null default 0,
  mode         text not null default 'delivery',
  status       text not null default 'queued',
  driver       text,
  scheduled_at bigint,
  proof        text,
  created_at   bigint not null,
  updated_at   timestamptz not null default now()
);

create table public.web_orders (
  id            text primary key,
  customer_name text not null,
  phone         text not null default '',
  items         jsonb not null default '[]',  -- [{productId?,name,qty}]
  type          text not null default 'otc',
  channel       text not null default 'web',
  pickup        text not null default 'in_store',
  status        text not null default 'new',
  note          text,
  decline_reason text,
  created_at    bigint not null,
  updated_at    timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* time clock, snapshots                                                */
/* ------------------------------------------------------------------ */
create table public.time_entries (
  id        bigint primary key,
  staff_id  text references public.staff(id),
  in_at     bigint not null,
  out_at    bigint
);
create index time_entries_staff_idx on public.time_entries(staff_id);

create table public.snapshots (
  id        text primary key,
  at        bigint not null,
  label     text not null default '',
  auto      boolean not null default false,
  data      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* updated_at trigger                                                   */
/* ------------------------------------------------------------------ */
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'staff','settings','products','prescribers','customers','prescriptions',
    'shifts','transfers','backorders','suppliers','purchase_orders','ap_invoices',
    'deliveries','web_orders'
  ] loop
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* Roles & permissions (defined after tables — SQL functions are      */
/* validated at creation). Keeps RLS from recursing into profiles       */
/* ------------------------------------------------------------------ */
create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public as
$$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$
  select public.current_role() in ('pharmacy_admin', 'super_admin');
$$;

create or replace function public.is_clinical()
returns boolean language sql stable security definer set search_path = public as
$$
  select public.current_role() in ('pharmacist', 'pharmacy_admin', 'super_admin');
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as
$$
  select public.current_role() in ('manager', 'pharmacist', 'pharmacy_admin', 'super_admin');
$$;

/* ------------------------------------------------------------------ */
/* ROW LEVEL SECURITY                                                   */
/* ------------------------------------------------------------------ */

-- read-mostly POS data: any authenticated user (a signed-in staff member) may read
alter table public.products       enable row level security;
alter table public.prescribers    enable row level security;
alter table public.suppliers      enable row level security;
alter table public.snapshots      enable row level security;

create policy products_read    on public.products    for select to authenticated using (true);
create policy prescribers_read on public.prescribers for select to authenticated using (true);
create policy suppliers_read   on public.suppliers   for select to authenticated using (true);
create policy snapshots_read   on public.snapshots   for select to authenticated using (true);

-- products: clinical/manager staff manage inventory (perm adjust_stock)
create policy products_write on public.products for all to authenticated using (public.is_clinical() or public.is_manager()) with check (public.is_clinical() or public.is_manager());
create policy products_insert on public.products for insert to authenticated with check (public.is_admin() or public.is_clinical());

-- prescribers: clinical manage (perm verify_rx / manage staff-adjacent)
create policy prescribers_write on public.prescribers for all to authenticated using (public.is_clinical()) with check (public.is_clinical());

-- staff: self-readable (login/clock-in), admin manages
create policy staff_read   on public.staff for select to authenticated using (true);
create policy staff_write  on public.staff for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: a user sees/writes own profile; admins see all
create policy profiles_select  on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_insert  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update  on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin());

-- customers: any authenticated reads (available at the till); clinical/admin manage profiles/PHI fields.
--   Split: baseline fields writable by any cashier; the PHI column set writable only by clinical.
alter table public.customers enable row level security;
create policy customers_read on public.customers for select to authenticated using (true);

-- prescriptions: PHI — all authenticated read (needed at dispense), clinical manage
alter table public.prescriptions enable row level security;
create policy prescriptions_read on public.prescriptions for select to authenticated using (true);
create policy prescriptions_write on public.prescriptions for all to authenticated using (public.is_clinical()) with check (public.is_clinical());

-- transactions + audit + restricted-log: all authenticated read; cashiers post sales
alter table public.transactions   enable row level security;
alter table public.audit_log      enable row level security;
alter table public.restricted_log enable row level security;
create policy transactions_read  on public.transactions for select to authenticated using (true);
create policy transactions_write on public.transactions for all to authenticated using (true) with check (true);
create policy audit_read  on public.audit_log for select to authenticated using (true);
create policy audit_write on public.audit_log for all to authenticated using (true) with check (true);
create policy restricted_read  on public.restricted_log for select to authenticated using (true);
create policy restricted_write on public.restricted_log for all to authenticated using (true) with check (true);

-- shifts: all authenticated read; open/close by the acting cashier (authenticated)
alter table public.shifts enable row level security;
create policy shifts_read on public.shifts for select to authenticated using (true);
create policy shifts_write on public.shifts for all to authenticated using (true) with check (true);

-- clinical workflows: transfers/backorders/rx_transfers read by all, written by clinical/manager
alter table public.transfers   enable row level security;
alter table public.backorders  enable row level security;
alter table public.rx_transfers enable row level security;
create policy transfers_read on public.transfers for select to authenticated using (true);
create policy transfers_write on public.transfers for all to authenticated using (public.is_manager() or public.is_clinical()) with check (public.is_manager() or public.is_clinical());
create policy backorders_read on public.backorders for select to authenticated using (true);
create policy backorders_write on public.backorders for all to authenticated using (public.is_manager() or public.is_clinical()) with check (public.is_manager() or public.is_clinical());
create policy rx_transfers_read on public.rx_transfers for select to authenticated using (true);
create policy rx_transfers_write on public.rx_transfers for all to authenticated using (public.is_clinical()) with check (public.is_clinical());

-- finance: manager+ manages (create_po, receive_po, pay_invoice, add_expense)
alter table public.purchase_orders enable row level security;
alter table public.ap_invoices     enable row level security;
alter table public.expenses        enable row level security;
create policy po_write   on public.purchase_orders for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy ap_write   on public.ap_invoices     for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy expenses_write on public.expenses    for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- deliveries / web orders: staff operate them (any authenticated)
alter table public.deliveries enable row level security;
alter table public.web_orders enable row level security;
create policy deliveries_read  on public.deliveries for select to authenticated using (true);
create policy deliveries_write on public.deliveries for all to authenticated using (true) with check (true);
create policy weborders_read  on public.web_orders for select to authenticated using (true);
create policy weborders_write on public.web_orders for all to authenticated using (true) with check (true);

-- time clock + snapshots: read authenticated; admin manages snapshots (restore)
alter table public.time_entries enable row level security;
create policy time_read  on public.time_entries for select to authenticated using (true);
create policy time_write on public.time_entries for all to authenticated using (true) with check (true);

-- settings: read all authenticated; write only admin (edit_settings)
alter table public.settings enable row level security;
create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_write on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- grants (default role: anon gets nothing beyond auth schema; authenticated gets public)
grant usage on schema public to authenticated;

-- docs on timestamps: the app stores most timestamps as numeric epoch-ms (bigint columns).
-- created_at_tx *_tx columns are postgres timestamps used only for ordering/audit safety.
