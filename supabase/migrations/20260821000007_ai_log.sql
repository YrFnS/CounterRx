-- CounterRx AI audit ledger (Phase G). Every OpenRouter call through the
-- ai-proxy edge function is recorded here (prompt hash + truncated input +
-- output summary + latency + status) so AI outputs stay reviewable and audited.
-- AI output (output_summary) is NEVER auto-applied by the function; it is only
-- returned for human-in-the-loop review. Follows the multi-tenancy pattern from
-- 20260821000003_organizations.sql (current_org_id / is_manager / is_admin).

create table if not exists public.ai_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null default public.current_org_id(),
  user_id           uuid,
  endpoint          text not null,
  model             text not null default '',
  prompt_hash       text not null default '',
  input_truncated   text,
  output_summary    jsonb,
  latency_ms        integer,
  status            text not null default 'ok',
  created_at        timestamptz not null default now()
);

create index if not exists ai_log_org_created_idx on public.ai_log (organization_id, created_at desc);

alter table public.ai_log enable row level security;

-- Any authenticated org member may insert (the edge function runs as the calling user).
drop policy if exists ai_log_insert on public.ai_log;
create policy ai_log_insert on public.ai_log for insert to authenticated
  with check (organization_id = public.current_org_id());

-- Org members can read their org's log; managers/admins can read all in-org rows.
drop policy if exists ai_log_select on public.ai_log;
create policy ai_log_select on public.ai_log for select to authenticated
  using (organization_id = public.current_org_id());

-- No client-side writes beyond insert (no update/delete from the app).
