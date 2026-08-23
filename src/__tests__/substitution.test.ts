import { describe, it, expect } from "vitest";
import { genericSubstituteFor, substitutionSaving, stockOf } from "../data";
import { reducer } from "../store";
import type { Product, Prescription } from "../data";

/* Minimal fixtures — only what the tests touch. */
function makeProduct(id: string, brand: string, price: number, genOf?: string, qty = 10): Product {
  return {
    id, brand, name: brand, generic: "", form: "tab", category: "cat", price, cost: price * 0.5,
    rx: false, batches: [{ code: "B1", qty, cost: price * 0.5, expiry: Date.now() + 1e9, receivedAt: Date.now() }],
    reorderLevel: 3, supplierId: "s", priceTiers: [], uoms: [], genericOf: genOf as unknown as never,
  } as unknown as Product;
}

const brand = makeProduct("BR", "BrandCorp", 20, undefined, 5);
const gen = makeProduct("GN", "GenLabs", 12, "BR", 8);
void brand; void gen;
const catalog = [brand, gen];

type TestState = Parameters<typeof reducer>[0];
function baseState(over: Partial<TestState> = {}): TestState {
  return {
    view: "register", cart: [], products: catalog, customers: [], prescriptions: [],
    transactions: [], categories: [], staff: [], user: null, settings: { loyalty: { ptsPerUnit: 1, redeemThreshold: 1000, redeemValue: 5 } } as any,
    toasts: [], audit: [], shifts: [], currentShift: null, storeCredits: [], held: [], saleCustomerId: null,
    redeemPoints: 0, restrictedLog: [], transfers: [], purchaseOrders: [], apInvoices: [], expenses: [],
    suppliers: [], deliveries: [], webOrders: [], timeEntries: [], backorders: [], rxTransfers: [],
    prescribers: [], coldChainLogs: [], cardPrograms: [], coupons: [], reportCache: {}, drawer: { open: false, balance: 0, floats: [], movements: [], expected: 0, lastReconciled: 0, lastReconBy: null },
    payOpen: false, receipt: null, noteFor: null, scanMiss: 0, flashId: null, flashKey: 0, lang: "en",
    ...over,
  } as unknown as TestState;
}

describe("generic substitution (§3 DAW, W1.4)", () => {
  it("returns the cheaper in-stock generic as a candidate", () => {
    expect(genericSubstituteFor(brand, catalog)?.id).toBe("GN");
    expect(substitutionSaving(brand, gen)).toBe(8);
  });

  it("returns null when the SKU is already the generic", () => {
    expect(genericSubstituteFor(gen, catalog)).toBeNull();
  });

  it("returns null when the generic is out of stock", () => {
    const emptyGen = { ...gen, batches: [{ ...gen.batches[0], qty: 0 }] };
    expect(genericSubstituteFor(brand, [brand, emptyGen])).toBeNull();
  });

  it("SUBSTITUTE_GENERIC swaps the line and stamps substitutedFrom, keeping qty", () => {
    const s0 = baseState({ cart: [{ productId: "BR", qty: 3 }] });
    const s1 = reducer(s0, { type: "SUBSTITUTE_GENERIC", brandId: "BR", genericId: "GN" });
    expect(s1.cart).toHaveLength(1);
    expect(s1.cart[0]).toMatchObject({ productId: "GN", qty: 3, substitutedFrom: "BR" });
    expect(s1.cart[0].daw).toBeUndefined();
  });

  it("SET_DAW stamps the code so it prints on the receipt", () => {
    const s0 = baseState({ cart: [{ productId: "BR", qty: 1 }] });
    const s1 = reducer(s0, { type: "SET_DAW", productId: "BR", daw: 2 });
    expect(s1.cart[0].daw).toBe(2);
  });

  it("CHARGE_RX_PICKUP queues the Rx at Rx price and links it for auto-dispense", () => {
    const rx: Prescription = {
      id: "RX-1", patient: "Sam", productId: "BR", qty: 2, status: "waiting", age: 30,
      createdAt: Date.now(), prescriber: "Dr X", refillsRemaining: 3,
    } as unknown as Prescription;
    const s0 = baseState({ prescriptions: [rx] });
    const s1 = reducer(s0, { type: "CHARGE_RX_PICKUP", rxId: "RX-1" });
    expect(s1.cart[0]).toMatchObject({ productId: "BR", qty: 2, rxId: "RX-1" });
    expect(s1.view).toBe("register");
  });

  it("CHARGE_RX_PICKUP refuses an already-dispensed Rx (no double charge)", () => {
    const rx = { id: "RX-2", patient: "Lee", productId: "BR", qty: 1, status: "dispensed", age: 40, createdAt: Date.now(), prescriber: "Dr Y", refillsRemaining: 0 } as unknown as Prescription;
    const s0 = baseState({ prescriptions: [rx] });
    const s1 = reducer(s0, { type: "CHARGE_RX_PICKUP", rxId: "RX-2" });
    expect(s1.cart).toHaveLength(0); // no-op, toast-only
  });

  it("COMPLETE_SALE marks a linked Rx dispensed and decrements refills", () => {
    const rx = { id: "RX-3", patient: "Jo", productId: "BR", qty: 1, status: "waiting", age: 50, createdAt: Date.now(), prescriber: "Dr Z", refillsRemaining: 2 } as unknown as Prescription;
    const s0 = baseState({
      prescriptions: [rx],
      cart: [{ productId: "BR", qty: 1, rxId: "RX-3" }],
      redeemPoints: 0, saleCustomerId: null,
    });
    const s1 = reducer(s0, { type: "COMPLETE_SALE", payments: [{ method: "cash", amount: 20, ref: null as unknown as string }], discountPct: 0, taxExempt: false, idChecked: false });
    const after = s1.prescriptions.find((r) => r.id === "RX-3")!;
    expect(after.status).toBe("dispensed");
    expect(after.refillsRemaining).toBe(1);
    expect(s1.cart).toHaveLength(0); // cart cleared on sale
  });

  it("does not dispense an Rx that was simply attached (no rxId on the line)", () => {
    const rx = { id: "RX-4", patient: "Bo", productId: "BR", qty: 1, status: "waiting", age: 60, createdAt: Date.now(), prescriber: "Dr W", refillsRemaining: 5 } as unknown as Prescription;
    const s0 = baseState({ prescriptions: [rx], cart: [{ productId: "BR", qty: 1 }], redeemPoints: 0, saleCustomerId: null });
    const s1 = reducer(s0, { type: "COMPLETE_SALE", payments: [{ method: "cash", amount: 20, ref: null as unknown as string }], discountPct: 0, taxExempt: false, idChecked: false });
    expect(s1.prescriptions.find((r) => r.id === "RX-4")!.status).toBe("waiting");
  });

  it("stockOf helper sanity", () => {
    const probe = { ...brand, batches: [{ code: "x", qty: 4, cost: 1, expiry: 0 as unknown as number, receivedAt: 0 }] } as unknown as Product;
    expect(stockOf(probe, catalog)).toBe(4);
  });
});
