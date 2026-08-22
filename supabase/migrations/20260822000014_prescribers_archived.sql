-- W1.3 prescriber directory: add archived flag (soft-delete / deactivate).
alter table public.prescribers add column if not exists archived boolean not null default false;
