-- Notification log (W3.1 — notifications framework).
-- Append-only audit trail for every outbound notification (Rx ready, refill due,
-- credit low, …). The client inserts one row per send through the provider
-- adapter in src/lib/notify.ts.
-- RLS mirrors categories/coupons: org-scoped read + write for authenticated users.

create table if not exists public.notification_log (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  recipient     text not null default '',         -- customer name / phone / email target
  channel       text not null default 'console',  -- 'console' until a real provider lands
  template      text not null default '',         -- settings.notifications.templates key
  payload       jsonb not null default '{}',      -- interpolated vars for the template
  status        text not null default 'sent',     -- 'sent' | later: failed/bounced
  created_at    timestamptz not null default now()
);

create index if not exists notification_log_org_idx on public.notification_log (organization_id);

alter table public.notification_log enable row level security;

drop policy if exists notification_log_read on public.notification_log;
create policy notification_log_read on public.notification_log for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists notification_log_write on public.notification_log;
create policy notification_log_write on public.notification_log for all to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

-- org notification config rides the settings row as JSONB (channel, per-trigger
-- toggles, templates, credit-low threshold) — mirrors the loyalty column pattern.
alter table public.settings
  add column if not exists notifications jsonb not null default '{}'::jsonb;
