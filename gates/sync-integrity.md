# Leaf: sync-integrity
- [x] Backend load failure is never masked as successful hydration.
  CHECK: `grep -A5 'export async function loadBackendData' src/lib/sync.ts`
  EXPECT: `loadBackendData` returns `LoadResult` union — `{ ok: true; data: BackendData }` on success, `{ ok: false; failedTable: string | null }` on failure (null = empty tenant)
  EVIDENCE: `loadBackendData` returns `LoadResult`; failed reads return `{ ok: false, failedTable }`; the caller never dispatches HYDRATE_BACKEND from a failed load (commit baac7a4).
- [x] Empty tenant returns `ok: false` — no demo data auto-written to the real DB.
  CHECK: `grep -A3 'byTable.products.length === 0' src/lib/sync.ts`
  EXPECT: the empty-tables branch returns `{ ok: false, failedTable: null }` with no `persistBackendData(seed)` call
  EVIDENCE: empty-tables branch returns `{ ok: false, failedTable: null }`; the `persistBackendData(seed)` auto-write is removed (commit baac7a4).
- [x] BACKEND_OFFLINE dispatched on failed load, HYDRATE_BACKEND resets it.
  CHECK: `grep -E 'BACKEND_OFFLINE' src/store.tsx`
  EXPECT: `BACKEND_OFFLINE` action dispatched on failed load/disconnected Supabase; `backendOffline: false` set on `HYDRATE_BACKEND`
  EVIDENCE: BACKEND_OFFLINE action + `backendOffline` state; HYDRATE_BACKEND sets `backendOffline: false`; both hydration and realtime-reload failure paths dispatch BACKEND_OFFLINE (commit baac7a4).
- [x] App shell shows offline banner when backendOffline is true.
  CHECK: `grep -A5 'state.backendOffline' src/App.tsx`
  EXPECT: banner visible: "Backend unavailable — showing local data"
  EVIDENCE: banner renders in the app shell when `state.backendOffline` is true (commit baac7a4).
- [x] Typecheck and build pass.
  CHECK: `npm run typecheck && npm run build`
  EXPECT: exit 0
  EVIDENCE: typecheck + build green after baac7a4.
