# Leaf: backend-sync
- [x] Supabase client reads only VITE env configuration.
  CHECK: `grep -n 'VITE_SUPABASE' src/lib/supabase.ts`
  EXPECT: both URL and anon key present; no service_role
  EVIDENCE: `grep -n 'VITE_SUPABASE' src/lib/supabase.ts` returned lines 3–4 for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `grep -n -E 'VITE_SUPABASE|service_role' src/lib/supabase.ts` found no service_role key.
- [x] Sync module exports load, persist, auth, and realtime APIs.
  CHECK: `grep -E '^export (async )?function|^export const' src/lib/sync.ts`
  EXPECT: all contract APIs present
  EVIDENCE: `grep -E '^export (async )?function|^export const' src/lib/sync.ts` returned `loadBackendData`, `persistBackendData`, `subscribeToBackend`, `signInStaff`, and `signOutStaff`; `BackendData` is exported as an interface.
- [x] Typecheck passes after sync module.
  CHECK: `npm run typecheck`
  EXPECT: exit 0
  EVIDENCE: `npm run typecheck` completed successfully with exit code 0; `lsp_diagnostics` reported 0 diagnostics for `src/lib/supabase.ts` and `src/lib/sync.ts`.
