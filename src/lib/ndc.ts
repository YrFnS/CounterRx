import { NDC_DIRECTORY, ndcLookup, type NdcEntry } from "../data";

const CACHE_KEY = "counterrx:ndc-cache:v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const THROTTLE_MS = 200; // min gap between API calls
const TIMEOUT_MS = 5000; // openFDA request timeout
const API = "https://api.fda.gov/drug/ndc.json";

export interface NdcResult {
  name: string;
  genericName: string;
  manufacturer: string;
  route: string;
  activeIngredients: string[];
}

/** Where a non-null result came from. */
export type NdcSource = "live" | "offline" | "none";

export interface NdcLookupOutcome {
  result: NdcResult | null;
  source: NdcSource;
}

/** Strip dashes/spaces; left-pad to 10 digits (W3.8 contract: 9→10). */
export function normalizeNdc(input: string): string {
  const digits = input.replace(/[^0-9]/g, "");
  return digits.length < 10 ? digits.padStart(10, "0") : digits;
}

interface CacheValue { result: NdcResult; fetchedAt: number }

const mem = new Map<string, CacheValue>();
let lastCall = 0;

function loadCache(): Map<string, CacheValue> {
  if (mem.size) return mem;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) mem.set(k, v as CacheValue);
  } catch {
    /* corrupt / unavailable storage — in-memory only */
  }
  return mem;
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(mem)));
  } catch {
    /* quota / unavailable — memory Map is the source of truth */
  }
}

function cacheGet(key: string): NdcResult | null {
  const c = loadCache().get(key);
  if (c && Date.now() - c.fetchedAt < TTL_MS) return c.result;
  return null;
}

function cacheSet(key: string, result: NdcResult) {
  mem.set(key, { result, fetchedAt: Date.now() });
  saveCache();
}

function fromEntry(e: NdcEntry): NdcResult {
  return { name: e.name, genericName: e.generic, manufacturer: e.brand, route: "", activeIngredients: [] };
}

function throttle(): Promise<void> {
  const wait = THROTTLE_MS - (Date.now() - lastCall);
  if (wait <= 0) {
    lastCall = Date.now();
    return Promise.resolve();
  }
  return new Promise((r) => setTimeout(() => {
    lastCall = Date.now();
    r();
  }, wait));
}

async function fetchLive(normalized: string): Promise<NdcResult | null> {
  // ponytail: W3.8 query contract uses product_ndc:"<10-digit>"; real openFDA product_ndc is 9-digit
  // (xxxxx-xxxx), so live misses are expected for 5-4-2 codes — the offline directory catches them.
  const url = `${API}?search=product_ndc:%22${normalized}%22`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r) return null;
    return {
      name: r.brand_name || r.generic_name || "",
      genericName: r.generic_name || "",
      manufacturer: r.labeler_name || "",
      route: Array.isArray(r.route) ? r.route[0] : (r.route || ""),
      activeIngredients: (r.active_ingredients || []).map((a: { name: string }) => a.name),
    };
  } catch {
    return null; // network error / timeout / abort → offline fallback
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live openFDA (RxNorm) lookup → memory+localStorage cache (TTL 30d) → offline NDC_DIRECTORY.
 * Pass { live: false } to skip the network (settings.ndcLiveLookup off).
 */
export async function lookupNdc(input: string, opts?: { live?: boolean }): Promise<NdcLookupOutcome> {
  const key = normalizeNdc(input);
  if (!key) return { result: null, source: "none" };
  const cached = cacheGet(key);
  if (cached) return { result: cached, source: "live" };
  if (opts?.live !== false) {
    await throttle();
    const live = await fetchLive(key);
    if (live) {
      cacheSet(key, live);
      return { result: live, source: "live" };
    }
  }
  const hit = ndcLookup(input);
  if (hit) return { result: fromEntry(hit), source: "offline" };
  return { result: null, source: "none" };
}

/** Test seam — clears memory cache, persisted cache and throttle clock. */
export function clearNdcCache() {
  mem.clear();
  lastCall = 0;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
