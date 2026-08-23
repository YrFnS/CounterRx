import { describe, it, expect } from "vitest";
import {
  applyReportFilters,
  matchesTx,
  emptyFilters,
  saveView,
  loadView,
  deleteView,
  type ReportFilters,
  type FilterCtx,
  type SavedReportView,
} from "../lib/report-filters";
import { makeSettings, type Product, type Staff, type Transaction } from "../data";

/* ------------------------------------------------------------------ */
/*  W2.4 report builder — pure filter application + saved-view store   */
/* ------------------------------------------------------------------ */

function mkProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id, sku: id, barcode: "", name: id, generic: "", brand: "", category: "pain", form: "tablet",
    price: 10, cost: 4, reorderLevel: 10, rx: false, supplier: "MediSource Ltd", batches: [],
    ...overrides,
  };
}

function mkTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1", at: 1000, lines: [], subtotal: 10, discount: 0, tax: 0, total: 10,
    method: "cash", cashier: "Bea",
    ...overrides,
  };
}

const staff: Staff[] = [
  { id: "S1", name: "Bea", role: "cashier", pinHash: "x", initials: "B", active: true, createdAt: 1 },
  { id: "S2", name: "Ana", role: "cashier", pinHash: "x", initials: "A", active: true, createdAt: 1 },
];

type Ctx = { products: Product[]; staff: Staff[] };
function ctx(products: Product[]): Ctx {
  return { products, staff };
}

describe("applyReportFilters", () => {
  const amox = mkProduct("amox", { category: "antibiotics", rx: true, supplier: "MediSource Ltd" });
  const ibu = mkProduct("ibu", { category: "pain", rx: false, supplier: "PharmaLine Co" });
  const all = ctx([amox, ibu]);

  const amoxTx = mkTx({ id: "sale-amox", at: 5000, lines: [{ productId: "amox", name: "Amox", form: "tab", qty: 1, price: 10, rx: true }] });
  const ibuTx = mkTx({ id: "sale-ibu", at: 6000, lines: [{ productId: "ibu", name: "Ibu", form: "tab", qty: 2, price: 5, rx: false }] });
  const cardTx = mkTx({ id: "sale-card", at: 7000, method: "card", cashier: "Ana", lines: [{ productId: "amox", name: "Amox", form: "tab", qty: 1, price: 10, rx: true }] });
  const txs = [amoxTx, ibuTx, cardTx];

  it("keeps everything when no filters are set", () => {
    const out = applyReportFilters(txs, emptyFilters(), all);
    expect(out).toHaveLength(3);
  });

  it("applies the inclusive date range", () => {
    const f = { ...emptyFilters(), from: 5000, to: 6500 };
    const out = applyReportFilters(txs, f, all);
    expect(out.map((t) => t.id)).toEqual(["sale-amox", "sale-ibu"]);
  });

  it("filters by product category (line-level)", () => {
    const f = { ...emptyFilters(), categories: ["pain"] };
    const out = applyReportFilters(txs, f, all);
    expect(out.map((t) => t.id)).toEqual(["sale-ibu"]);
  });

  it("filters by supplier name (line-level)", () => {
    const f = { ...emptyFilters(), suppliers: ["MediSource Ltd"] };
    const out = applyReportFilters(txs, f, all);
    expect(out.map((t) => t.id).sort()).toEqual(["sale-amox", "sale-card"]);
  });

  it("filters by cashier staff id — matched through staff name", () => {
    const f = { ...emptyFilters(), cashiers: ["S2"] };
    const out = applyReportFilters(txs, f, all);
    expect(out.map((t) => t.id)).toEqual(["sale-card"]); // only cashier "Ana"
  });

  it("filters by payment method", () => {
    const f = { ...emptyFilters(), methods: ["card" as const] };
    const out = applyReportFilters(txs, f, all);
    expect(out.map((t) => t.id)).toEqual(["sale-card"]);
  });

  it("filters by rx / otc line kind", () => {
    const rx = applyReportFilters(txs, { ...emptyFilters(), kind: "rx" }, all);
    expect(rx.map((t) => t.id).sort()).toEqual(["sale-amox", "sale-card"]);
    const otc = applyReportFilters(txs, { ...emptyFilters(), kind: "otc" }, all);
    expect(otc.map((t) => t.id)).toEqual(["sale-ibu"]);
  });

  it("ANDs filters together", () => {
    const f: ReportFilters = { ...emptyFilters(), kind: "rx", methods: ["cash"], categories: ["antibiotics"] };
    const out = applyReportFilters(txs, f, all);
    expect(out.map((t) => t.id)).toEqual(["sale-amox"]);
  });

  it("drops a tx whose qualifying line is refunded/signed but still passes refund records", () => {
    const refund = mkTx({ id: "ref-1", at: 8000, refundOf: "sale-amox", lines: [{ productId: "amox", name: "Amox", form: "tab", qty: -1, price: 10, rx: true }] });
    const f: ReportFilters = { ...emptyFilters(), kind: "rx" };
    const out = applyReportFilters([amoxTx, refund], f, all);
    expect(out).toHaveLength(2);
  });

  it("excludes everything when a line-level filter matches no product", () => {
    const f = { ...emptyFilters(), categories: ["nope"] };
    expect(applyReportFilters(txs, f, all)).toHaveLength(0);
  });

  it("matchesTx short-circuit: out-of-range is false even when filters are empty", () => {
    expect(matchesTx(mkTx({ at: 0 }), { ...emptyFilters(), from: 10 }, all)).toBe(false);
  });
});

