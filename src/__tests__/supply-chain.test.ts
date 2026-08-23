import { describe, it, expect } from "vitest";
import { reducer, seed } from "../store";
import { stockOf, allocFEFO, patientsForLot, deductFromLot, tempInRange, COLD_CHAIN_MIN_C, COLD_CHAIN_MAX_C } from "../data";
import type { Transaction } from "../data";

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
    shifts: [],
    storeCredits: [],
    notificationLog: [],
    ...overrides,
  };
}

const completeSale = (state: State, cashierId: string): State => reducer(
  { ...state, user: state.staff.find((s) => s.id === cashierId) ?? null },
  {
    type: "COMPLETE_SALE",
    payments: [{ method: "cash", amount: 1000 }],
    tendered: 1000,
    discountPct: 0,
    taxExempt: false,
    idChecked: false,
  },
);

describe("UOM at register (§5)", () => {
  it("sells in a pack UOM and deducts qty × factor base units from stock", () => {
    const state = makeTestState();
    const pcm = state.products.find((p) => p.id === "pcm500")!; // seeded UOM: box ×10 @ 16.20
    const before = stockOf(pcm);
    state.cart = [{ productId: "pcm500", qty: 2, uom: "box" }];

    const result = completeSale(state, "S-003");
    const line = result.transactions[0].lines[0];
    expect(line.qty).toBe(2);
    expect(line.uom).toBe("Box of 10 strips");
    expect(line.uomFactor).toBe(10);
    expect(line.price).toBe(16.2);                     // UOM's own price wins over factor × base
    expect(stockOf(result.products.find((p) => p.id === "pcm500")!)).toBe(before - 20); // 2 boxes = 20 base units
  });

  it("SET_LINE_UOM switches the line unit and clamps qty to the pack sellable max", () => {
    const state = makeTestState();
    state.cart = [{ productId: "pcm500", qty: 3 }]; // 3 base units
    const result = reducer(state, { type: "SET_LINE_UOM", productId: "pcm500", uom: "box" });
    expect(result.cart[0].uom).toBe("box");
    expect(result.cart[0].qty).toBe(Math.min(3, Math.max(1, Math.floor(stockOf(state.products.find((p) => p.id === "pcm500")!) / 10))));
  });
});

describe("per-lot cost at receive / FIFO margin (§5/§6)", () => {
  it("RESTOCK stores the entered cost on the new batch", () => {
    const state = makeTestState();
    const result = reducer(state, {
      type: "RESTOCK", productId: "atv20", amount: 40, batch: "ATV-26Z01", expiry: "2027-12-31", cost: 5.25,
    });
    const lot = result.products.find((p) => p.id === "atv20")!.batches.find((b) => b.batch === "ATV-26Z01")!;
    expect(lot.cost).toBe(5.25);
  });

  it("sale line cost follows the FEFO lot cost, so margin is lot-accurate", () => {
    const state = makeTestState();
    /* repoint amx500's shelf to a single lot costed at 2.00 */
    state.products = state.products.map((p) =>
      p.id === "amx500"
        ? { ...p, batches: [{ batch: "LOT-EXP", expiry: "2026-02-01", qty: 50, cost: 2.0 }] }
        : p);
    state.cart = [{ productId: "amx500", qty: 1 }]; // amx500 list price 8.40

    const result = completeSale(state, "S-003");
    const line = result.transactions[0].lines[0];
    expect(line.cost).toBe(2.0);
    expect(line.price - line.cost!).toBe(6.4); // margin uses the lot cost, not product.cost (4.90)
  });

  it("allocFEFO attributes the earliest-expiry lot's cost to the allocation", () => {
    const batches = [
      { batch: "L1", expiry: "2026-01-01", qty: 10, cost: 1.5 },
      { batch: "L2", expiry: "2027-01-01", qty: 10, cost: 3.0 },
    ];
    const { alloc } = allocFEFO(batches, 5);
    expect(alloc).toEqual([{ batch: "L1", qty: 5, cost: 1.5 }]);
  });
});

