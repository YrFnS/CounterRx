import { describe, it, expect } from "vitest";
import { findInteractions, setRuntimeInteractions, INTERACTIONS, detectDuplicateTherapy, canRefill, rxExpired, refillTooSoon, dispenseBlockers, daysUntilExpiry } from "../lib/clinical";
import type { InteractionPair, Prescription, Product } from "../data";
import { makeProducts } from "../data";

const products = makeProducts(Date.now());

describe("findInteractions", () => {
  it("detects the seed C-II + benzodiazepine pair", () => {
    const hits = findInteractions(["codsyr", "alpr05"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("major");
  });

  it("returns empty for no overlapping pair", () => {
    expect(findInteractions(["cet10", "ibu400"])).toHaveLength(0);
  });

  it("detects both directions of a pair", () => {
    expect(findInteractions(["alpr05", "codsyr"])).toHaveLength(1);
  });

  it("returns all 20 seed pairs exist", () => {
    expect(INTERACTIONS).toHaveLength(20);
    /* every pair has required fields */
    for (const pair of INTERACTIONS) {
      expect(pair.a).toBeTruthy();
      expect(pair.b).toBeTruthy();
      expect(pair.severity).toMatch(/^(major|moderate)$/);
      expect(pair.effect).toBeTruthy();
      expect(pair.action).toBeTruthy();
    }
  });

  it("runtime override replaces seed", () => {
    const custom: InteractionPair[] = [
      { a: "cet10", b: "ibu400", severity: "moderate", effect: "custom", action: "custom action" },
    ];
    setRuntimeInteractions(custom);
    expect(findInteractions(["cet10", "ibu400"])).toHaveLength(1);
    expect(findInteractions(["codsyr", "alpr05"])).toHaveLength(0); /* no longer in override */
    setRuntimeInteractions([]); /* restore fallback */
  });

  it("empty runtime override falls back to seed", () => {
    setRuntimeInteractions([]);
    expect(findInteractions(["codsyr", "alpr05"])).toHaveLength(1);
  });
});

describe("detectDuplicateTherapy", () => {
  it("flags two NSAIDs as therapeutic duplication", () => {
    const hits = detectDuplicateTherapy(["ibu400", "diclo50"], products);
    expect(hits).toHaveLength(1);
    expect(hits[0].therapeuticClass).toBe("pain");
  });

  it("does not flag distinct categories", () => {
    const hits = detectDuplicateTherapy(["asa75", "cet10"], products);
    expect(hits).toHaveLength(0);
  });

  it("ignores unknown product ids", () => {
    const hits = detectDuplicateTherapy(["nope1", "nope2"], products);
    expect(hits).toHaveLength(0);
  });
});

describe("rxExpired / daysUntilExpiry", () => {
  it("detects a past-due Rx", () => {
    const d = new Date(Date.now() - 30 * 86_400_000);
    expect(rxExpired(d.toISOString().slice(0, 10))).toBe(true);
  });

  it("detects a future Rx as not expired", () => {
    const d = new Date(Date.now() + 180 * 86_400_000);
    expect(rxExpired(d.toISOString().slice(0, 10))).toBe(false);
  });

  it("returns undefined for no expiry", () => {
    expect(rxExpired(undefined)).toBe(false);
    expect(daysUntilExpiry(undefined)).toBeUndefined();
  });

  it("computes days until expiry correctly", () => {
    const d = new Date(Date.now() + 10 * 86_400_000);
    const days = daysUntilExpiry(d.toISOString().slice(0, 10));
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(10);
  });
});

describe("refillTooSoon", () => {
  it("blocks refill within days supply window", () => {
    const rx: Prescription = {
      id: "RX-T", patient: "Test", age: 30, productId: "met500", qty: 1,
      prescriberId: "DR-01", status: "dispensed", createdAt: 0,
      daysSupply: 30, dispensedAt: Date.now() - 5 * 86_400_000, /* 5 days ago */
    };
    expect(refillTooSoon(rx)).toBe(true);
  });

  it("allows refill after days supply elapsed", () => {
    const rx: Prescription = {
      id: "RX-T", patient: "Test", age: 30, productId: "met500", qty: 1,
      prescriberId: "DR-01", status: "dispensed", createdAt: 0,
      daysSupply: 7, dispensedAt: Date.now() - 10 * 86_400_000, /* 10 days ago, 7-day supply */
    };
    expect(refillTooSoon(rx)).toBe(false);
  });

  it("allows refill when no prior dispense", () => {
    const rx: Prescription = {
      id: "RX-T", patient: "Test", age: 30, productId: "met500", qty: 1,
      prescriberId: "DR-01", status: "ready", createdAt: 0,
      daysSupply: 30, refillsRemaining: 3, rxExpiry: "2099-12-31",
    };
    expect(refillTooSoon(rx)).toBe(false);
  });
});

describe("canRefill", () => {
  it("blocks when no refills remain", () => {
    const rx: Prescription = { id: "X", patient: "P", age: 30, productId: "met500", qty: 1, prescriberId: "DR-01", status: "ready", createdAt: 0, refillsRemaining: 0, rxExpiry: "2099-12-31" };
    expect(canRefill(rx)).toBe(false);
  });

  it("allows when refills remain and not expired", () => {
    const rx: Prescription = { id: "X", patient: "P", age: 30, productId: "met500", qty: 1, prescriberId: "DR-01", status: "ready", createdAt: 0, refillsRemaining: 2, rxExpiry: "2099-12-31" };
    expect(canRefill(rx)).toBe(true);
  });
});

describe("dispenseBlockers", () => {
  it("flags expired Rx", () => {
    const rx: Prescription = { id: "X", patient: "P", age: 30, productId: "met500", qty: 1, prescriberId: "DR-01", status: "ready", createdAt: 0, rxExpiry: "2000-01-01", refillsRemaining: 3 };
    const b = dispenseBlockers(rx);
    expect(b.some((x) => x.includes("expired"))).toBe(true);
  });

  it("flags exhausted refills", () => {
    const rx: Prescription = { id: "X", patient: "P", age: 30, productId: "met500", qty: 1, prescriberId: "DR-01", status: "ready", createdAt: 0, refillsRemaining: 0 };
    const b = dispenseBlockers(rx);
    expect(b.some((x) => x.includes("refill"))).toBe(true);
  });

  it("returns empty for clear Rx", () => {
    const rx: Prescription = { id: "X", patient: "P", age: 30, productId: "met500", qty: 1, prescriberId: "DR-01", status: "ready", createdAt: 0, refillsRemaining: 3, rxExpiry: "2099-12-31" };
    const b = dispenseBlockers(rx);
    expect(b).toHaveLength(0);
  });
});
