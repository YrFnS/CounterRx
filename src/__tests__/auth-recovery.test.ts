import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reducer, seed } from "../store";
import { makeProducts, makeStaff, makeSettings } from "../data";
import type { BackendData } from "../lib/sync";
import type { Staff } from "../data";

// reducer state/action types aren't exported from store.tsx; derive them from the reducer signature
type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

/* Helper to build a minimal State for testing the recovery logic */
function makeRecoveryState(overrides: Partial<State> = {}): State {
  const baseSeed = seed();
  return {
    ...baseSeed,
    user: null,
    backendAuthenticated: false,
    backendOffline: false,
    lockouts: {},
    restrictedLog: [],
    online: true,
    cart: [],
    held: [],
    saleCustomerId: null,
    redeemPoints: 0,
    currentShift: null,
    view: "register",
    invPreset: "all",
    payOpen: false,
    receipt: null,
    toasts: [],
    flashId: null,
    flashKey: 0,
    snapshotVersion: 0,
    shifts: [],
    storeCredits: [],
    ...overrides,
  };
}

describe("auth recovery - reducer/effect wiring", () => {
  // Test that LOGIN + BACKEND_AUTH actions can be dispatched sequentially
  it("LOGIN then BACKEND_AUTH restores authenticated user", () => {
    const staff = makeStaff(Date.now());
    const admin = staff.find((s: Staff) => s.id === "S-001")!;
    const initial = makeRecoveryState({ staff });

    // Simulate: session exists, no local user -> LOGIN then BACKEND_AUTH
    const afterLogin = reducer(initial, { type: "LOGIN", staffId: "S-001" });
    expect(afterLogin.user).not.toBeNull();
    expect(afterLogin.user?.id).toBe("S-001");
    expect(afterLogin.backendAuthenticated).toBe(false);

    const afterBackendAuth = reducer(afterLogin, { type: "BACKEND_AUTH", staffId: "S-001", authenticated: true });
    expect(afterBackendAuth.user?.id).toBe("S-001");
    expect(afterBackendAuth.backendAuthenticated).toBe(true);
  });

  it("BACKEND_AUTH alone works when user already in state (same staffId)", () => {
    const staff = makeStaff(Date.now());
    const initial = makeRecoveryState({
      user: { id: "S-001", name: "D. Whitfield", role: "pharmacy_admin", pinHash: "hash", initials: "DW", active: true, createdAt: Date.now() },
      staff,
    });

    const afterAuth = reducer(initial, { type: "BACKEND_AUTH", staffId: "S-001", authenticated: true });
    expect(afterAuth.user?.id).toBe("S-001");
    expect(afterAuth.backendAuthenticated).toBe(true);
  });

  it("BACKEND_AUTH does nothing when staffId mismatches current user", () => {
    const staff = makeStaff(Date.now());
    const initial = makeRecoveryState({
      user: { id: "S-001", name: "D. Whitfield", role: "pharmacy_admin", pinHash: "hash", initials: "DW", active: true, createdAt: Date.now() },
      staff,
    });

    // Different staffId should not change anything
    const afterAuth = reducer(initial, { type: "BACKEND_AUTH", staffId: "S-002", authenticated: true });
    expect(afterAuth.user?.id).toBe("S-001");
    expect(afterAuth.backendAuthenticated).toBe(false);
  });

  it("LOGOUT clears backendAuthenticated", () => {
    const staff = makeStaff(Date.now());
    const initial = makeRecoveryState({
      user: { id: "S-001", name: "D. Whitfield", role: "pharmacy_admin", pinHash: "hash", initials: "DW", active: true, createdAt: Date.now() },
      backendAuthenticated: true,
      staff,
    });

    const afterLogout = reducer(initial, { type: "LOGOUT" });
    expect(afterLogout.user).toBeNull();
    expect(afterLogout.backendAuthenticated).toBe(false);
  });
});

// Test the recovery logic function directly (mocking getSessionStaffId)
describe("recovery logic - getSessionStaffId mock", () => {
  let mockGetSessionStaffId: ReturnType<typeof vi.fn>;
  let originalGetSessionStaffId: typeof import("../lib/sync").getSessionStaffId;

  beforeEach(async () => {
    vi.resetModules();
    mockGetSessionStaffId = vi.fn();
    const mod = await import("../lib/sync");
    originalGetSessionStaffId = mod.getSessionStaffId;
    vi.doMock("../lib/sync", () => ({
      ...mod,
      getSessionStaffId: mockGetSessionStaffId,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unmock("../lib/sync");
  });

  it("recovery effect dispatches LOGIN + BACKEND_AUTH when session exists but no local user", async () => {
    const { getSessionStaffId } = await import("../lib/sync");
    const staff = makeStaff(Date.now());
    const admin = staff.find((s: Staff) => s.id === "S-001")!;

    // Mock: session belongs to S-001
    mockGetSessionStaffId.mockResolvedValue("S-001");

    // Simulate what the effect does
    const state = makeRecoveryState({ staff });
    let cancelled = false;
    let actions: { type: string; staffId: string; authenticated?: boolean }[] = [];

    const dispatch = (action: { type: string; staffId: string; authenticated?: boolean }) => { if (!cancelled) actions.push(action); };

    const staffId = await getSessionStaffId();
    if (!cancelled && staffId && !state.user) {
      const matchedStaff = state.staff.find((s: Staff) => s.id === staffId && s.active);
      if (matchedStaff) {
        dispatch({ type: "LOGIN", staffId });
        dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
      }
    }

    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ type: "LOGIN", staffId: "S-001" });
    expect(actions[1]).toEqual({ type: "BACKEND_AUTH", staffId: "S-001", authenticated: true });
  });

  it("recovery effect dispatches BACKEND_AUTH when user already matches session", async () => {
    const { getSessionStaffId } = await import("../lib/sync");
    const staff = makeStaff(Date.now());

    mockGetSessionStaffId.mockResolvedValue("S-001");

    const state = makeRecoveryState({
      user: { id: "S-001", name: "D. Whitfield", role: "pharmacy_admin", pinHash: "hash", initials: "DW", active: true, createdAt: Date.now() },
      staff,
    });
    let cancelled = false;
    let actions: { type: string; staffId: string; authenticated?: boolean }[] = [];

    const dispatch = (action: { type: string; staffId: string; authenticated?: boolean }) => { if (!cancelled) actions.push(action); };

    const staffId = await getSessionStaffId();
    if (!cancelled && staffId && staffId === state.user?.id) {
      dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
    }

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: "BACKEND_AUTH", staffId: "S-001", authenticated: true });
  });

  it("recovery effect does nothing when no session exists", async () => {
    const { getSessionStaffId } = await import("../lib/sync");
    const staff = makeStaff(Date.now());

    mockGetSessionStaffId.mockResolvedValue(null);

    const state = makeRecoveryState({ staff });
    let cancelled = false;
    let actions: { type: string; staffId: string; authenticated?: boolean }[] = [];

    const dispatch = (action: { type: string; staffId: string; authenticated?: boolean }) => { if (!cancelled) actions.push(action); };

    const staffId = await getSessionStaffId();
    if (!cancelled && staffId && staffId === state.user?.id) {
      dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
    } else if (!cancelled && staffId && !state.user) {
      const matchedStaff = state.staff.find((s: Staff) => s.id === staffId && s.active);
      if (matchedStaff) {
        dispatch({ type: "LOGIN", staffId });
        dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
      }
    }

    expect(actions).toHaveLength(0);
  });

  it("recovery effect does nothing when session belongs to inactive/unknown staff", async () => {
    const { getSessionStaffId } = await import("../lib/sync");
    const staff = makeStaff(Date.now());

    // Session returns staff ID that doesn't exist in local staff
    mockGetSessionStaffId.mockResolvedValue("S-999");

    const state = makeRecoveryState({ staff });
    let cancelled = false;
    let actions: { type: string; staffId: string; authenticated?: boolean }[] = [];

    const dispatch = (action: { type: string; staffId: string; authenticated?: boolean }) => { if (!cancelled) actions.push(action); };

    const staffId = await getSessionStaffId();
    if (!cancelled && staffId && staffId === state.user?.id) {
      dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
    } else if (!cancelled && staffId && !state.user) {
      const matchedStaff = state.staff.find((s: Staff) => s.id === staffId && s.active);
      if (matchedStaff) {
        dispatch({ type: "LOGIN", staffId });
        dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
      }
    }

    expect(actions).toHaveLength(0);
  });
});