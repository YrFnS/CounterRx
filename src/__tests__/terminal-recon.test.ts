import { describe, it, expect } from "vitest";
import {
  createShift,
  recordShiftTransaction,
  recordCashMovement,
  closeShift,
  generateZReport,
  groupShiftsByTerminal,
  terminalVariance,
  terminalIdOf,
  allTerminalsZReport,
  type Shift,
  type Transaction,
} from "../data";

function mkShift(terminalId: string, over: Partial<Shift> = {}): Shift {
  return {
    id: `SH-${terminalId}-${Math.random().toString(36).slice(2, 6)}`,
    terminalId,
    cashierId: "st-1",
    cashierName: "Al",
    openedAt: 1_000,
    status: "open",
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
    ...over,
  };
}

function mkTx(total: number, method: "cash" | "card" = "cash", id = "t1"): Transaction {
  return {
    id, at: 2_000, lines: [], subtotal: total, discount: 0, tax: 0, total,
    method, cashier: "Bea",
  };
}

describe("terminalVariance", () => {
  it("is counted minus expected, rounded to cents", () => {
    expect(terminalVariance(150, 145)).toBe(-5);
    expect(terminalVariance(150, 153.55)).toBe(3.55);
    expect(terminalVariance(0, 0)).toBe(0);
  });
});

describe("terminalIdOf fallback", () => {
  it("uses shift terminalId when present", () => {
    const s = mkShift("T-03");
    expect(terminalIdOf(s, "T-01")).toBe("T-03");
  });
  it("falls back to org terminalId when shift terminalId is blank", () => {
    const s = mkShift("", { terminalId: "" });
    expect(terminalIdOf(s, "T-MAIN")).toBe("T-MAIN");
    const empty = mkShift("   ");
    expect(terminalIdOf(empty, "T-MAIN")).toBe("T-MAIN");
  });
});

describe("groupShiftsByTerminal", () => {
  it("rolls sales, paid-in/out and expected cash up per terminal", () => {
    let a = mkShift("T-01");
    a = recordShiftTransaction(a, mkTx(50, "cash", "a1"), "sale", "cash");
    let b = mkShift("T-02");
    b = recordShiftTransaction(b, mkTx(80, "card", "b1"), "sale", "card");
    b = recordCashMovement(b, "paid_in", 5, "vendor", "Bea");
    b = recordCashMovement(b, "paid_out", 10, "supplies", "Bea");

    const groups = groupShiftsByTerminal([a, b], "T-FALLBACK");
    expect(groups).toHaveLength(2);

    const g1 = groups.find((g) => g.terminalId === "T-01")!;
    expect(g1.salesTotal).toBe(50);
    expect(g1.expectedCash).toBe(150); // 100 + 50
    expect(g1.paidInTotal).toBe(0);
    expect(g1.cashMovements).toHaveLength(0);

    const g2 = groups.find((g) => g.terminalId === "T-02")!;
    expect(g2.salesTotal).toBe(80);
    expect(g2.cardTotal).toBe(80);
    expect(g2.paidInTotal).toBe(5);
    expect(g2.paidOutTotal).toBe(10);
    // card sale does not change expectedCash; only paid-in/out do
    expect(g2.expectedCash).toBe(95); // 100 + 5 (paid_in) - 10 (paid_out)
    expect(g2.cashMovements).toHaveLength(2);
  });

  it("falls back to the org terminal id for legacy shifts with no terminalId", () => {
    let legacy = mkShift("", { terminalId: "" });
    legacy = recordShiftTransaction(legacy, mkTx(40, "cash", "l1"), "sale", "cash");
    const groups = groupShiftsByTerminal([legacy], "T-LEGACY");
    expect(groups).toHaveLength(1);
    expect(groups[0].terminalId).toBe("T-LEGACY");
    expect(groups[0].salesTotal).toBe(40);
  });

  it("treats open shifts as counted = expected (zero variance) and closed shifts use counted", () => {
    let open = mkShift("T-01");
    open = recordShiftTransaction(open, mkTx(60, "cash", "o1"), "sale", "cash");
    let closed = mkShift("T-01");
    closed = recordShiftTransaction(closed, mkTx(60, "cash", "c1"), "sale", "cash");
    closed = closeShift(closed, 150); // expected 160, counted 150 => short 10

    const groups = groupShiftsByTerminal([open, closed], "T-01");
    const g = groups[0];
    expect(g.expectedCash).toBe(320); // 100+60 + 100+60
    expect(g.countedCash).toBe(310); // open counts expected (160) + closed counted (150)
    expect(g.overShort).toBe(-10);
  });
});

describe("allTerminalsZReport", () => {
  it("aggregates closed-shift variance across terminals for the date", () => {
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    const openedAt = new Date(day); openedAt.setHours(9, 0, 0, 0);

    let t1 = mkShift("T-01", { openedAt: openedAt.getTime() });
    t1 = recordShiftTransaction(t1, mkTx(100, "cash", "x1"), "sale", "cash");
    t1 = closeShift(t1, 199); // expected 200, counted 199 => short 1

    let t2 = mkShift("T-02", { openedAt: openedAt.getTime() });
    t2 = recordShiftTransaction(t2, mkTx(50, "card", "x2"), "sale", "card");
    t2 = recordCashMovement(t2, "paid_in", 20, "float", "Bea");
    t2 = closeShift(t2, 170); // expected 120 (open 100 + paid_in 20), counted 170 => over 50

    // a shift from a different day must be excluded
    let other = mkShift("T-01", { openedAt: openedAt.getTime() - 86_400_000 });
    other = recordShiftTransaction(other, mkTx(999, "cash", "x9"), "sale", "cash");
    other = closeShift(other, 1099);

    const z = allTerminalsZReport([t1, t2, other], day, "T-FB");

    expect(z.terminals).toHaveLength(2);
    expect(z.totalSales).toBe(150); // 100 + 50, the off-day 999 excluded
    expect(z.totalExpectedCash).toBe(320); // 200 + 120
    expect(z.totalCountedCash).toBe(369); // 199 + 170
    expect(z.totalOverShort).toBe(49); // day's variance sums: -1 (T-01) + 50 (T-02)

    const g1 = z.terminals.find((g) => g.terminalId === "T-01")!;
    expect(g1.overShort).toBe(-1);
    const g2 = z.terminals.find((g) => g.terminalId === "T-02")!;
    expect(g2.overShort).toBe(50);
    expect(g2.cardTotal).toBe(50);
  });

  it("returns empty terminals for a date with no shifts", () => {
    const z = allTerminalsZReport([], new Date(), "T-FB");
    expect(z.terminals).toHaveLength(0);
    expect(z.totalOverShort).toBe(0);
    expect(z.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("per-terminal Z math integration", () => {
  it("expected-vs-counted variance matches generateZReport over/short", () => {
    let s = mkShift("T-01");
    s = recordShiftTransaction(s, mkTx(75, "cash", "y1"), "sale", "cash");
    const closed = closeShift(s, 160); // expected 175, counted 160 => short 15
    const z = generateZReport(closed);
    expect(z).not.toBeNull();
    expect(z!.overShort).toBe(-15);

    const groups = groupShiftsByTerminal([closed], "T-FB");
    const v = terminalVariance(groups[0].expectedCash, groups[0].countedCash);
    expect(v).toBe(-15);
    expect(v).toBe(z!.overShort);
  });
});
