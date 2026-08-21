// Phase G UI helpers for ai-proxy. These are PURE FUNCTIONS that build the
// payload passed to the typed client in src/lib/ai.ts. Keeping prompt
// construction in one place makes it unit-testable without a DOM.
//
// AI outputs are NEVER auto-applied: every caller surfaces results to a
// pharmacist-reviewable surface and degrades to a toast + no crash when the
// function is unreachable (not deployed / network error).

import type { Product } from "../data";

/* -------------------------------------------------------------------------- */
/* 1. Interaction-checker assist (Register) — cart → classify prompt          */
/* -------------------------------------------------------------------------- */

/** A compact cart line for the interaction-assist prompt. */
export interface CartMed {
  productId: string;
  name: string;
  generic: string;
  qty: number;
}

export interface InteractionInput {
  cart: CartMed[];
  allergies: string[];
  patientName: string;
}

/**
 * Build the (system, user) prompt pair for the LLM interaction "second pass".
 * The cart's med list + the patient's known allergies are the inputs.
 * Prompt text is assembled client-side (the function only receives the
 * final strings — it never sees raw PHI beyond what the pharmacist reviews).
 */
export function cartToInteractionPrompt(input: InteractionInput): { system: string; user: string } {
  const meds = input.cart
    .map((m) => `- ${m.name} (${m.generic || "unknown generic"}), qty ${m.qty}, id ${m.productId}`)
    .join("\n") || "(no items on the ticket)";

  const allergies =
    input.allergies.length > 0
      ? input.allergies.map((a) => `- ${a}`).join("\n")
      : "(patient has no documented allergies on file)";

  const system =
    "You are a pharmacy clinical safety assistant. You cross-check a medication " +
    "basket against a patient's documented allergies as a SECOND PASS over the " +
    "store's curated interaction database. You only surface CONFLICTS THE CURATED " +
    "CHECKER WOULD HAVE MISSED — novel or uncertain drug–allergy overlaps, rare " +
    "ingredient aliases, or cross-reactivity not covered by standard rulesets. " +
    "If the basket looks clean given the allergy list, say so explicitly and " +
    "return an empty conflicts list. Do NOT re-assert common, well-known pairs " +
    "(e.g. aspirin in an aspirin allergy) — the store checker already catches those.";

  const user =
    `Patient: ${input.patientName || "unspecified"}\n` +
    `Allergies:\n${allergies}\n\n` +
    `Basket:\n${meds}\n\n` +
    `Format: a short human-readable summary, then a JSON object:\n` +
    `{"conflicts":[{"product_id":"...","mechanism":"...","severity":"major|moderate|minor","recommendation":"..."}],"overall":"clean|caution|conflict"}`;

  return { system, user };
}

/** Extract the JSON payload from a free-text LLM classify response.
 *  Returns null on parse failure — callers degrade gracefully. */
export function parseClassifyJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
    }
    }
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Demand forecasting (Inventory) — products + history → forecast payload  */
/* -------------------------------------------------------------------------- */

export interface SalesHistoryRow {
  product_id: string;
  period: string;            // e.g. "2026-W26" or "2026-06-01"
  units_sold: number;
}

interface ProductLite {
  id: string;
  name: string;
  category: string;
  reorderLevel: number;
  cost: number;
}

/** Build the {history, products} payload for aiForecast from store state. */
export function buildForecastPayload(
  products: ProductLite[],
  history: SalesHistoryRow[],
): { products: unknown[]; history: unknown[] } {
  return {
    products: products.map((p) => ({
      product_id: p.id,
      product_name: p.name,
      category: p.category,
      reorder_level: p.reorderLevel,
      cost: p.cost,
    })),
    history: history.map((h) => ({
      product_id: h.product_id,
      period: h.period,
      units_sold: h.units_sold,
    })),
  };
}

/** Derive recent sales history (last N days, per product) from transactions.
 *  Each transaction has lines: { productId, qty, name }. Period buckets by day. */
