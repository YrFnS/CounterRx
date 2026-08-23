-- Full patient profiles (W3.6): conditions list + clinical notes timeline.
-- allergies jsonb already exists (init) — now stores structured entries
-- (allergen/severity/reaction/archived); legacy plain strings still accepted.
alter table public.customers
  add column if not exists conditions    jsonb not null default '[]',
  add column if not exists patient_notes jsonb not null default '[]';
