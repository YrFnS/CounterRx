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
- [x] Per-op offline outbox queue (replaces silent-drop warn path).
  CHECK: `grep -n 'counterrx:outbox:v1' src/lib/outbox.ts`
  EXPECT: every offline mutation is diffed and enqueued as {id, action, payload, at, updatedAt, table, key}
  EVIDENCE: `src/lib/outbox.ts` `enqueueChanges`/`readOutbox` write `counterrx:outbox:v1`; the persist effect calls `enqueueChanges` when `state.online` is false.
- [x] Reconnect replays the outbox in order, then clears it.
  CHECK: `grep -n 'drainOutbox' src/store.tsx`
  EXPECT: on `online` event, `drainOutboxNow()` replays FIFO, then `persistBackendData` pushes the full state
  EVIDENCE: connectivity effect dispatches `drainOutboxNow()`; `drainOutbox` returns drained and clears on success (see offline-queue.test.ts).
- [x] Deterministic LWW conflict handling by updatedAt, createdAt fallback.
  CHECK: `grep -n 'clockOf' src/lib/outbox.ts`
  EXPECT: remote clock strictly newer -> local op dropped + conflict recorded; local newer/equal -> write
  EVIDENCE: `clockOf` reads updatedAt then createdAt/at; tested both directions in offline-queue.test.ts.
- [x] Conflict UX: banner with View (JSON diff) + keep-local override.
  CHECK: `grep -n 'conflictOverwritten\|conflictKeepLocal' src/App.tsx src/locales/en.json`
  EXPECT: banner shown from `state.conflicts`; keep-local calls `forceOutbox` -> forced `drainOutbox`
  EVIDENCE: `ConflictBanner` in App.tsx; i18n keys present in en.json + ar.json.
- [x] Offline banner shows queued count.
  CHECK: `grep -n 'offlineQueued' src/App.tsx`
  EXPECT: `common.offlineQueued` rendered with `state.outboxCount` when queue non-empty
  EVIDENCE: banner at App.tsx; count set via `SET_OUTBOX_COUNT` from the persist effect.
- [x] Tests cover enqueue/replay-order/LWW-both-ways/drain.
  CHECK: `ls src/__tests__/offline-queue.test.ts`
  EXPECT: 9 passing cases (enqueue offline, delete, FIFO replay, LWW keep-newer both directions, force keep-local, createdAt fallback, dedup)
  EVIDENCE: `npm run test` -> src/__tests__/offline-queue.test.ts 9 passed.
