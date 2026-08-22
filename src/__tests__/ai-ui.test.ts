import { describe, it, expect } from "vitest";
import {
  cartToInteractionPrompt,
  parseClassifyJson,
  buildForecastPayload,
  historyFromTransactions,
  buildAnomalySummary,
  suggestProducts,
  ocrToPrescriptionIntake,
} from "../lib/ai-ui";
import type { OcrResult } from "../lib/ai";
import { makeProducts } from "../data";

const products = makeProducts(Date.now());

describe("cartToInteractionPrompt", () => {
  it("builds a system+user pair with cart meds and allergies", () => {
    const { system, user } = cartToInteractionPrompt({
      cart: [{ productId: "ibu400", name: "Ibuprofen 400mg", generic: "ibuprofen", qty: 2 }],
      allergies: ["Aspirin / NSAID"],
      patientName: "Daniel Osei",
    });
    expect(system.toLowerCase()).toContain("second pass");
    expect(user).toContain("Patient: Daniel Osei");
    expect(user).toContain("- Aspirin / NSAID");
    expect(user).toContain("Ibuprofen 400mg (ibuprofen), qty 2, id ibu400");
    // prompt asks for machine-parseable JSON payload
    expect(user).toContain('"conflicts"');
  });

  it("handles empty cart and no allergies without crashing", () => {
    const { user } = cartToInteractionPrompt({ cart: [], allergies: [], patientName: "" });
    expect(user).toContain("(no items on the ticket)");
    expect(user).toContain("(patient has no documented allergies on file)");
    expect(user).toContain("Patient: unspecified");
  });
});

describe("parseClassifyJson", () => {
  it("parses clean JSON", () => {
    expect(parseClassifyJson('{"conflicts":[],"overall":"clean"}')).toEqual({
      conflicts: [],
      overall: "clean",
    });
  });

  it("extracts JSON embedded in prose or code fences", () => {
    const fenced = 'Here is my analysis:\n```json\n{"conflicts":[{"product_id":"x"}]}\n```';
    expect(parseClassifyJson(fenced)).toEqual({ conflicts: [{ product_id: "x" }] });
  });

  it("returns null for garbage instead of throwing", () => {
    expect(parseClassifyJson("no json here at all")).toBeNull();
    expect(parseClassifyJson("")).toBeNull();
  });
});

describe("historyFromTransactions + buildForecastPayload", () => {
  const DAY = 86_400_000;
  const now = Date.now();
  const txs = [
    { at: now - DAY, lines: [{ productId: "p1", qty: 3 }, { productId: "p2", qty: 1 }] },
    { at: now - DAY, lines: [{ productId: "p1", qty: 2 }] },
    { at: now - 40 * DAY, lines: [{ productId: "p1", qty: 99 }] }, // outside window
    { at: now - 2 * DAY, refundOf: "tx0", lines: [{ productId: "p1", qty: 5 }] }, // refund excluded
  ];

  it("aggregates daily units per product inside the window, skipping refunds", () => {
    const rows = historyFromTransactions(txs as never, 30);
    const p1 = rows.filter((r) => r.product_id === "p1");
    expect(p1).toHaveLength(1); // both same-day sales collapse into one row
    expect(p1[0].units_sold).toBe(5);
    const p2 = rows.find((r) => r.product_id === "p2")!;
    expect(p2.units_sold).toBe(1);
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.period))).toBe(true);
  });

  it("forecast payload maps to the endpoint's expected shape", () => {
    const history = historyFromTransactions(txs as never, 30);
    const payload = buildForecastPayload(
      [{ id: "p1", name: "Paracetamol 500mg", category: "pain", reorderLevel: 10, cost: 0.4 }],
      history,
    );
    expect(payload.products[0]).toEqual({
      product_id: "p1",
      product_name: "Paracetamol 500mg",
      category: "pain",
      reorder_level: 10,
      cost: 0.4,
    });
    expect(payload.history.length).toBeGreaterThan(0);
    for (const h of payload.history) {
      expect(h).toHaveProperty("product_id");
      expect(h).toHaveProperty("period");
      expect(h).toHaveProperty("units_sold");
    }
  });
});

describe("buildAnomalySummary", () => {
  it("produces the compact summary shape with snake_case keys", () => {
    const out = buildAnomalySummary({
      periodStart: 1000,
      periodEnd: 2000,
      totalSales: 500,
      totalReturns: 40,
      lowStockCount: 3,
      topProducts: [{ id: "p1", name: "X", unitsSold: 9, stock: 2, reorderLevel: 10 }],
      products: [{ id: "p1", name: "X", stock: 2, reorderLevel: 10, category: "pain" }],
      recentReturns: [{ id: "T-1", product_id: "p1", product_name: "X", qty: 2, at: 1500 }],
    }) as Record<string, unknown>;

    expect(out.total_sales).toBe(500);
    expect(out.total_returns).toBe(40);
    expect(out.low_stock_count).toBe(3);
    expect(Array.isArray(out.top_products)).toBe(true);
    expect(Array.isArray(out.recent_returns)).toBe(true);
    expect(out.period_start).toBe(1000);
  });
});

describe("suggestProducts (OCR fuzzy catalog match)", () => {
  it("ranks an exact generic/name match first", () => {
    const hits = suggestProducts("paracetamol", products);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].productId).toBe("pcm500"); // Paracetamol 500mg outranks everything
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("matches brand names and tolerates dose suffixes via token overlap", () => {
    const hits = suggestProducts("amoxicillin 875", products);
    expect(hits.some((h) => h.generic.toLowerCase().includes("amoxicillin"))).toBe(true);
  });

  it("survives OCR noise (case/punctuation) and returns [] for empty input", () => {
    expect(suggestProducts("", products)).toEqual([]);
    expect(suggestProducts("   ", products)).toEqual([]);
    const noisy = suggestProducts("  IBU-PROFEN!! ", products);
    expect(noisy.length).toBeGreaterThan(0);
  });

  it("caps suggestions at 6", () => {
    const hits = suggestProducts("a", products);
    expect(hits.length).toBeLessThanOrEqual(6);
  });
});

describe("ocrToPrescriptionIntake", () => {
  const rx: OcrResult = {
    medication: "Amoxicillin 875 mg",
    dose: "875 mg",
    sig: "Take 1 tablet by mouth twice daily",
    qty: "20",
    refills: "2",
    prescriber: "Dr. A. Mensah",
  };

  it("maps extracted fields into the NEW_PRESCRIPTION intake shape", () => {
    const intake = ocrToPrescriptionIntake(rx, "amo875", "Jane Doe");
    expect(intake.productId).toBe("amo875");
    expect(intake.patient).toBe("Jane Doe");
    expect(intake.qty).toBe(20);
    expect(intake.refillsAuthorized).toBe(2);
    expect(intake.note).toContain("twice daily");
  });

  it("falls back to defaults when OCR fields are empty/garbage", () => {
    const intake = ocrToPrescriptionIntake(
      { medication: "", dose: "", sig: "", qty: "", refills: "", prescriber: "" },
      "x",
      "P",
    );
    expect(intake.qty).toBe(30); // sane default
    expect(intake.refillsAuthorized).toBeUndefined();
  });
});
