-- CounterRx W4.4 Platform Admin Console (F-Platform).
-- Extends the multi-tenant core (migration 003) with platform-level org management:
--   * richer organizations table (owner_email, status)
--   * staff.org_id scoping + super_admin cross-tenant role
--   * RLS rewritten so super_admins can span orgs (managed by the platform console)
--   * default org backfill for any pre-existing rows

/* 1. organizations: add owner + status, keep seed org --------------------- */
alter table public.organizations add column if not exists owner_email text;
alter table public.organizations add column if not exists status text not null default 'active'
  check (status in ('active', 'suspended'));

-- Guarantee the seed/default org exists for backfills below.
insert into public.organizations (id, name, owner_email, status)
values ('00000000-0000-0000-0000-000000000001', 'CounterRx Default', null, 'active')
on conflict (id) do nothing;

/* 2. staff: org scoping + super_admin role --------------------------------- */
-- staff.org_id (FK) — replaces the tenant implied by RLS only.
alter table public.staff add column if not exists org_id uuid references public.organizations(id) on delete set null;

-- Backfill existing staff rows to the default org.
update public.staff set org_id = '00000000-0000-0000-0000-000000000001'
where org_id is null;

-- Allow super_admin (cross-tenant platform role) in the role check.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('super_admin','pharmacy_admin','pharmacist','manager','cashier'));

/* 3. super_admin predicate (defined before policies reference it) -------- */
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as
$$
  select public.current_role() = 'super_admin';
$$;

/* 4. RLS: platform admins span orgs ---------------------------------------- */
-- Drop the org-scoped staff/settings policies from migration 003 so we can
-- re-issue them with super_admin bypass (current_org_id() still gates everyone else).
drop policy if exists staff_read on public.staff;
drop policy if exists staff_write on public.staff;
create policy staff_read on public.staff for select to authenticated
  using (org_id = public.current_org_id() or public.is_super_admin());
create policy staff_write on public.staff for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

drop policy if exists organizations_read on public.organizations;
drop policy if exists organizations_write on public.organizations;
create policy organizations_read on public.organizations for select to authenticated
  using (true);
create policy organizations_write on public.organizations for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

/* 5. helper: suspend / activate a tenant ----------------------------------- */
create or replace function public.set_org_status(org uuid, new_status text)
returns void
language plpgsql security definer set search_path = public as
$$
begin
  if new_status not in ('active', 'suspended') then
    raise exception 'invalid org status: %', new_status;
  end if;
  update public.organizations set status = new_status where id = org;
end;
$$;
