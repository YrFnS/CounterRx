-- C-II controlled substance movement log (Phase C).
-- DEA 134.29: every C-II receipt / dispense / transfer must be documented.
-- Each row = one movement; the app calls recordC2Movement() on the till.
-- RLS: any authenticated clinical staff can read/write their org's movements.

create table if not exists public.c2_movements (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  product_id    text not null references public.products(id),
  direction     text not null default 'dispense',  -- 'dispense' | 'receive' | 'transfer_out' | 'transfer_in' | 'waste'
  qty           integer not null,
  patient_name  text,
  customer_id   text,
  rx_id         text,
  reason        text,                    -- clinical reason for waste / transfer
  pharmacist    text not null,          -- DEA responsible party
  dea_number    text not null,
  staff_id      uuid,
  created_at    timestamptz not null default now()
);

create index if not exists c2_movements_org_created_idx on public.c2_movements (organization_id, created_at desc);
create index if not exists c2_movements_product_idx on public.c2_movements (product_id);
create index if not exists c2_movements_rx_idx on public.c2_movements (rx_id);

alter table public.c2_movements enable row level security;

drop policy if exists c2_movements_read on public.c2_movements;
create policy c2_movements_read on public.c2_movements for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists c2_movements_write on public.c2_movements;
create policy c2_movements_write on public.c2_movements for insert to authenticated
  with check (organization_id = public.current_org_id() and public.is_clinical());
