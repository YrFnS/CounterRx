-- W1.5 follow-up: settings.home_branch_id — home/default branch for transfers & org identity
alter table public.settings
  add column if not exists home_branch_id text not null default 'BR-01';
