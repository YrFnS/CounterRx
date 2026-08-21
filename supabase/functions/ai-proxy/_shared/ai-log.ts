// Append-only audit writer for ai_log. Inserts as the calling user (using their
// access token) so organization_id resolves through current_org_id() and the RLS
// insert policy is satisfied. Never stores the full prompt or full output — only
// a hash, a truncated input, and a summary.

import { createClient } from "@supabase/supabase-js";

export interface AiLogInput {
  userId: string | null;
  accessToken: string;
  endpoint: string;
  model: string;
  promptHash: string;
  inputTruncated: string | null;
  outputSummary: unknown;
  latencyMs: number;
  status: string;
}

export async function writeAiLog(entry: AiLogInput): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !entry.accessToken) {
    return; // logging must never break the request
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  supabase.auth.setSession({ access_token: entry.accessToken, refresh_token: entry.accessToken });

  const row = {
    user_id: entry.userId,
    endpoint: entry.endpoint,
    model: entry.model,
    prompt_hash: entry.promptHash,
    input_truncated: entry.inputTruncated,
    output_summary: entry.outputSummary,
    latency_ms: entry.latencyMs,
    status: entry.status,
  };

  // Best-effort: do not throw on failure.
  try {
    await supabase.from("ai_log").insert(row);
  } catch {
    // swallow — logging must never break the request
  }
}

export function sha256Hex(text: string): Promise<string> {
  // ponytail: stdlib SubtleCrypto, no deps.
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data).then((buf) => {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
}

export function truncate(text: string | null | undefined, max = 500): string | null {
  if (!text) return null;
  return text.length > max ? text.slice(0, max) + "…" : text;
}
