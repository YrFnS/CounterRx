// Typed client for the CounterRx ai-proxy Supabase edge function (Phase G).
// The browser never sees an OpenRouter key — it only forwards the user's
// Supabase session token to the function, which holds the key server-side.

import { supabase } from "./supabase.ts";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";

function fnUrl(endpoint: string): string {
  return `${SUPABASE_URL}/functions/v1/ai-proxy/${endpoint}`;
}

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(fnUrl(endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(json?.error || `ai-proxy ${endpoint} failed (${res.status})`);
  }
  return json as T;
}

export interface OcrResult {
  medication: string;
  dose: string;
  sig: string;
  qty: string;
  refills: string;
  prescriber: string;
}

/** Rx OCR: image (base64 data URL or URL) + optional hint → structured JSON. */
export function aiOcr(image: string, hint?: string): Promise<OcrResult> {
  return post<OcrResult>("ocr", { image, hint: hint ?? "" });
}

/** Generic LLM pass (used later by interaction-assist). */
export function aiClassify(system: string, user: string): Promise<{ text: string }> {
  return post<{ text: string }>("classify", { system, user });
}

export interface ForecastRow {
  product_id: string | number;
  product_name?: string;
  predicted_demand: number;
  suggested_reorder_qty: number;
  note?: string;
}

/** Demand forecast + reorder suggestions from sales history + product list. */
export function aiForecast(history: unknown[], products: unknown[]): Promise<ForecastRow[]> {
  return post<ForecastRow[]>("forecast", { history, products });
}

export interface Anomaly {
  type: "unusual_returns" | "dead_stock" | "stock_sales_divergence" | "other";
  entity: string;
  reason: string;
  severity?: string;
}

/** Anomaly detection over a sales/returns/catalog summary. */
export function aiAnomaly(summary: unknown): Promise<Anomaly[]> {
  return post<Anomaly[]>("anomaly", { summary });
}
