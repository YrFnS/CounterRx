// Minimal OpenRouter chat-completions client. The ONLY place the key is used.
// The key is read server-side from Deno.env and is never logged or returned.

export const VISION_MODEL = "google/gemini-2.0-flash-001";
export const TEXT_MODEL = "google/gemini-2.0-flash-001";
export const FORECAST_MODEL = "google/gemini-2.0-flash-001";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: unknown; // string for text, or multimodal content parts
}

export interface ChatOptions {
  model?: string;
  responseFormatJson?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function openrouterChat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    model: opts.model || TEXT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (opts.responseFormatJson) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://counterrx.app",
      "X-Title": "CounterRx",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter returned no content");
  }
  return content;
}
