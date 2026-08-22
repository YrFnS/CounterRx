// CORS handling restricted to the configured app origin.

export function allowedOrigin(): string {
  return Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:3000";
}

export function corsHeaders(request: Request): Headers {
  const origin = request.headers.get("origin");
  const headers = new Headers();
  // Only reflect the origin when it matches the allow-list (avoids open reflector).
  if (origin && origin === allowedOrigin()) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Vary", "Origin");
  return headers;
}

export function preflightResponse(request: Request): Response {
  return new Response("ok", { status: 204, headers: corsHeaders(request) });
}

export function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}