describe("recall tracing (§3/§5)", () => {
  it("returns every patient who received units of the lot", () => {
    const tx: Transaction = {
      id: "T-100", at: 1000, lines: [
        { productId: "amx500", name: "Amoxicillin", form: "", qty: 2, price: 8.4, rx: true, alloc: [{ batch: "AMX-24C11", qty: 2 }] },
      ],
      subtotal: 16.8, discount: 0, tax: 0, total: 16.8, method: "cash", cashier: "A. Okafor", customerId: "C-001",
    };
    const hits = patientsForLot([tx], "amx500", "AMX-24C11");
    expect(hits).toHaveLength(1);
    expect(hits[0].customerId).toBe("C-001");
    expect(hits[0].qty).toBe(2);
  });

  it("excludes refunded sales — returned units never left the shelf twice", () => {
    const tx: Transaction = {
      id: "T-101", at: 1000, lines: [
        { productId: "amx500", name: "Amoxicillin", form: "", qty: 1, price: 8.4, rx: true, alloc: [{ batch: "AMX-24C11", qty: 1 }] },
      ],
      subtotal: 8.4, discount: 0, tax: 0, total: 8.4, method: "cash", cashier: "A. Okafor", refundOf: "T-90",
    };
    expect(patientsForLot([tx], "amx500", "AMX-24C11")).toHaveLength(0);
  });
});

describe("expiry write-off (§5)", () => {
  const lotOf = (state: State) => state.products.find((p) => p.id === "azi250")!; // single-lot product

  it("rejects the write-off for a cashier (no apply_count role)", () => {
    const state = makeTestState({ user: state_null_cashier() });
    const p = lotOf(state);
    const batch = p.batches[0].batch;
    const before = state.products;
    const result = reducer(state, { type: "WRITE_OFF", productId: p.id, batch, reason: "Expired on shelf" });
    expect(result.products).toEqual(before); // untouched
    expect(result.toasts[0]?.kind).toBe("error");
  });

  it("removes the lot with manager approval and logs the write-off", () => {
    const admin = seed().staff.find((s) => s.id === "S-001") ?? null; // pharmacy_admin
    const state = makeTestState({ user: admin });
    const p = lotOf(state);
    const batch = p.batches[0].batch;
    const result = reducer(state, { type: "WRITE_OFF", productId: p.id, batch, reason: "Expired on shelf" });
    const after = result.products.find((x) => x.id === "azi250")!;
    expect(stockOf(after)).toBe(0);
    expect(after.batches.find((b) => b.batch === batch)).toBeUndefined();
    expect(result.audit[0].detail).toContain("WRITE-OFF");
  });
});

describe("RTV — return to vendor (§5)", () => {
  it("pulls units off the lot and books an AP credit against the supplier's open invoice", () => {
    const state = makeTestState();
    const pcm = state.products.find((p) => p.id === "pcm500")!; // supplier Apex Distributors → SUP-03 (INV-8801 open)
    const before = stockOf(pcm);
    const creditsBefore = state.apInvoices.find((i) => i.id === "INV-8801")!.credits.length;

    const result = reducer(state, {
      type: "RTV", productId: "pcm500", batch: pcm.batches[0].batch, qty: 10, reason: "Damaged cartons on arrival",
    });
    expect(stockOf(result.products.find((p) => p.id === "pcm500")!)).toBe(before - 10);
    const inv = result.apInvoices.find((i) => i.id === "INV-8801")!;
    expect(inv.credits.length).toBe(creditsBefore + 1);
    expect(inv.credits[inv.credits.length - 1].amount).toBe(7); // 10 × pcm cost 0.70
    expect(inv.credits[inv.credits.length - 1].note).toContain("RTV");
  });
});

describe("cold chain (§5)", () => {
  it("acceptance band flags out-of-range readings", () => {
    expect(COLD_CHAIN_MIN_C).toBe(2);
    expect(COLD_CHAIN_MAX_C).toBe(8);
    expect(tempInRange(3.8)).toBe(true);
    expect(tempInRange(9.2)).toBe(false);
    expect(tempInRange(1.5)).toBe(false);
  });

  it("COLD_CHAIN_LOG appends a reading for a coldChain product", () => {
    const state = makeTestState();
    const result = reducer(state, { type: "COLD_CHAIN_LOG", productId: "insg", tempC: 9.5, note: "door ajar" });
    expect(result.coldChainLog[0].productId).toBe("insg");
    expect(result.coldChainLog[0].tempC).toBe(9.5);
    expect(result.coldChainLog[0].inRange).toBe(false);
  });

  it("deductFromLot removes the lot entirely at zero qty", () => {
    const lots = [
      { batch: "L1", expiry: "2026-01-01", qty: 5, cost: 1 },
      { batch: "L2", expiry: "2027-01-01", qty: 5, cost: 2 },
    ];
    const out = deductFromLot(lots, "L1", 5);
    expect(out.map((b) => b.batch)).toEqual(["L2"]);
    expect(deductFromLot(lots, "L1", 2)[0].qty).toBe(3);
  });
});

// helper — cashier with no write-off permission
function state_null_cashier() {
  const s = seed();
  return s.staff.find((x) => x.role === "cashier") ?? null;
}
