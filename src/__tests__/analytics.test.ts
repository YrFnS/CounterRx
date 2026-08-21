import { describe, it, expect } from "vitest";
import {
  calculateLTV,
  supplierPerformance,
  expiryAtRisk,
  type Customer,
  type Transaction,
  type Supplier,
  type PurchaseOrder,
  type ApInvoice,
  type Product,
} from "../data";

function mkCustomer(id: string): Customer {
  return {
    id, name: `Cust ${id}`, phone: "555-0100", createdAt: 1, notes: "", points: 0,
    allergies: [], email: undefined, dob: undefined, gender: undefined, address: undefined,
    bloodType: undefined, primaryPrescriberId: undefined, insurancePlan: undefined,
    clinicalNotes: undefined, taxExempt: false, fields: [],
  };
}

function mkTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1", at: 1000, lines: [], subtotal: 10, discount: 0, tax: 1, total: 11,
    method: "cash", cashier: "Bea",
    ...overrides,
  };
}

function mkSupplier(id: string, name: string): Supplier {
  return {
    id, name, contact: "rep", phone: "555", email: "s@x.com", terms: 30,
    leadDays: 5, minOrder: 100, priceBook: [],
  };
}

function mkProduct(id: string, name: string, cost: number, batches: Product["batches"]): Product {
  return {
    id, sku: id, barcode: "", name, generic: "", brand: "", category: "pain", form: "tablet",
    price: cost * 2, cost, reorderLevel: 10, rx: false, supplier: "S-1",
    batches, uoms: [], fields: [], kit: [], ndc: undefined, gtin: undefined,
    controlled: undefined, restricted: undefined, genericOf: undefined, variantOf: undefined,
    compound: false, coldChain: false,
  };
}

describe("calculateLTV", () => {
  it("aggregates revenue per customer and sorts by LTV desc", () => {
    const customers = [mkCustomer("c1"), mkCustomer("c2")];
    const transactions = [
      mkTx({ id: "t1", customerId: "c1", total: 100 }),
      mkTx({ id: "t2", customerId: "c1", total: 50 }),
      mkTx({ id: "t3", customerId: "c2", total: 30 }),
      mkTx({ id: "t4", refundOf: "t0", customerId: "c1", total: 10 }), // excluded
    ];
    const result = calculateLTV(customers, transactions);
    expect(result).toHaveLength(2);
    expect(result[0].customerId).toBe("c1");
    expect(result[0].ltv).toBe(150);
    expect(result[0].visits).toBe(2);
    expect(result[0].avgBasket).toBe(75);
    expect(result[1].customerId).toBe("c2");
    expect(result[1].ltv).toBe(30);
  });

  it("skips customers with no sales", () => {
    const customers = [mkCustomer("c1"), mkCustomer("c2")];
    const transactions = [mkTx({ id: "t1", customerId: "c1", total: 20 })];
    const result = calculateLTV(customers, transactions);
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe("c1");
  });
});

describe("supplierPerformance", () => {
  it("computes on-time rate, lead days, and total spend", () => {
    const suppliers = [mkSupplier("s1", "Acme"), mkSupplier("s2", "Globex")];
    const now = Date.now();
    const day = 86_400_000;
    const purchaseOrders: PurchaseOrder[] = [
      { id: "po1", supplierId: "s1", lines: [], status: "received", createdAt: now - 10 * day, expectedAt: now - 2 * day, receivedAt: now - 3 * day },
      { id: "po2", supplierId: "s1", lines: [], status: "received", createdAt: now - 10 * day, expectedAt: now - 2 * day, receivedAt: now - 1 * day },
      { id: "po3", supplierId: "s2", lines: [], status: "received", createdAt: now - 10 * day, expectedAt: now - 2 * day, receivedAt: now - 1 * day },
    ];
    const apInvoices: ApInvoice[] = [
      { id: "inv1", number: "INV-1", supplierId: "s1", date: now, dueDays: 30, total: 500, payments: [], credits: [] },
      { id: "inv2", number: "INV-2", supplierId: "s2", date: now, dueDays: 30, total: 300, payments: [], credits: [] },
    ];
    const result = supplierPerformance(purchaseOrders, apInvoices, [], suppliers, now);
    expect(result).toHaveLength(2);
    const acme = result.find((r) => r.supplierId === "s1")!;
    expect(acme.onTimeRate).toBe(0.5);          // 1 of 2 received on time
    expect(acme.totalSpend).toBe(500);
    expect(acme.invoiceCount).toBe(1);
    expect(acme.avgLeadDays).toBeCloseTo(8);     // (7 + 9) / 2 = 8
    const globex = result.find((r) => r.supplierId === "s2")!;
    expect(globex.onTimeRate).toBe(0);           // 1 received PO, but late (received after expected)
    expect(globex.totalSpend).toBe(300);
  });
});

describe("expiryAtRisk", () => {
  const now = Date.now();
  const day = 86_400_000;

  it("flags batches expiring within the window", () => {
    const future = new Date(now + 30 * day).toISOString();
    const products = [mkProduct("p1", "Aspirin", 2, [{ batch: "B1", expiry: future, qty: 50 }])];
    const result = expiryAtRisk(products, 90, now);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe("p1");
    expect(result[0].batch).toBe("B1");
    expect(result[0].qty).toBe(50);
    expect(result[0].valueAtRisk).toBe(100);
    expect(result[0].daysUntilExpiry).toBe(30);
  });

  it("excludes batches outside the window and zero-qty lots", () => {
    const far = new Date(now + 200 * day).toISOString();
    const soon = new Date(now + 10 * day).toISOString();
    const products = [
      mkProduct("p1", "Vit C", 1, [{ batch: "B1", expiry: far, qty: 10 }]),
      mkProduct("p2", "Ibuprofen", 1, [{ batch: "B2", expiry: soon, qty: 0 }]),
    ];
    const result = expiryAtRisk(products, 90, now);
    expect(result).toHaveLength(0);
  });

  it("sorts by soonest expiry first", () => {
    const d10 = new Date(now + 10 * day).toISOString();
    const d60 = new Date(now + 60 * day).toISOString();
    const products = [
      mkProduct("p1", "A", 1, [{ batch: "B1", expiry: d60, qty: 5 }]),
      mkProduct("p2", "B", 1, [{ batch: "B2", expiry: d10, qty: 5 }]),
    ];
    const result = expiryAtRisk(products, 90, now);
    expect(result[0].productId).toBe("p2");
    expect(result[1].productId).toBe("p1");
  });
});
