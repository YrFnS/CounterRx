// CounterRx ai-proxy edge function (Phase G). The ONLY caller of OpenRouter.
// Endpoints: /ocr, /classify, /forecast, /anomaly. Session-auth-gated, CORS
// locked to the app origin, and every call is written to ai_log (prompt hash +
// truncated input + output summary + latency + status). Output is returned for
// human review and is never auto-applied.

import { authenticate } from "./_shared/auth.ts";
import { corsHeaders, preflightResponse, json } from "./_shared/cors.ts";
import {
  openrouterChat,
  VISION_MODEL,
  TEXT_MODEL,
  FORECAST_MODEL,
  type ChatMessage,
} from "./_shared/openrouter.ts";
import { writeAiLog, sha256Hex, truncate } from "./_shared/ai-log.ts";

interface ReqBody {
  [k: string]: unknown;
}

function extractPayload(body: ReqBody): string {
  // Stable hash input of the request (PHI never persisted).
  return JSON.stringify(body);
}

async function handle(
  endpoint: string,
  body: ReqBody,
  authUserId: string | null,
  accessToken: string,
  request: Request,
  promptHash: string,
): Promise<{ resp: Response; model: string; summary: unknown }> {
  const started = performance.now();

  try {
    let model: string;
    let messages: ChatMessage[];
    let outputSummary: unknown;

    if (endpoint === "/ocr") {
      model = VISION_MODEL;
      const image = typeof body.image === "string" ? body.image : "";
      const hint = typeof body.hint === "string" ? body.hint : "";
      if (!image) {
        return {
          resp: json({ error: "image (base64 data URL or URL) is required" }, 400, request),
          model,
          summary: null,
        };
      }
      const hintLine = hint ? `\n\nAdditional context from the pharmacist: ${hint}` : "";
      messages = [
        {
          role: "system",
          content:
            "You are a pharmacy prescription OCR assistant. Extract structured fields from the prescription image. " +
            "Respond ONLY with a JSON object: {medication, dose, sig, qty, refills, prescriber}. " +
            "Use empty strings for missing fields. 'sig' is the directions (e.g. 'Take 1 tablet by mouth once daily'). " +
            "'qty' and 'refills' are numbers as strings or empty string if unknown.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the prescription." + hintLine },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ];
      const parsed = safeJson(await openrouterChat(messages, { model, responseFormatJson: true }));
      outputSummary = parsed;
      return { resp: json(parsed, 200, request), model, summary: outputSummary };
    }

    if (endpoint === "/classify") {
      model = TEXT_MODEL;
      const system = typeof body.system === "string" ? body.system : "You are a helpful assistant.";
      const user = typeof body.user === "string" ? body.user : "";
      if (!user) {
        return { resp: json({ error: "user text is required" }, 400, request), model, summary: null };
      }
      messages = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      const text = await openrouterChat(messages, { model });
      outputSummary = { text: truncate(text, 1000) };
      return { resp: json({ text }, 200, request), model, summary: outputSummary };
    }

    if (endpoint === "/forecast") {
      model = FORECAST_MODEL;
      const history = body.history;
      const products = body.products;
      if (!Array.isArray(history) || !Array.isArray(products)) {
        return {
          resp: json({ error: "history and products arrays are required" }, 400, request),
          model,
          summary: null,
        };
      }
      messages = [
        {
          role: "system",
          content:
            "You are a pharmacy demand forecaster. Given sales history and a product list, " +
            "estimate each product's next-period demand and suggest a reorder quantity. " +
            "Respond ONLY with a JSON array of objects: {product_id, product_name, predicted_demand, suggested_reorder_qty, note}.",
        },
        {
          role: "user",
          content: `Products: ${JSON.stringify(products)}\n\nSales history (rows of {product_id, period, units_sold}): ${JSON.stringify(history)}`,
        },
      ];
      const parsed = safeJson(await openrouterChat(messages, { model, responseFormatJson: true }));
      outputSummary = { count: Array.isArray(parsed) ? parsed.length : 0 };
      return { resp: json(parsed, 200, request), model, summary: outputSummary };
    }

    if (endpoint === "/anomaly") {
      model = TEXT_MODEL;
      const summary = body.summary;
      if (!summary) {
        return { resp: json({ error: "summary is required" }, 400, request), model, summary: null };
      }
      messages = [
        {
          role: "system",
          content:
            "You are a pharmacy anomaly detector. Given a summary of sales, returns, and catalog, " +
            "flag unusual patterns. Respond ONLY with a JSON array of objects: " +
            "{type, entity, reason, severity}. type is one of: unusual_returns, dead_stock, stock_sales_divergence, other.",
        },
        { role: "user", content: typeof summary === "string" ? summary : JSON.stringify(summary) },
      ];
      const parsed = safeJson(await openrouterChat(messages, { model, responseFormatJson: true }));
      outputSummary = { count: Array.isArray(parsed) ? parsed.length : 0 };
      return { resp: json(parsed, 200, request), model, summary: outputSummary };
    }

    return { resp: json({ error: `Unknown endpoint: ${endpoint}` }, 404, request), model: "unknown", summary: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const message = err instanceof Error ? err.message : "unknown error";
    await writeAiLog({
      userId: authUserId,
      accessToken: accessToken,
      endpoint,
      model: "unknown",
      promptHash,
      inputTruncated: truncate(extractPayload(body)),
      outputSummary: { error: message },
      latencyMs,
      status: "error",
    });
    // Structured error, never a raw 500 stack trace.
    return { resp: json({ error: message, endpoint }, 502, request), model: "unknown", summary: { error: message } };
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some models wrap JSON in code fences; strip them.
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Model did not return valid JSON");
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  const url = new URL(request.url);
  const endpoint = url.pathname.replace(/\/functions\/v1\/ai-proxy/, "") || "/";
  const known = ["/ocr", "/classify", "/forecast", "/anomaly"];
  if (!known.includes(endpoint)) {
    return json({ error: `Unknown endpoint: ${endpoint}` }, 404, request);
  }

  const auth = await authenticate(request);
  if (!auth) {
    return json({ error: "Unauthorized" }, 401, request);
  }

  let body: ReqBody = {};
  try {
    body = await request.json();
    if (typeof body !== "object" || body === null) body = {};
  } catch {
    return json({ error: "Invalid JSON body" }, 400, request);
  }

  const started = performance.now();
  const promptHash = await sha256Hex(JSON.stringify(body));
  const { resp, model, summary } = await handle(endpoint, body, auth.userId, auth.accessToken, request, promptHash);
  const latencyMs = Math.round(performance.now() - started);
  const status = resp.status >= 200 && resp.status < 300 ? "ok" : "error";

  await writeAiLog({
    userId: auth.userId,
    accessToken: auth.accessToken,
    endpoint,
    model,
    promptHash,
    inputTruncated: truncate(JSON.stringify(body)),
    outputSummary: summary ?? null,
    latencyMs,
    status,
  });

  // Re-attach CORS (handle() already set them; re-applied for safety on passthrough).
  return new Response(resp.body, {
    status: resp.status,
    headers: { ...corsHeaders(request), ...Object.fromEntries(resp.headers) },
  });
});
