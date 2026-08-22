# Leaf: route-guards
- [x] VIEW_ROLES defined per view in App.tsx.
  CHECK: `grep -A20 'VIEW_ROLES' src/App.tsx | head -15`
  EXPECT: settings → admin only; reports/finance → manager+; prescriptions → pharmacist+; register/dashboard/customers/inventory/deliveries/history → all roles
  EVIDENCE: VIEW_ROLES map with 10 entries; super_admin/pharmacy_admin/pharmacist/manager/cashier role coverage.
- [x] NAV items filtered by the current user's role.
  CHECK: `grep -n 'navItems.map' src/App.tsx`
  EXPECT: uses `navItems` (filtered) instead of raw `NAV`
  EVIDENCE: `navItems` computed from `NAV.filter(...)` based on `role`.
- [x] Restricted views render "Access denied" instead of content.
  CHECK: `grep -A10 'viewAllowed' src/App.tsx`
  EXPECT: `viewAllowed ? (view switch) : (denied view)`
  EVIDENCE: ternary in `<main>` — denied view shown when role is unauthorized for the current view.
- [x] Typecheck and build pass.
  CHECK: `npm run typecheck && npm run build`
  EXPECT: exit 0
  EVIDENCE: typecheck + build green.
- [ ] Browser verification: cashier cannot open Settings/Reports; manager cannot open platform-admin surfaces.
  CHECK: browser e2e — see Phase 3 / G9
  EXPECT: role-restricted routes show denied view
  EVIDENCE: pending (browser verification is part of G9)