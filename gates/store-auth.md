# Leaf: store-auth
- [x] Email+password login replaces the PIN pad; Supabase session backs the login.
  EVIDENCE: `src/App.tsx` LockScreen is an email/password form calling `signInStaffByEmail(email, password)` (`src/lib/sync.ts`) which uses `supabase.auth.signInWithPassword` with the typed credentials (seeded users `s00X@counterrx.local`, passwords `CRxS00X<PIN>` per `supabase/seed.sql`). Offline fallback verifies against `SEED_PASSWORDS` in `src/data.ts`. `src/store.tsx` observes logout transitions and calls `signOutStaff()`. Commit `4d220b5`.
- [x] Pre-verified email/password logins bypass the local PIN check and PIN lockout (credentials verified upstream); the optional-`pin` LOGIN path remains for admin/legacy flows.
  EVIDENCE: `src/store.tsx` LOGIN case guards both lockout and pinHash checks on `a.pin !== undefined`; tests in `src/__tests__/login-email.test.ts`.
- [x] Store hydrates/persists collections through sync and subscribes to Realtime.
  EVIDENCE: `PosProvider` seeds synchronously, calls `loadBackendData` after mount, persists only `BackendData` collections after hydration, keeps localStorage writes, and reloads on realtime changes with queued reloads plus write-back suppression to avoid loops. UI/session fields (`user`, lockouts, cart, held sales, currentShift, view, payment/receipt/toast state) are excluded from the backend payload.
- [x] Typecheck and production build pass.
  CHECK: `npm run typecheck && npm run build`
  EXPECT: exit 0 / built
  EVIDENCE: `npm run typecheck` completed with exit code 0; `npm run build` completed with Vite `✓ built in 13.52s` and emitted `dist/` (chunk-size warning only).

## Session-recovery gate (P0 — added 2026-08-22)

- [x] Page refresh recovers the Supabase session and hydrates from the DB (no silent seed fallback).
  CHECK: sign in → hard refresh → DevTools network shows authenticated REST reads; sidebar badge reads "Supabase · connected".
  EXPECT: no "Backend unavailable" banner after refresh; mutations persist to Supabase.
  EVIDENCE: `getSessionStaffId()` in `src/lib/sync.ts` + reboot effect in `PosProvider` (`src/store.tsx`) dispatch `BACKEND_AUTH` when the embedded session matches the stored user. Root cause was `load()` resetting `backendAuthenticated=false` with no re-check path.
