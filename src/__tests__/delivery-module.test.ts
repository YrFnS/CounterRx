import { describe, it, expect } from "vitest";
import { reducer, seed } from "../store";
import { deliveryFeeFor, routeSequences } from "../data";
import type { Delivery } from "../data";

// reducer state/action types aren't exported from store.tsx; derive them from the reducer signature
type State = Parameters<typeof reducer>[0];

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
    outboxCount: 0,
    conflicts: [],
    shifts: [],
    storeCredits: [],
    notificationLog: [],
    ...overrides,
  };
}

const saleWithDelivery = (state: State, delivery: { address: string; fee: number; scheduledAt: number }): State =>
  reducer(
    { ...state, user: state.staff.find((s) => s.id === "S-003") ?? null },
    {
      type: "COMPLETE_SALE",
      payments: [{ method: "cash", amount: 1000 }],
      tendered: 1000,
      discountPct: 0,
      taxExempt: false,
      idChecked: false,
      delivery,
    },
  );

const dl = (patch: Partial<Delivery> & Pick<Delivery, "id" | "customerId" | "address" | "scheduledAt">): Delivery => {
  const { id, customerId, address, scheduledAt, ...rest } = patch;
  return {
    id, customerId, address,
    lines: [], fee: 0, mode: "delivery", status: "queued", scheduledAt,
    createdAt: 0, ...rest,
  };
};

describe("W3.2 delivery module — intake from sale", () => {
  it("creates a Delivery record linked to the transaction with the collected fee", () => {
    const state = makeTestState();
    const customer = state.customers[0];
    state.saleCustomerId = customer.id;
    state.cart = [{ productId: "pcm500", qty: 1 }];

    const result = saleWithDelivery(state, { address: "18 Harbor Lane", fee: 5, scheduledAt: Date.now() + 86_400_000 });
    const tx = result.transactions[0];
    const delivery = result.deliveries.find((d) => d.txId === tx.id);

    expect(delivery).toBeDefined();
    expect(delivery!.fee).toBe(5);
    expect(delivery!.address).toBe("18 Harbor Lane");
    expect(delivery!.customerId).toBe(customer.id);
    expect(delivery!.status).toBe("queued");
    expect(delivery!.lines).toEqual(tx.lines.map((l) => ({ productId: l.productId, qty: l.qty })));
    /* the delivery is prepended to the board */
    expect(result.deliveries[0].id).toBe(delivery!.id);
  });

  it("defaults the address from the linked customer's address book when none is given", () => {
    const state = makeTestState();
    const customer = state.customers.find((c) => c.address);
    state.saleCustomerId = customer!.id;
    state.cart = [{ productId: "pcm500", qty: 1 }];

    const result = saleWithDelivery(state, { address: "", fee: 3, scheduledAt: Date.now() });
    const delivery = result.deliveries.find((d) => d.txId === result.transactions[0].id);
    expect(delivery!.address).toBe(customer!.address);
  });

  it("no delivery payload → no delivery record", () => {
    const state = makeTestState();
    state.cart = [{ productId: "pcm500", qty: 1 }];
    /* sale without schedule toggle passes delivery: undefined */
    const plain = reducer(
      { ...state, user: state.staff.find((s) => s.id === "S-003") ?? null },
      { type: "COMPLETE_SALE", payments: [{ method: "cash", amount: 1000 }], tendered: 1000, discountPct: 0, taxExempt: false, idChecked: false },
    );
    expect(plain.transactions.length).toBeGreaterThan(0);
    expect(plain.deliveries.filter((d) => d.txId === plain.transactions[0].id).length).toBe(0);
  });
});

