import { describe, it, expect } from "vitest";
import { parseCsv, autoMap, validateAndBuild } from "../lib/catalog-import";
import { reducer, seed } from "../store";
import { makeProducts } from "../data";
import type { Product } from "../data";

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
    ...overrides,
  };
}

const CATEGORIES = new Set(["pain", "antibiotics"]);

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes and commas-in-quotes", () => {
    const csv = 'sku,name,price\n"AMX-1","Amoxicillin ""500""",8.40\nCIP-1,"Cipro, 500mg",9.60';
    expect(parseCsv(csv)).toEqual([
      ["sku", "name", "price"],
      ["AMX-1", 'Amoxicillin "500"', "8.40"],
      ["CIP-1", "Cipro, 500mg", "9.60"],
    ]);
  });

  it("handles CRLF line ends and skips blank lines", () => {
    const rows = parseCsv("sku,name\r\nA-1,Aspirin\r\n\r\nB-1,Benadryl\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["A-1", "Aspirin"]);
  });
});

describe("autoMap", () => {
  it("maps every inventory-export header by exact name", () => {
    const headers = ["sku", "name", "generic", "brand", "category", "form", "price", "cost", "lot", "lot_qty", "expiry", "total_stock", "reorder_level", "rx", "supplier"];
    const m = autoMap(headers);
    expect(m.sku).toBe(0);
    expect(m.name).toBe(1);
    expect(m.reorder_level).toBe(12);
    expect(m.rx).toBe(13);
    expect(m.supplier).toBe(14);
    expect(m.barcode).toBe(-1); // export has none
  });

  it("auto-maps aliases like Product→name and EAN→barcode", () => {
    const m = autoMap(["Code", "Product", "EAN", "Selling Price"]);
    expect(m.sku).toBe(0);
    expect(m.name).toBe(1);
    expect(m.barcode).toBe(2);
    expect(m.price).toBe(3);
    expect(m.category).toBe(-1); // unmapped stays -1
  });
});

describe("validateAndBuild", () => {
  const cols = autoMap(["sku", "name", "category", "price", "lot_qty", "reorder_level", "rx"]);

  it("builds products from valid rows with one opening lot", () => {
    const rows = [
      ["NEW-1", "Loratadine 10mg", "pain", "12.50", "40", "15", "false"],
    ];
    const { issues, entries } = validateAndBuild(rows, cols, [], CATEGORIES);
    expect(issues).toHaveLength(0);
    expect(entries).toHaveLength(1);
    const p = entries[0].product;
    expect(p.name).toBe("Loratadine 10mg");
    expect(p.sku).toBe("NEW-1");
    expect(p.price).toBe(12.5);
    expect(p.batches[0].qty).toBe(40);
    expect(p.rx).toBe(false);
    expect(p.supplier).toBe("CSV import");
  });

  it("reports missing name, bad price, unknown category with row numbers", () => {
    const rows = [
      ["A-1", "", "pain", "5", "10", "5", "false"],       // row 2: missing name
      ["A-2", "Bad price item", "pain", "abc", "10", "5", "false"], // row 3: bad number
      ["A-3", "Ghost cat", "nosuchcat", "5", "10", "5", "false"],   // row 4: unknown category
    ];
    const { issues } = validateAndBuild(rows, cols, [], CATEGORIES);
    expect(issues).toEqual([
      { row: 2, field: "name", problem: "missing_name" },
      { row: 3, field: "price", problem: "bad_number" },
      { row: 4, field: "category", problem: "unknown_category" },
    ]);
  });

  it("flags dup sku only against catalog; in-file repeats merge silently", () => {
    const existing = makeProducts(Date.now());
    const catSku = existing[0].sku;
    const rows = [
      [catSku, "Dupe vs catalog", "pain", "5", "10", "5", "false"],  // row 2
      ["DUP-9", "First", "pain", "5", "10", "5", "false"],            // row 3 ok
      ["dup-9", "Second (case-insensitive)", "pain", "5", "10", "5", "false"], // row 4 — merges into row-3 product
    ];
    const { issues, entries } = validateAndBuild(rows, cols, existing, CATEGORIES);
    expect(issues.filter((i) => i.problem === "dup_sku").map((i) => i.row)).toEqual([2]);
    expect(entries.find((e) => e.product.sku.toLowerCase() === "dup-9")?.rows).toEqual([3, 4]);
  });

  it("merges rows sharing a sku into one product with multiple lots", () => {
    const rows = [
      ["MERGE-1", "One product", "pain", "5", "30", "5", "false"],
      ["MERGE-1", "One product", "pain", "5", "12", "5", "false"],
    ];
    const { entries, issues } = validateAndBuild(rows, cols, [], CATEGORIES);
    expect(issues).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].product.batches.map((b) => b.qty)).toEqual([30, 12]);
    expect(entries[0].rows).toEqual([2, 3]);
  });

  it("valid rows only: entries carry their own issues so filtering works", () => {
    const rows = [
      ["OK-1", "Good row", "pain", "5", "10", "5", "true"],
      ["BAD-1", "", "pain", "5", "10", "5", "false"],
    ];
    const { entries } = validateAndBuild(rows, cols, [], CATEGORIES);
    const valid = entries.filter((e) => e.issues.length === 0);
    expect(valid).toHaveLength(1);
    expect(valid[0].product.rx).toBe(true);
  });

  it("truthy rx values parse case-insensitively", () => {
    const rows = [["RX-1", "Controlled-ish", "pain", "5", "10", "5", "YES"]];
    const { entries, issues } = validateAndBuild(rows, cols, [], CATEGORIES);
    expect(issues).toHaveLength(0);
    expect(entries[0].product.rx).toBe(true);
  });
});

describe("PRODUCTS_IMPORT reducer action", () => {
  const mk = (id: string, sku: string, barcode: string): Product => ({
    id, sku, barcode, name: `Name ${id}`, generic: id, brand: "",
    category: "pain", form: "", price: 1, cost: 0.5, reorderLevel: 5,
    rx: false, supplier: "", batches: [],
  });

  it("skips duplicates by default and overwrites when asked (stable ids)", () => {
    const s0 = makeTestState({ products: [mk("p1", "SKU-A", "111")] });
    const incoming = [mk("new1", "SKU-B", "222"), mk("new2", "sku-a", ""), mk("new3", "SKU-C", "111")];

    let s1 = reducer(s0, { type: "PRODUCTS_IMPORT", products: incoming, overwrite: false });
    expect(s1.products.map((p) => p.id)).toEqual(["new1", "p1"]); // sku-a + barcode-111 dupes skipped
    expect(s1.audit[0].detail).toBe("Imported 1 products from CSV");

    s1 = reducer(s0, { type: "PRODUCTS_IMPORT", products: incoming, overwrite: true });
    const overwritten = s1.products.find((p) => p.id === "p1");
    expect(overwritten?.name).toBe("Name new3"); // last matching row wins; id kept stable
    expect(s1.audit[0].detail).toContain("Imported 3 products from CSV");
  });

  it("logs exactly one stock audit entry per import", () => {
    const s0 = makeTestState();
    const before = s0.audit.length;
    const s1 = reducer(s0, { type: "PRODUCTS_IMPORT", products: [mk("n1", "S-1", "")], overwrite: false });
    expect(s1.audit.length).toBe(before + 1);
    expect(s1.audit[0]).toMatchObject({ kind: "stock", detail: "Imported 1 products from CSV" });
  });
});
