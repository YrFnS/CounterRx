# Leaf: store-auth
- [x] Existing PIN UX preserved while successful login creates Supabase session.
  EVIDENCE: `src/App.tsx` keeps the synchronous local PIN/reducer login path and calls `signInStaff(selected.id, code)` only after a locally valid PIN; `src/store.tsx` observes logout transitions and calls `signOutStaff()`. Offline/local PIN login remains usable when Supabase is unavailable.
- [x] Store hydrates/persists collections through sync and subscribes to Realtime.
  EVIDENCE: `PosProvider` seeds synchronously, calls `loadBackendData` after mount, persists only `BackendData` collections after hydration, keeps localStorage writes, and reloads on realtime changes with queued reloads plus write-back suppression to avoid loops. UI/session fields (`user`, lockouts, cart, held sales, currentShift, view, payment/receipt/toast state) are excluded from the backend payload.
- [x] Typecheck and production build pass.
  CHECK: `npm run typecheck && npm run build`
  EXPECT: exit 0 / built
  EVIDENCE: `npm run typecheck` completed with exit code 0; `npm run build` completed with Vite `✓ built in 13.52s` and emitted `dist/` (chunk-size warning only).
