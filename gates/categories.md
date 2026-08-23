# Leaf: categories (W2.1)

- [x] `categories.parent_id` column + tree helpers.
  CHECK: `grep -n 'parent_id' supabase/migrations/20260823000016_category_tree.sql src/lib/sync.ts`
  EXPECT: migration adds nullable `parent_id text references categories(id)` (+ index); sync hydrates `parent_id` → `Category.parentId` and persists it back.
  EVIDENCE: pushed to live 2026-08-23 (`Finished supabase db push`, remote ledger contains 20260823000016 via `supabase migration list`); seed row `analgesics` parented under `pain` (org `00000000-0000-0000-0000-000000000001`).
- [x] Settings CategoriesTab parent picker, depth ≤ 2 enforced.
  CHECK: `grep -n 'parentOptions\|categoryParent' src/views/Settings.tsx`
  EXPECT: add/edit modal offers only top-level categories as parents; a category with children can't become a child; self/descendants excluded when editing.
  EVIDENCE: `parentOptions` memo filters `!c.parentId && c.id !== editingId && !hasKids.has(c.id)`; depth-guard math asserted in `category-tree.test.ts`.
- [x] Roll-ups across Register chips, Inventory filter, Dashboard breakdown, Reports grouping.
  CHECK: `grep -rn 'catSubtree\|rollUp' src/views/Register.tsx src/views/Inventory.tsx src/views/Dashboard.tsx src/views/Reports.tsx`
  EXPECT: picking a parent chip/filter matches its whole subtree with summed counts; Reports category rows fold children into the parent; Dashboard shows revenue per top-level category with child sales rolled into the root.
  EVIDENCE: helpers `catChildren/catSubtree/catPathLabel` in src/data.ts used by all four views; roll-up math covered in `src/__tests__/category-tree.test.ts` (7 tests).
- [x] i18n parity for new strings.
  CHECK: `grep -n 'categoryParent\|catBreakdown' src/locales/en.json src/locales/ar.json`
  EXPECT: every new string keyed in both locales.
  EVIDENCE: `settings.categoryParent`, `settings.categoryParentNone`, `dashboard.catBreakdown`, `dashboard.catBreakdownAll` present in en+ar; `i18n-key-parity.test.ts` passes.
