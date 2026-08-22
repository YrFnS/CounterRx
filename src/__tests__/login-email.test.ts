import { describe, it, expect } from "vitest";
import { reducer, seed } from "../store";

type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

function makeTestState(): State {
  const s = { ...seed(), user: null, backendAuthenticated: false, lockouts: {}, toasts: [] };
  return s as unknown as State;
}

describe("reducer - LOGIN (email/password flow)", () => {
  it("logs in without a pin (pre-verified email/password)", () => {
    const result = reducer(makeTestState(), { type: "LOGIN", staffId: "S-001" });
    expect(result.user?.id).toBe("S-001");
    expect(result.backendAuthenticated).toBe(false);
  });

  it("skips the PIN lockout for pre-verified logins", () => {
    const locked = reducer(makeTestState(), { type: "LOGIN", staffId: "S-001", pin: "0000" });
    expect(locked.lockouts["S-001"]?.fails).toBe(1);
    // email/password login bypasses the PIN lockout (credentials verified upstream)
    const result = reducer(locked, { type: "LOGIN", staffId: "S-001" });
    expect(result.user?.id).toBe("S-001");
  });

  it("still verifies pin when provided (admin/legacy path)", () => {
    const state = makeTestState();
    const ok = reducer(state, { type: "LOGIN", staffId: "S-001", pin: "3333" });
    expect(ok.user?.id).toBe("S-001");
    const bad = reducer(state, { type: "LOGIN", staffId: "S-001", pin: "0000" });
    expect(bad.user).toBeNull();
  });

  it("rejects unknown staff without a pin", () => {
    const result = reducer(makeTestState(), { type: "LOGIN", staffId: "S-999" });
    expect(result.user).toBeNull();
  });
});

describe("withAudit id minting (audit_log 21000 regression)", () => {
  it("never reuses an id already present in the hydrated ledger", () => {
    let state = makeTestState();
    // simulate hydration: ledger holds ids far above the per-session auditSeq (starts at 100)
    state = { ...state, audit: [{ id: 5000, at: Date.now(), actor: "seed", kind: "system", detail: "old" }, ...state.audit] } as State;
    const result = reducer(state, { type: "LOGIN", staffId: "S-001" });
    const top = result.audit[0];
    expect(top.id).toBeGreaterThan(5000);
    const ids = result.audit.map((a: { id: number }) => a.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates in the batch
  });
});
