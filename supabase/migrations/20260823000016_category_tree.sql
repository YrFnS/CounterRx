-- W2.1 Nested categories — self-referencing parent link (depth ≤ 2).
-- A category may point at a parent category; products keep `category` = leaf slug.
-- Roll-ups are computed client-side: child totals fold into their parent.
-- Nullable: parents themselves (and all existing rows) stay top-level.

alter table public.categories add column if not exists parent_id text references public.categories(id) on update cascade on delete set null;

create index if not exists categories_parent_idx on public.categories (parent_id);

-- Seed parenting: analgesics becomes a sub-category of pain relief
-- (organization_id explicit: current_org_id() is NULL outside an auth session).
insert into public.categories (organization_id, id, label, color, group_id, sort, parent_id) values
  ('00000000-0000-0000-0000-000000000001', 'analgesics', 'Analgesics', '#e0a63c', 'acute', 13, 'pain')
on conflict (id) do nothing;
