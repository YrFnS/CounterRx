import type { OrgSettings } from "../data";
import { isSupabaseConfigured, supabase } from "./supabase";

/* W3.1 — provider-agnostic notification sender.
 *
 * DROP-IN ADAPTER POINT: to wire a real provider (Resend for email, Twilio for
 * SMS), add a `NotifyProvider` that POSTs through Supabase Edge Functions (keys
 * stay server-side), register it here under a channel name, and flip
 * `settings.notifications.channel` — no trigger/UI changes needed.
 */

/** One outbound message. `template` is an OrgSettings.notifications.templates key,
 *  `vars` the interpolation values rendered by the caller. */
export interface NotifyMessage {
  to: string;
  template: string;
  vars: Record<string, string | number>;
}

export interface NotifyProvider {
  /** Channel identifier persisted on every notification_log row ("console" until a real provider lands). */
  readonly channel: string;
  send(msg: NotifyMessage): Promise<{ ok: boolean; error?: string }>;
}

/** One row of the auditable notification_log table (hydrated for the Settings readout). */
export interface NotificationLogEntry {
  id: string;
  recipient: string;
  channel: string;
  template: string;
  payload: Record<string, unknown>;
  status: string;
  at: number;
}

/** Stub backend: logs to the console, reports success. Default until Resend/Twilio. */
export const consoleNotifier: NotifyProvider = {
  channel: "console",
  async send(msg) {
    console.info(`[notify:${msg.template}] → ${msg.to}`, msg.vars);
    return { ok: true };
  },
};

const PROVIDERS: Record<string, NotifyProvider> = {
  console: consoleNotifier,
};

/** Resolve the org's configured provider; falls back to the console stub when unset or unknown. */
export function notifierFor(settings: Pick<OrgSettings, "notifications">): NotifyProvider {
  return PROVIDERS[settings.notifications?.channel ?? "console"] ?? consoleNotifier;
}

export type NotificationKind = keyof OrgSettings["notifications"]["templates"];

/** Replace {{var}} placeholders in a template string. Unknown vars render as "". */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}

/** Send one notification: respects the per-trigger enable toggle, renders through
 *  the configured provider, and appends an auditable notification_log row. */
export async function sendNotification(
  settings: OrgSettings,
  kind: NotificationKind,
  msg: NotifyMessage,
): Promise<boolean> {
  if (!settings.notifications?.enabled[kind]) return false;
  const provider = notifierFor(settings);
  const result = await provider.send(msg).catch((error: unknown): { ok: boolean; error?: string } => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  try {
    if (!isSupabaseConfigured) throw new Error("supabase not configured");
    const { error } = await supabase.from("notification_log").insert({
      recipient: msg.to,
      channel: provider.channel,
      template: msg.template,
      payload: result.ok ? msg.vars : { ...msg.vars, error: result.error ?? "unknown" },
      status: result.ok ? "sent" : "failed",
    });
    if (error) throw new Error(error.message);
  } catch {
    // Log persistence is best-effort — never block the send path (ponytail: no retry queue).
  }
  return result.ok;
}
