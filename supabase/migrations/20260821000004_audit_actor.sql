-- CounterRx: audit actor stamped from session (F9).
-- Before insert on audit_log, resolves auth.uid() -> profiles -> staff
-- and overwrites actor with the staff name. The client may still send an
-- actor field (harmless — the trigger overrides it).

create or replace function public.audit_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
begin
  select s.name, p.role into v_name, v_role
  from public.profiles p
  join public.staff s on s.id = p.staff_id
  where p.id = auth.uid();
  new.actor = coalesce(nullif(v_name, ''), new.actor);
  return new;
end;
$$;

create trigger trg_audit_stamp_actor
  before insert on public.audit_log
  for each row execute function public.audit_stamp_actor();