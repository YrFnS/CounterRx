# Leaf: tests-lint-ci (F10)
- [x] Vitest unit tests cover the pure reducer, PERMS matrix, seed roster, and i18n key sets.
  CHECK: `npm test`
  EXPECT: exit 0; tests under `src/__tests__/` cover HYDRATE_BACKEND / BACKEND_OFFLINE reducer cases, PERMS integrity, seed-role coverage, and en/ar key-set parity
  EVIDENCE: `npm test` exits 0 (27 tests across 4 files: `reducer.test.ts`, `perms-seed.test.ts`, `i18n-key-parity.test.ts`, `f2-invariant.test.ts`).
- [x] i18n key-set parity is enforced as a test (F3 lint-able invariant).
  CHECK: `grep -c 'i18n' src/__tests__/i18n-key-parity.test.ts`
  EXPECT: flatten-key comparison of `src/locales/en.json` vs `ar.json`; fails on any key missing from either file
  EVIDENCE: `src/__tests__/i18n-key-parity.test.ts` walks both JSON files and asserts identical flattened key sets; both currently have 364 keys.
- [x] F2 invariant enforced: demo data is never auto-written to the real DB.
  CHECK: `grep -c 'empty tenant' src/__tests__/f2-invariant.test.ts`
  EXPECT: test asserts `loadBackendData` returns `{ ok: false, failedTable: null }` on empty tenant and never calls `persistBackendData`
  EVIDENCE: `src/__tests__/f2-invariant.test.ts` mocks Supabase with empty tables and asserts `ok: false` / `failedTable: null`; the sync module itself no longer contains a `persistBackendData(seed)` call in the empty branch.
- [x] ESLint configured with typescript-eslint flat config; `npm run lint` exits 0.
  CHECK: `npm run lint`
  EXPECT: exit 0, no errors (warnings tolerated for pre-existing patterns)
  EVIDENCE: `npm run lint` exits 0 (0 errors, warnings only from pre-existing code — no new findings introduced by F10).
- [x] GitHub Actions CI runs typecheck → lint → test → build on push and pull_request.
  CHECK: `cat .github/workflows/ci.yml`
  EXPECT: workflow with `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
  EVIDENCE: `.github/workflows/ci.yml` created; triggers on push + pull_request.
- [x] Typecheck and build remain green with the new tooling.
  CHECK: `npm run typecheck && npm run build`
  EXPECT: exit 0
  EVIDENCE: both commands exit 0 locally.
