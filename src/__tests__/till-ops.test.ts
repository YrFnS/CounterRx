import { describe, it, expect } from "vitest";
import {
  recordShiftTransaction,
  recordCashMovement,
  closeShift,
  generateXReport,
  generateZReport,
  applyStoreCredit,
  creditByCode,
  type Shift,
  type Transaction,
  type StoreCredit,
} from "../data";

function mkShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "s1",
    terminalId: "01",
    cashierId: "st-1",
    status: "open",
    openedAt: 1000,
    cashierName: "Al",
    openingBalance: 100,
    transactions: [],
    cashMovements: [],
    salesTotal: 0,
    refundsTotal: 0,
    cardTotal: 0,
    insuranceTotal: 0,
    storeCreditTotal: 0,
    paidInTotal: 0,
    paidOutTotal: 0,
    expectedCash: 100,
    ...overrides,
  };
}

function mkTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1", at: 2000, lines: [], subtotal: 10, discount: 0, tax: 0, total: 10,
    method: "cash", cashier: "Bea",
    ...overrides,
  };
}

describe("recordShiftTransaction", () => {
  it("appends a sale and raises salesTotal + expectedCash", () => {
    const s = mkShift();
    const updated = recordShiftTransaction(s, mkTx({ id: "t1", total: 25 }), "sale", "cash");
    expect(updated.transactions).toHaveLength(1);
    expect(updated.transactions[0].type).toBe("sale");
    expect(updated.salesTotal).toBe(25);
    expect(updated.expectedCash).toBe(125);
  });

  it("does not mutate the original shift", () => {
    const s = mkShift();
    recordShiftTransaction(s, mkTx(), "sale", "cash");
    expect(s.transactions).toHaveLength(0);
  });
});

describe("generateXReport", () => {
  it("sums tenders and counts transactions (no close needed)", () => {
    let s = mkShift();
    s = recordShiftTransaction(s, mkTx({ id: "a", total: 50 }), "sale", "cash");
    s = recordShiftTransaction(s, mkTx({ id: "b", total: 30 }), "sale", "card");
    s = recordShiftTransaction(s, mkTx({ id: "c", total: 50 }), "void", "cash");
    s = recordCashMovement(s, "paid_in", 5, "vendor refund", "Bea");
    s = recordCashMovement(s, "paid_out", 3, "supplies", "Bea");
    const r = generateXReport(s);
    expect(r.salesTotal).toBe(80);            // 50 + 30
    expect(r.currentCash).toBe(152);          // 100 (opening) + 50 (sale) + 5 (paid_in) - 3 (paid_out)
    expect(r.transactionCount).toBe(2);        // voids excluded from count
    expect(s.paidInTotal).toBe(5);
    expect(s.paidOutTotal).toBe(3);
  });
});

describe("closeShift / generateZReport", () => {
  it("computes over/short against counted cash", () => {
    let s = mkShift();
    s = recordShiftTransaction(s, mkTx({ id: "a", total: 50 }), "sale", "cash");
    const closed = closeShift(s, 145);
    expect(closed.status).toBe("closed");
    expect(closed.expectedCash).toBe(150);     // 100 + 50
    expect(closed.countedCash).toBe(145);
    expect(closed.overShort).toBe(-5);         // 145 - 150 => short 5
    const z = generateZReport(closed);
    expect(z).not.toBeNull();
    expect(z!.overShort).toBe(-5);
    expect(z!.closedAt).toBeTypeOf("number");
  });

  it("generateZReport returns null for an open shift", () => {
    expect(generateZReport(mkShift())).toBeNull();
  });
});

describe("store credit / gift cards", () => {
  it("creditByCode finds a credit by its scannable code", () => {
    const credits: StoreCredit[] = [
      { id: "c1", customerId: null, balance: 20, issuedAt: 1, code: "GC-123" },
    ];
    expect(creditByCode(credits, "GC-123")?.id).toBe("c1");
    expect(creditByCode(credits, "nope")).toBeUndefined();
  });

  it("applyStoreCredit deducts the redeemed amount", () => {
    const credits: StoreCredit[] = [
      { id: "c1", customerId: "u1", balance: 15, issuedAt: 1 },
    ];
    const after = applyStoreCredit(credits, "c1", 10);
    expect(after.find((c) => c.id === "c1")!.balance).toBe(5);
  });
});