describe("saved views (save/load round trip)", () => {
  const filters = {
    ...emptyFilters(),
    from: 1,
    to: 2,
    categories: ["pain"],
    suppliers: ["MediSource Ltd"],
    cashiers: ["S1"],
    methods: ["cash" as const],
    kind: "rx" as const,
  };

  it("saveView appends a named view with a generated id", () => {
    const views = saveView([], " Q2  ", filters);
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe("Q2"); // trimmed
    expect(views[0].id).toBeTruthy();
  });

  it("saveView is a no-op for a blank name (same array identity)", () => {
    const views: SavedReportView[] = [];
    expect(saveView(views, "   ", filters)).toBe(views);
  });

  it("saveView with an explicit id replaces instead of duplicating", () => {
    const v1 = saveView([], "Q2", filters, "v-1");
    const v2 = saveView(v1, "Q2 Q3", filters, "v-1");
    expect(v2).toHaveLength(1);
    expect(v2[0].name).toBe("Q2 Q3");
  });

  it("round-trips through JSON (JSONB / localStorage semantics)", () => {
    let views = saveView([], "Q2", filters);
    views = saveView(views, "All cash", { ...emptyFilters(), methods: ["cash"] });
    const stored = JSON.parse(JSON.stringify(views)) as SavedReportView[];
    expect(stored).toHaveLength(2);
    const loaded = loadView(stored, views[0].id)!;
    expect(loaded.name).toBe("Q2");
    expect(loaded.filters).toEqual(filters);
    expect(loaded.filters.kind).toBe("rx");
  });

  it("loadView misses return undefined; deleteView removes by id", () => {
    const views = saveView([], "Q2", filters, "v-1");
    expect(loadView(views, "missing")).toBeUndefined();
    const rest = deleteView(views, "v-1");
    expect(rest).toHaveLength(0);
  });

  it("a saved view's arrays are cloned — later mutation does not alias the store", () => {
    const views = saveView([], "Q2", filters, "v-1");
    filters.categories.push("cardio");
    expect(loadView(views, "v-1")!.filters.categories).toEqual(["pain"]);
  });

  it("OrgSettings exposes savedReportViews defaulting to [] and survives a settings blob round-trip", () => {
    const s = makeSettings();
    expect(s.savedReportViews).toEqual([]);
    const roundT = JSON.parse(JSON.stringify({ ...s, savedReportViews: saveView([], "Q2", filters) }));
    expect(roundT.savedReportViews).toHaveLength(1);
    expect(roundT.savedReportViews[0].name).toBe("Q2");
  });
});