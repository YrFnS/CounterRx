# Leaf: audit-actor
- [x] Server-side trigger stamps audit actor from the session.
  CHECK: `grep -A12 'audit_stamp_actor' supabase/migrations/20260821000004_audit_actor.sql`
  EXPECT: before-insert trigger resolves auth.uid() → profiles → staff → name, overwrites new.actor
  EVIDENCE: migration 20260821000004 pushed; trigger `trg_audit_stamp_actor` live.
- [x] Client cannot falsify the actor.
  CHECK: remote probe — insert audit row with `actor: 'FAKE'` as a seeded user, read back
  EXPECT: returned actor is the session staff name, not 'FAKE'
  EVIDENCE: probe as s001 returned 'D. Whitfield'; probe row deleted.
- [x] Client no longer falls back to a fabricated label.
  CHECK: `grep 'actor: s.user?.name' src/store.tsx`
  EXPECT: `actor: s.user?.name ?? ""` (empty fallback, no CASHIER)
  EVIDENCE: withAudit in store.tsx updated.
