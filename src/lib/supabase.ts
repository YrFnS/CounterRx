import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app has usable public Supabase configuration. */
export const isSupabaseConfigured = Boolean(url && anon);

/* Keep imports safe in local/offline builds. Sync functions no-op when this is false. */
export const supabase: SupabaseClient = createClient(
  url || "http://localhost:54321",
  anon || "missing-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true } },
);