export function historyFromTransactions(
  transactions: Array<{ at: number; refundOf?: string; lines: Array<{ productId: string; qty: number }> }>,
  days = 30,
): SalesHistoryRow[] {
  const DAY = 86_400_000;
  const now = Date.now();
  const cutoff = now - days * DAY;
  const agg = new Map<string, Map<string, number>>(); // productId → period → units
  for (const tx of transactions) {
    if (tx.refundOf || tx.at < cutoff) continue;
    const period = new Date(tx.at).toISOString().slice(0, 10);
    for (const l of tx.lines) {
      const m = agg.get(l.productId) ?? new Map();
      m.set(period, (m.get(period) ?? 0) + l.qty);
      agg.set(l.productId, m);
    }
  }
  const out: SalesHistoryRow[] = [];
  for (const [pid, periods] of agg) {
    for (const [period, units] of periods) {
      out.push({ product_id: pid, period, units_sold: units });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 3. Anomaly detection (Dashboard) — sales/returns/inventory → summary       */
/* -------------------------------------------------------------------------- */

export interface AnomalySummary {
  periodStart: number;
  periodEnd: number;
  totalSales: number;
  totalReturns: number;
  topProducts: Array<{ id: string; name: string; unitsSold: number; stock: number; reorderLevel: number }>;
  lowStockCount: number;
  products: Array<{ id: string; name: string; stock: number; reorderLevel: number; category: string }>;
  recentReturns: Array<{ id: string; product_id: string; product_name: string; qty: number; at: number }>;
}

/** Build a compact anomaly summary the LLM can scan for unusual patterns. */
export function buildAnomalySummary(summary: AnomalySummary): unknown {
  return {
    period_start: summary.periodStart,
    period_end: summary.periodEnd,
    total_sales: summary.totalSales,
    total_returns: summary.totalReturns,
    low_stock_count: summary.lowStockCount,
    top_products: summary.topProducts,
    products: summary.products,
    recent_returns: summary.recentReturns,
  };
}

/* -------------------------------------------------------------------------- */
/* 4. OCR intake (Prescriptions) — fuzzy match extracted med → catalog        */
/* -------------------------------------------------------------------------- */

import type { OcrResult } from "./ai";

/** Lowercase, collapsed non-alphanumerics for fuzzy drug-name matching. */
function normDrug(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Fuzzy substring match: every query token appears in target in order. */
function fuzzyDrugMatch(query: string, target: string): boolean {
  const q = normDrug(query);
  const t = normDrug(target);
  if (!q) return true; // empty query matches anything
  let i = 0;
  for (const ch of q) {
    const nxt = t.indexOf(ch, i);
    if (nxt === -1) return false;
    i = nxt + 1;
  }
  return true;
}

export interface CatalogSuggestion {
  productId: string;
  name: string;
  generic: string;
  score: number;
}

/** Match an OCR-extracted medication string against the product catalog.
 *  Returns ranked suggestions (best first); empty array if nothing resembles. */
export function suggestProducts(medication: string, catalog: Product[]): CatalogSuggestion[] {
  const q = (medication || "").toLowerCase().trim();
  if (!q) return [];
  return catalog
    .map((p) => {
      const hay = `${p.generic} ${p.brand} ${p.name}`;
      let score = 0;
      // exact generic/brand match
      if (p.generic.toLowerCase() === q) score += 100;
      if (p.brand.toLowerCase() === q) score += 80;
      if (p.name.toLowerCase() === q) score += 60;
      // substring / fuzzy
      if (hay.toLowerCase().includes(q)) score += 40;
      if (fuzzyDrugMatch(q, hay)) score += 15;
      // token overlap (handles "amoxicillin 875" vs "amoxicillin")
      const qTokens = q.split(/[\s\/]+/).filter(Boolean);
      const hayTokens = hay.toLowerCase().split(/[\s\/]+/).filter(Boolean);
      const overlap = qTokens.filter((t) => t.length > 2 && hayTokens.includes(t)).length;
      score += overlap * 10;
      return { productId: p.id, name: p.name, generic: p.generic, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

/** Map an OcrResult + a matched product into the intake payload the store
 *  reducer's NEW_PRESCRIPTION expects. Pure — no dispatch. */
export function ocrToPrescriptionIntake(rx: OcrResult, productId: string, patient: string): {
  patient: string; age: number; productId: string; qty: number; prescriberId: string;
  daysSupply?: number; refillsAuthorized?: number; note?: string;
} {
  const qtyNum = parseInt((rx.qty || "").replace(/[^0-9]/g, ""), 10) || 30;
  const refillsNum = parseInt((rx.refills || "").replace(/[^0-9]/g, ""), 10);
  const parsed: Record<string, string> = {};
  (rx.sig || "").split(/\s+/).forEach((tok) => {
    const m = tok.match(/^(\d+)(x|×|\/)(\d+)$/);
    if (m) parsed["ratio"] = `${m[1]}:${m[3]}`;
  });
  return {
    patient,
    age: 0, // unknown from OCR — pharmacist fills in
    productId,
    qty: qtyNum,
    prescriberId: "", // pharmacist selects from directory
    daysSupply: parsed["ratio"] ? qtyNum * 30 : 30,
    refillsAuthorized: Number.isNaN(refillsNum) ? undefined : refillsNum,
    note: rx.sig || undefined,
  };
}
