import { describe, it, expect } from "vitest";
import { patientsForBatchCode } from "../data";
import type { Transaction } from "../data";

function tx(
  id: string,
  at: number,
  lines: { productId: string; name: string; qty: number; batch: string }[],
  customerId?: string,
  opts: { refundOf?: string } = {},
): Transaction {
  return {
    id,
    at,
    customerId,
    lines: lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      form: "",
      qty: l.qty,
      price: 10,
      rx: true,
      alloc: [{ batch: l.batch, qty: l.qty }],
    })),
    subtotal: lines.reduce((s, l) => s + l.qty * 10, 0),
    discount: 0,
    tax: 0,
    total: lines.reduce((s, l) => s + l.qty * 10, 0),
    method: "cash",
    cashier: "Tester",
    refundOf: opts.refundOf,
  };
}

describe("patientsForBatchCode (W2.2 recall lookup)", () => {
  it("returns every patient who received units from the given lot/batch code", () => {
    const txs: Transaction[] = [
      tx("T-1", 1000, [{ productId: "p1", name: "Amoxicillin", qty: 2, batch: "AMX-24C11" }], "C-001"),
      tx("T-2", 2000, [{ productId: "p2", name: "Amoxicillin 500mg", qty: 1, batch: "AMX-24C11" }], "C-002"),
      tx("T-3", 3000, [{ productId: "p1", name: "Amoxicillin", qty: 3, batch: "B-2501-200" }], "C-001"),
    ];

    const hits = patientsForBatchCode(txs, "AMX-24C11");
    expect(hits).toHaveLength(2);
    expect(hits[0].qty).toBe(1); // newest first (T-2)
    expect(hits[0].customerId).toBe("C-002");
    expect(hits[1].qty).toBe(2); // T-1
    expect(hits[1].customerId).toBe("C-001");
  });

  it("resolves across different productIds sharing the same batch code", () => {
    const txs: Transaction[] = [
      tx("T-1", 100, [{ productId: "prod-a", name: "Product A", qty: 1, batch: "SHARED-LOT-99" }], "C-005"),
      tx("T-2", 200, [{ productId: "prod-b", name: "Product B", qty: 4, batch: "SHARED-LOT-99" }], "C-006"),
    ];
    const hits = patientsForBatchCode(txs, "SHARED-LOT-99");
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.productName).sort()).toEqual(["Product A", "Product B"]);
  });

  it("empty batch → empty result", () => {
    const txs: Transaction[] = [tx("T-1", 100, [{ productId: "p1", name: "Amox", qty: 2, batch: "B1" }], "C-1")];
    expect(patientsForBatchCode(txs, "")).toHaveLength(0);
    expect(patientsForBatchCode([], "B1")).toHaveLength(0);
  });

  it("excludes refunded sales but keeps the original sale", () => {
    const txs: Transaction[] = [
      tx("T-1", 1000, [{ productId: "p1", name: "Amox", qty: 5, batch: "B1" }], "C-1"),
      tx("T-2", 2000, [{ productId: "p1", name: "Amox", qty: 5, batch: "B1" }], "C-1", { refundOf: "T-1" }),
    ];
    const hits = patientsForBatchCode(txs, "B1");
    expect(hits).toHaveLength(1); // only T-1 (the refunded T-2 is skipped)
    expect(hits[0].txId).toBe("T-1");
  });

  it("returns lines with no customer as walk-in (customerId undefined)", () => {
    const txs: Transaction[] = [
      tx("T-1", 1000, [{ productId: "p1", name: "Amox", qty: 2, batch: "B1" }]),
    ];
    const hits = patientsForBatchCode(txs, "B1");
    expect(hits).toHaveLength(1);
    expect(hits[0].customerId).toBeUndefined();
    expect(hits[0].qty).toBe(2);
  });

  it("aggregates qty per transaction", () => {
    const txs: Transaction[] = [
      tx("T-1", 1000, [
        { productId: "p1", name: "Amox", qty: 3, batch: "B1" },
        { productId: "p2", name: "Ibup", qty: 2, batch: "B1" },
      ], "C-1"),
    ];
    const hits = patientsForBatchCode(txs, "B1");
    expect(hits).toHaveLength(2);
    expect(hits[0].qty + hits[1].qty).toBe(5);
  });
});
