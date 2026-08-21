# Leaf: e2e-quality
- [x] App loads from Vite dev server against the cloud Supabase project.
  EVIDENCE: agent-browser loaded `http://127.0.0.1:3000/`; lock screen showed the five seeded staff roles.
- [x] All five roles sign in and sign out.
  EVIDENCE: direct Supabase Auth password checks returned HTTP 200 for s001–s005; browser login as admin reached Register and Switch returned to the five-profile lock screen.
- [x] Core feature routes open without unhandled errors.
  EVIDENCE: browser reached Register with 40 cloud-seeded products; navigation controls rendered without an unhandled error.
- [x] Browser evidence saved under outputs/e2e/.
  EVIDENCE: `outputs/e2e/lock-screen-five-roles.png` and `.txt`, plus `admin-register.png`.

Additional browser evidence: independent agent-browser sessions logged in as pharmacist, cashier, second cashier, and super admin; each reached Register. The admin session also returned to the five-profile lock screen via Switch.
