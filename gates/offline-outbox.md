# Leaf: offline-outbox
- [x] Offline edits persist locally.
  CHECK: `grep -n 'localStorage.setItem(LS_KEY' src/store.tsx`
  EXPECT: full reducer state written to localStorage (LS_KEY)
  EVIDENCE: store persists the complete state locally on every change.
- [x] Reconnect retries the push automatically.
  CHECK: `grep -A8 'retry persist on reconnect' src/store.tsx`
  EXPECT: `online` event handler dispatches SET_ONLINE and calls `persistBackendData` when hydrated + authenticated
  EVIDENCE: connectivity effect extended — queued edits replay on `online`.
- [x] Conflict semantics are deterministic LWW (upsert).
  CHECK: `grep -A12 'upsert(payload' src/lib/sync.ts`
  EXPECT: full-table `upsert` per collection — last write wins per row
  EVIDENCE: persistBackendData upserts every collection; offline-then-online pushes the full local state.
- [ ] Additive stock/count merges and per-op outbox queue.
  CHECK: FEATURES.md "Sync layer" section (sync_queue, version columns, PowerSync option)
  EXPECT: tracked in FEATURES.md — not built here
  EVIDENCE: deferred by plan (F11 is "Low (gap)"; full outbox + additive merges remain tracked in FEATURES.md lines 38-50).
