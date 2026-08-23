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
- [x] W2.5 full-org export bundle covers every synced table.
  CHECK: `grep -n 'export function buildOrgExport\|export function validateOrgExport\|export function backendDataFromExport' src/lib/sync.ts`
  EXPECT: all three helpers present; buildOrgExport iterates the TABLES list (26 tables) so the bundle can never drift from the synced set
  EVIDENCE: `src/lib/sync.ts` exports `buildOrgExport`, `validateOrgExport`, `backendDataFromExport`; `src/__tests__/backups.test.ts` asserts the bundle contains all 27 table keys (26 TABLES + settings) and that `version===1`, `exportedAt` ISO string, and `organization_id` are set.
- [x] W2.5 local backup rotation keeps the last N snapshots.
  CHECK: `grep -n 'BACKUPS_KEY\|BACKUP_KEEP\|rotateBackup' src/store.tsx`
  EXPECT: rotation key `counterrx:backups:v1`, default keep = 3, new snapshot pushed to front
  EVIDENCE: `src/store.tsx` defines `BACKUPS_KEY = "counterrx:backups:v1"`, `BACKUP_KEEP = 3`, `rotateBackup()`, and `listBackups()`; rotation fires on every successful `HYDRATE_BACKEND`. Test asserts `listBackups().length === BACKUP_KEEP` after `BACKUP_KEEP + 5` rotations.
- [x] W2.5 restore validates shape before applying.
  CHECK: `grep -n 'validateOrgExport\|RESTORE_EXPORT' src/lib/sync.ts src/store.tsx`
  EVIDENCE: `validateOrgExport` rejects null/non-object, missing top-level keys (`exportedAt`/`version`/`organization_id`/`tables`), and bundles missing core ledger tables; reducer `RESTORE_EXPORT` short-circuits to an error toast when validation fails. Tests cover malformed input (rejected) and well-formed bundles (accepted + rehydrated).
- [x] W2.5 UI lives in Settings → Backups & restore (admin only).
  CHECK: `grep -n 'tab === "backups"\|BackupsTab' src/views/Settings.tsx`
  EVIDENCE: `src/views/Settings.tsx` adds a `backups` tab gated behind `can(role, "edit_settings")`; exports JSON (with optional per-table CSVs) and lists/restores local backups with a confirm dialog. i18n keys added to `src/locales/en.json` and `src/locales/ar.json` (`settings.backups.*`).
