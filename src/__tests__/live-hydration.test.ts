import { describe, it, expect } from "vitest";
import { makeSettings } from "../data";
import type { BackendData } from "../lib/sync";

/* LIVE probe: runs the real loadBackendData against the production Supabase.
 * Skipped unless CRX_LIVE=1 — CI and local default runs stay offline. */
const url = process.env.VITE_SUPABASE_URL ?? "https://edxsfekxnkhhugejfoqi.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY ?? "";

describe.skipIf(!key || process.env.CRX_LIVE !== "1")("live hydration (CRX_LIVE=1)", () => {
  it("loadBackendData returns ok:true against the live tenant", async () => {
    const { supabase } = await import("../lib/supabase");
    const { loadBackendData } = await import("../lib/sync");
    const { seed } = await import("../store");
    const { error } = await supabase.auth.signInWithPassword({
      email: "s001@counterrx.local", password: "CRxS0013333",
    });
    expect(error).toBeNull();
    const base = seed();
    const fullData: BackendData = {
      ...base,
      restrictedLog: [],
      snapshots: [],
      settings: makeSettings(),
      notificationLog: [],
    };
    const result = await loadBackendData(fullData);
    if (!result.ok) console.error("FAILED TABLE:", result.failedTable);
    expect(result.ok).toBe(true);
  }, 60_000);
});
