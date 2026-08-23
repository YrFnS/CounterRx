import { describe, it, expect, beforeEach, vi } from "vitest";
import { lookupNdc, normalizeNdc, clearNdcCache, type NdcResult } from "../lib/ndc";

/* node env has no localStorage / fetch — provide minimal stubs */
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
// @ts-expect-error assign test double
globalThis.localStorage = localStorageMock;

const LIVE: NdcResult = {
  name: "Amoxicillin 500mg", genericName: "Amoxicillin trihydrate", manufacturer: "Testa Pharma",
  route: "ORAL", activeIngredients: ["AMOXICILLIN"],
};

function mockFetch(body: unknown, { ok = true, delay = 0 } = {}) {
  const spy = vi.fn(async () => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return { ok, json: async () => body };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  clearNdcCache();
  store.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeNdc", () => {
  it("strips dashes and spaces", () => {
    expect(normalizeNdc("50111-0362-01")).toBe("50111036201");
    expect(normalizeNdc("50 111 0362 01")).toBe("50111036201");
  });
  it("pads a 9-digit code to 10 (W3.8 contract)", () => {
    expect(normalizeNdc("00093-0058")).toBe("0000930058");
  });
  it("leaves a 10-digit code as-is", () => {
    expect(normalizeNdc("0009300580")).toBe("0009300580");
  });
});

describe("lookupNdc cache", () => {
  it("returns a cached live result without calling fetch", async () => {
    mockFetch({ results: [{ brand_name: LIVE.name, generic_name: LIVE.genericName, labeler_name: LIVE.manufacturer, route: ["ORAL"], active_ingredients: [{ name: "AMOXICILLIN" }] }] });
    const first = await lookupNdc("00093-0058", { live: true });
    expect(first.source).toBe("live");

    vi.unstubAllGlobals(); // drop fetch — cached hit must not need it
    const second = await lookupNdc("00093-0058", { live: true });
    expect(second.source).toBe("live");
    expect(second.result?.name).toBe(LIVE.name);
  });

  it("cache TTL miss after 30 days → refetches", async () => {
    mockFetch({ results: [{ brand_name: LIVE.name }] });
    await lookupNdc("00093-0058", { live: true });
    // expire the in-memory cache entry directly via localStorage tamper
    const raw = JSON.parse(store.get("counterrx:ndc-cache:v1")!);
    const key = Object.keys(raw)[0];
    raw[key].fetchedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
    store.set("counterrx:ndc-cache:v1", JSON.stringify(raw));
    clearNdcCache(); // force reload from the (expired) persisted cache

    const fetchSpy = mockFetch({ results: [{ brand_name: "Refetched", generic_name: "X", labeler_name: "Y", route: ["ORAL"], active_ingredients: [] }] });
    const out = await lookupNdc("00093-0058", { live: true });
    expect(fetchSpy).toHaveBeenCalled();
    expect(out.result?.name).toBe("Refetched");
  });
});

describe("lookupNdc fallback", () => {
  it("falls back to NDC_DIRECTORY when fetch fails (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const out = await lookupNdc("50111-0362-01", { live: true });
    expect(out.source).toBe("offline");
    expect(out.result?.name).toBe("Levothyroxine 50mcg");
  });

  it("falls back to local directory on empty API results", async () => {
    mockFetch({ results: [] });
    const out = await lookupNdc("00173-0682-20", { live: true });
    expect(out.source).toBe("offline");
    expect(out.result?.genericName).toBe("Fluticasone + salmeterol");
  });

  it("returns none when nothing matches online or offline", async () => {
    mockFetch({ results: [] });
    const out = await lookupNdc("99999-9999-99", { live: true });
    expect(out.source).toBe("none");
    expect(out.result).toBeNull();
  });

  it("skips network when live:false and uses offline directory", async () => {
    const out = await lookupNdc("00078-0532-19", { live: false });
    expect(out.source).toBe("offline");
    expect(out.result?.name).toBe("Valsartan 80mg");
  });
});

describe("lookupNdc throttle", () => {
  it("spaces API calls by at least ~200ms", async () => {
    mockFetch({ results: [{ brand_name: "X", generic_name: "g", labeler_name: "m", route: ["ORAL"], active_ingredients: [] }] });
    const start = Date.now();
    await lookupNdc("00093-0058", { live: true });
    await lookupNdc("00078-0532-19", { live: true }); // distinct key → live miss → second call
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180); // allow small timer slack
  });
});