describe("W3.2 delivery module — fee policy", () => {
  const settings = (deliveryFee: number, freeThreshold: number) => ({ ...seed().settings, deliveryFee, freeThreshold });

  it("charges the flat fee below the free threshold", () => {
    expect(deliveryFeeFor(settings(5, 50), 49.99)).toBe(5);
    expect(deliveryFeeFor(settings(5, 50), 20)).toBe(5);
  });

  it("free when the order meets the threshold", () => {
    expect(deliveryFeeFor(settings(5, 50), 50)).toBe(0);
    expect(deliveryFeeFor(settings(5, 50), 250)).toBe(0);
  });

  it("no threshold (0) always charges the flat fee", () => {
    expect(deliveryFeeFor(settings(5, 0), 999)).toBe(5);
    expect(deliveryFeeFor(settings(0, 0), 5)).toBe(0);
  });
});

describe("W3.2 delivery module — driver assignment & routes", () => {
  it("assigns a driver from the active staff roster (no hardcoded DRIVERS)", () => {
    const state = makeTestState();
    const active = state.staff.filter((s) => s.active);
    expect(active.length).toBeGreaterThan(0);
    const driver = active[0].name;
    const target = state.deliveries.find((d) => d.status === "queued")!;

    const result = reducer(state, { type: "DELIVERY_STATUS", id: target.id, to: "assigned", driver });
    const updated = result.deliveries.find((d) => d.id === target.id)!;
    expect(updated.status).toBe("assigned");
    expect(updated.driver).toBe(driver);
    expect(state.staff.some((s) => s.name === updated.driver && s.active)).toBe(true);
  });

  it("groups pending deliveries by driver, sequenced by scheduledAt", () => {
    const deliveries: Delivery[] = [
      dl({ id: "A", customerId: "C-1", address: "1st St", scheduledAt: 300, status: "assigned", driver: "K. Boateng" }),
      dl({ id: "B", customerId: "C-2", address: "2nd St", scheduledAt: 100, status: "out", driver: "K. Boateng" }),
      dl({ id: "C", customerId: "C-3", address: "3rd St", scheduledAt: 200, status: "assigned", driver: "S. Mensah" }),
      dl({ id: "D", customerId: "C-4", address: "4th St", scheduledAt: 400, status: "delivered", driver: "K. Boateng" }), // excluded
      dl({ id: "E", customerId: "C-5", address: "5th St", scheduledAt: 500, status: "queued" }), // no driver — excluded
    ];

    const routes = routeSequences(deliveries);
    expect(routes.length).toBe(2);
    const boateng = routes.find((r) => r.driver === "K. Boateng")!;
    expect(boateng.stops.map((s) => s.id)).toEqual(["B", "A"]); // sorted by scheduledAt, delivered + undriven excluded
    const mensah = routes.find((r) => r.driver === "S. Mensah")!;
    expect(mensah.stops.map((s) => s.id)).toEqual(["C"]);
  });

  it("start route marks every assigned stop en route (out)", () => {
    const state = makeTestState();
    const driver = state.staff.find((s) => s.active)!.name;
    /* force two assigned stops for this driver */
    let s = state;
    for (const d of state.deliveries.filter((x) => x.status === "queued").slice(0, 2)) {
      s = reducer(s, { type: "DELIVERY_STATUS", id: d.id, to: "assigned", driver });
    }
    const assigned = s.deliveries.filter((d) => d.status === "assigned" && d.driver === driver);
    expect(assigned.length).toBeGreaterThan(0);

    let result = s;
    for (const d of assigned) result = reducer(result, { type: "DELIVERY_STATUS", id: d.id, to: "out" });
    const nowOut = result.deliveries.filter((d) => d.id && assigned.some((a) => a.id === d.id));
    expect(nowOut.every((d) => d.status === "out")).toBe(true);
  });

  it("POD capture on an out delivery completes it with proof (existing proof field)", () => {
    const state = makeTestState();
    const target = state.deliveries.find((d) => d.status === "out") ?? state.deliveries.find((d) => d.status === "assigned")!;
    const result = reducer(state, { type: "DELIVERY_STATUS", id: target.id, to: "delivered", proof: "Left with reception — signed J.N." });
    const updated = result.deliveries.find((d) => d.id === target.id)!;
    expect(updated.status).toBe("delivered");
    expect(updated.proof).toBe("Left with reception — signed J.N.");
  });
});
