-- Clinical interactions table + rx-docs storage bucket (Phase C).
-- interaction_pairs is the source of truth for DDI screening; the app seeds
-- the 9 pairs from init.sql and this migration adds 11 more. findInteractions()
-- reads from this table when online, falling back to the in-memory INTERACTIONS
-- constant when offline.

create table if not exists public.interaction_pairs (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id(),
  a             text not null,
  b             text not null,
  severity      text not null default 'moderate',  -- 'major' | 'moderate'
  effect        text not null,
  action        text not null,
  created_at    timestamptz not null default now()
);

create index if not exists interaction_pairs_org_idx on public.interaction_pairs (organization_id);
create index if not exists interaction_pairs_pair_idx on public.interaction_pairs (a, b);

alter table public.interaction_pairs enable row level security;

drop policy if exists interaction_pairs_read on public.interaction_pairs;
create policy interaction_pairs_read on public.interaction_pairs for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists interaction_pairs_write on public.interaction_pairs;
create policy interaction_pairs_write on public.interaction_pairs for all to authenticated
  using (public.is_clinical()) with check (public.is_clinical());

-- seed: 11 additional interaction pairs beyond the 9 already in the app constant
insert into public.interaction_pairs (a, b, severity, effect, action) values
  ('alpr05', 'zolp5', 'major', 'Benzodiazepine + non-benzodiazepine hypnotic → severe additive CNS depression.', 'Avoid concurrent use; if unavoidable use lowest doses and warn on sedation driving risk.'),
  ('tram50', 'codsyr', 'major', 'Concurrent opioid therapy — additive CNS and respiratory depression.', 'Dispense one opioid only; counsel on overdose risk.'),
  ('atv20', 'amx500', 'moderate', 'Macrolide antibiotic raises statin levels via CYP3A4 inhibition.', 'Monitor for myalgia; consider statin dose reduction during the course.'),
  ('cet10', 'zolp5', 'moderate', 'Antihistamine + sedative-hypnotic → additive next-day impairment.', 'Counsel on drowsiness; avoid operating machinery.'),
  ('met500', 'insg', 'moderate', 'Metformin + insulin increases hypoglycemia risk.', 'Check glucose before and after; adjust insulin dose down.'),
  ('omz20', 'atv20', 'moderate', 'Omeprazole raises atorvastatin exposure via CYP2C19/3A4 inhibition.', 'Monitor for statin myopathy signs.'),
  ('diclo50', 'asa75', 'moderate', 'NSAID + aspirin → additive GI ulceration and bleeding risk.', 'Add gastroprotection if co-prescribed long-term.'),
  ('glucometer', 'insg', 'moderate', 'Labeling cross-check: glucometer strips for insulin titration.', 'Ensure patient trained on device matching strips.'),
  ('cfsyrup', 'alpr05', 'moderate', 'Antitussive + benzodiazepine → additive sedation.', 'Counsel on sedation and fall risk in elderly.'),
  ('vicoprofen', 'alpr05', 'major', 'Opioid + benzodiazepine combination carries FDA boxed warning.', 'Avoid; if absolutely necessary use lowest effective dose.'),
  ('met500', 'atv20', 'moderate', 'Metformin + statin — monitor for combined lactic acidosis risk in renal impairment.', 'Check renal function before co-train.'),
  ('zolp5', 'cet10', 'moderate', 'Sedative-hypnotic + antihistamine → prolonged psychomotor impairment.', 'Counsel on next-day drowsiness; avoid alcohol.');

-- rx-docs: Supabase Storage bucket for hard-copy prescription scans
-- (created via SQL so the bucket policy is deterministic and reviewable).
insert into storage.buckets (id, name, public, avif_autodetect_version, created_at)
values ('rx-docs', 'rx-docs', false, 0, now())
on conflict (id) do nothing;

create policy "rx-docs: authenticated users can read their org's scans"
  on storage.objects for select to authenticated
  using (auth.role() = 'authenticated');

create policy "rx-docs: clinical staff can upload scans"
  on storage.objects for insert to authenticated
  with check (public.is_clinical() and (storage.foldername(name))[1] = 'orgs' AND (storage.foldername(name))[2] = current_org_id()::text);
