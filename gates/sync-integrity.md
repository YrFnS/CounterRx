# Leaf: sync-integrity
- [ ] Backend load failure is never masked as successful hydration.
  CHECK: `grep -A5 'export async function loadBackendData' src/lib/sync.ts`
  EXPECT: `loadBackendData` returns `LoadResult` union — `{ ok: true; data: BackendData }` on success, `{ ok: false; failedTable: string | null }` on failure (null = empty tenant)
  EVIDENCE:
- [ ] Empty tenant returns `ok: false` — no demo data auto-written to the real DB.
  CHECK: `grep -A3 'byTable.products.length === 0' src/lib/sync.ts`
  EXPECT: the empty-tables branch returns `{ ok: false, failedTable: null }` with no `persistBackendData(seed)` call
  EVIDENCE:
- [ ] BACKEND_OFFLINE dispatched on failed load, HYDRATE_BACKEND resets it.
  CHECK: `grep -E 'BACKEND_OFFLINE|(type: "BACKEND_OFFLINE")' src/store.tsx`
  EXPECT: `BACKEND_OFFLINE` action dispatched on failed load/disconnected Supabase; `backendOffline: false` set on `HYDRATE_BACKEND`
  EVIDENCE:
- [ ] App shell shows offline banner when backendOffline is true.
  CHECK: `grep -A5 'state.backendOffline' src/App.tsx`
  EXPECT: banner visible: "Backend unavailable — showing local data"
  EVIDENCE:
- [ ] Typecheck and build pass.
  CHECK: `npm run typecheck && npm run build`
  EXPECT: exit 0
  EVIDENCE: