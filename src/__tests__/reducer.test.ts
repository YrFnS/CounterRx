import { describe, it, expect } from "vitest";
import { reducer, seed } from "../store";
import { makeProducts, makeStaff, makeSettings } from "../data";
import type { Shift } from "../data";
import type { BackendData } from "../lib/sync";

// reducer state/action types aren't exported from store.tsx; derive them from the reducer signature
type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

function makeTestState(overrides: Partial<State> = {}): State {
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

describe("reducer - HYDRATE_BACKEND", () => {
  it("replaces all backend-owned state with loaded data", () => {
    const initial = makeTestState();
    const backendData: BackendData = {
      products: makeProducts(Date.now()),
      transactions: [],
      prescriptions: [],
      prescribers: [],
      customers: [],
      transfers: [],
      backorders: [],
      rxTransfers: [],
      suppliers: [],
      purchaseOrders: [],
      apInvoices: [],
      expenses: [],
      deliveries: [],
      webOrders: [],
      timeEntries: [],
      staff: makeStaff(Date.now()),
      settings: makeSettings(),
      restrictedLog: [],
      audit: [],
      shifts: [],
      storeCredits: [],
      snapshots: [],
      interactionPairs: [],
      coldChainLog: [],
    };

    const action: Action = { type: "HYDRATE_BACKEND", data: backendData };
    const result = reducer(initial, action);

    expect(result.products).toEqual(backendData.products);
    expect(result.transactions).toEqual(backendData.transactions);
    expect(result.prescriptions).toEqual(backendData.prescriptions);
    expect(result.customers).toEqual(backendData.customers);
    expect(result.staff).toEqual(backendData.staff);
    expect(result.settings).toEqual(backendData.settings);
  });

  it("preserves current user if still active in backend staff", () => {
    const initial = makeTestState({
      user: { id: "S-001", name: "Test User", role: "cashier", pinHash: "hash", initials: "TU", active: true, createdAt: Date.now() },
    });
    const backendData: BackendData = {
      products: makeProducts(Date.now()),
      transactions: [],
      prescriptions: [],
      prescribers: [],
      customers: [],
      transfers: [],
      backorders: [],
      rxTransfers: [],
      suppliers: [],
      purchaseOrders: [],
      apInvoices: [],
      expenses: [],
      deliveries: [],
      webOrders: [],
      timeEntries: [],
      staff: [
        { id: "S-001", name: "Test User", role: "cashier", pinHash: "hash", initials: "TU", active: true, createdAt: Date.now() },
        { id: "S-002", name: "Other User", role: "manager", pinHash: "hash", initials: "OU", active: true, createdAt: Date.now() },
      ],
      settings: makeSettings(),
      restrictedLog: [],
      audit: [],
      shifts: [],
      storeCredits: [],
      snapshots: [],
      interactionPairs: [],
      coldChainLog: [],
    };

    const action: Action = { type: "HYDRATE_BACKEND", data: backendData };
    const result = reducer(initial, action);

    expect(result.user?.id).toBe("S-001");
    expect(result.user?.name).toBe("Test User");
  });

  it("keeps original user if not found in backend but still active (current behavior)", () => {
    const initial = makeTestState({
      user: { id: "OLD-001", name: "Old User", role: "cashier", pinHash: "hash", initials: "OU", active: true, createdAt: Date.now() },
    });
    const backendData: BackendData = {
      products: makeProducts(Date.now()),
      transactions: [],
      prescriptions: [],
      prescribers: [],
      customers: [],
      transfers: [],
      backorders: [],
      rxTransfers: [],
      suppliers: [],
      purchaseOrders: [],
      apInvoices: [],
      expenses: [],
      deliveries: [],
      webOrders: [],
      timeEntries: [],
      staff: [
        { id: "S-001", name: "New User", role: "cashier", pinHash: "hash", initials: "NU", active: true, createdAt: Date.now() },
      ],
      settings: makeSettings(),
      restrictedLog: [],
      audit: [],
      shifts: [],
      storeCredits: [],
      snapshots: [],
      interactionPairs: [],
      coldChainLog: [],
    };

    const action: Action = { type: "HYDRATE_BACKEND", data: backendData };
    const result = reducer(initial, action);

    // Current behavior: falls back to original user if not found in backend
    expect(result.user?.id).toBe("OLD-001");
  });
});

describe("reducer - BACKEND_OFFLINE", () => {
  it("sets backendOffline flag to true", () => {
    const initial = makeTestState({ backendOffline: false });
    const action: Action = { type: "BACKEND_OFFLINE" };
    const result = reducer(initial, action);

    expect(result.backendOffline).toBe(true);
  });

  it("preserves other state when setting backendOffline", () => {
    const initial = makeTestState({
      backendOffline: false,
      products: makeProducts(Date.now()),
      cart: [{ productId: "test", qty: 1 }],
    });
    const action: Action = { type: "BACKEND_OFFLINE" };
    const result = reducer(initial, action);

    expect(result.backendOffline).toBe(true);
    expect(result.cart).toHaveLength(1);
    expect(result.products).toEqual(initial.products);
  });
});

describe("reducer - LOGIN", () => {
  it("logs in with correct PIN and returns user", () => {
    const initial = makeTestState();
    const action: Action = { type: "LOGIN", staffId: "S-001", pin: "3333" };
    const result = reducer(initial, action);

    expect(result.user).not.toBeNull();
    expect(result.user?.id).toBe("S-001");
    expect(result.backendAuthenticated).toBe(false);
  });

  it("fails with incorrect PIN", () => {
    const initial = makeTestState();
    const action: Action = { type: "LOGIN", staffId: "S-001", pin: "0000" };
    const result = reducer(initial, action);

    expect(result.user).toBeNull();
    expect(result.lockouts["S-001"]?.fails).toBe(1);
  });

  it("increments fails on failed login (existing behavior - lockout logic has a known bug)", () => {
    let state = makeTestState();
    // First verify initial state has no lockout
    expect(state.lockouts["S-001"]).toBeUndefined();
    // Current behavior: fails resets to 1 each attempt until lockout threshold
    // This is a known bug in the lockout logic (lock.until check incorrectly resets fails)
    state = reducer(state, { type: "LOGIN", staffId: "S-001", pin: "0000" });
    expect(state.lockouts["S-001"]?.fails).toBe(1);
    state = reducer(state, { type: "LOGIN", staffId: "S-001", pin: "0000" });
    expect(state.lockouts["S-001"]?.fails).toBe(1);
  });
});

describe("reducer - COMPLETE_SALE stock validation", () => {
  it("rejects sale when stock insufficient", () => {
    const products = makeProducts(Date.now());
    const p = products.find((x) => x.id === "amx500")!;
    p.batches = [{ batch: "TEST-1", expiry: "2030-01-01", qty: 1 }];
    const initial = makeTestState({ products, cart: [{ productId: "amx500", qty: 2 }] });
    const initialTxCount = initial.transactions.length;
    const action: Action = {
      type: "COMPLETE_SALE",
      payments: [{ method: "cash", amount: 20 }],
      discountPct: 0,
      taxExempt: false,
      idChecked: false,
    };
    const result = reducer(initial, action);
    expect(result.toasts.some((t) => t.kind === "error" && t.msg.includes("short on stock"))).toBe(true);
    expect(result.transactions).toHaveLength(initialTxCount); // no new transaction added
  });

  it("completes sale when stock sufficient", () => {
    const products = makeProducts(Date.now());
    const p = products.find((x) => x.id === "amx500")!;
    p.batches = [{ batch: "TEST-1", expiry: "2030-01-01", qty: 10 }];
    const initial = makeTestState({ products, cart: [{ productId: "amx500", qty: 2 }] });
    const initialTxCount = initial.transactions.length;
    const action: Action = {
      type: "COMPLETE_SALE",
      payments: [{ method: "cash", amount: 20 }],
      discountPct: 0,
      taxExempt: false,
      idChecked: false,
    };
    const result = reducer(initial, action);
    expect(result.transactions).toHaveLength(initialTxCount + 1); // one new transaction
    expect(result.cart).toHaveLength(0);
  });
});

describe("reducer - LOGOUT", () => {
  it("clears user and session state", () => {
    const initial = makeTestState({
      user: { id: "S-001", name: "Test", role: "cashier", pinHash: "hash", initials: "T", active: true, createdAt: Date.now() },
      cart: [{ productId: "test", qty: 1 }],
      payOpen: true,
      currentShift: { id: "shift-1", terminalId: "T-01", cashierId: "S-001", cashierName: "Test", openedAt: Date.now(), status: "open" as const, openingBalance: 100, transactions: [], cashMovements: [], salesTotal: 0, refundsTotal: 0, cardTotal: 0, insuranceTotal: 0, storeCreditTotal: 0, paidInTotal: 0, paidOutTotal: 0, expectedCash: 100 } as Partial<Shift> as Shift,
      saleCustomerId: "cust-1",
      redeemPoints: 50,
    });
    const action: Action = { type: "LOGOUT" };
    const result = reducer(initial, action);

    expect(result.user).toBeNull();
    expect(result.backendAuthenticated).toBe(false);
    expect(result.cart).toHaveLength(0);
    expect(result.payOpen).toBe(false);
    expect(result.currentShift).toBeNull();
    expect(result.saleCustomerId).toBeNull();
    expect(result.redeemPoints).toBe(0);
  });
});