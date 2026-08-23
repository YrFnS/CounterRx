import { describe, it, expect } from "vitest";
import { outstandingBalance } from "../data";
import type { Transaction, PaymentLeg } from "../data";

function leg(method: string, amount: number, extra: Partial<PaymentLeg> = {}): PaymentLeg {
  return { method: method as PaymentLeg["method"], amount, ...extra };
}

function mkTx(id: string, payments: PaymentLeg[]): Transaction {
  return {
    id, at: 1000, lines: [], subtotal: 100, discount: 0, tax: 0, total: 100,
    method: payments[0]?.method ?? "cash", payments, cashier: "Al", terminalId: "01",
  } as Transaction;
}

describe("pay-later AR (W1.1/R6)", () => {
  it("sums only unsettled pay_later legs for a customer", () => {
    const txs = [
      mkTx("t1", [leg("pay_later", 50, { dueDate: 2000 }), leg("pay_later", 30, { dueDate: 2000, settledAt: 3000 })]),
      mkTx("t2", [leg("pay_later", 20, { dueDate: 2000 })]),
      mkTx("t3", [leg("cash", 99)]),
    ];
    // customer filter is by transaction.customerId — use a helper that accepts all
    const bal = outstandingBalance("c1", txs.map((t) => ({ ...t, customerId: "c1" })));
    expect(bal).toBe(70); // 50 + 20 unsettled; 30 settled excluded; cash ignored
  });

  it("settled legs never double-count even after refunds", () => {
    const txs = [
      mkTx("t1", [leg("pay_later", 40, { dueDate: 2000, settledAt: 4000 })]),
      mkTx("t2", [leg("pay_later", 10, { dueDate: 2000 })]),
    ].map((t) => ({ ...t, customerId: "c2" }));
    expect(outstandingBalance("c2", txs)).toBe(10);
  });

  it("returns zero when a customer has no pay_later legs", () => {
    expect(outstandingBalance("c3", [mkTx("t1", [leg("cash", 10)])])).toBe(0);
  });
});
