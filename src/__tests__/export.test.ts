import { describe, it, expect } from "vitest";
import * as X from "xlsx";
import { buildXlsx } from "../lib/export";

describe("buildXlsx", () => {
  it("returns a non-empty Uint8Array for sample rows", () => {
    const buf = buildXlsx(
      [
        { product: "Ibuprofen 200mg", batch: "L-001", qty: 50, value: 4.25 },
        { product: "Amoxicillin 500mg", batch: "L-002", qty: 30, value: 5.1 },
      ],
      "inventory-valuation.xlsx"
    );
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(0);
    /* xlsx files are zip archives — check the PK magic bytes */
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]);
  });

  it("respects column order from the first row's key order", () => {
    const buf = buildXlsx([{ z: 1, a: 2, m: 3 }, { z: 4, a: 5, m: 6 }], "order.xlsx", "Ordered");
    const wb = X.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(wb.SheetNames[0]).toBe("Ordered");
    /* header row must be z, a, m — not alphabetised */
    expect([ws["A1"].v, ws["B1"].v, ws["C1"].v]).toEqual(["z", "a", "m"]);
    expect([ws["A2"].v, ws["B2"].v, ws["C2"].v]).toEqual([1, 2, 3]);
  });
});
