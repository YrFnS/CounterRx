// Session auth: verify the caller's Supabase JWT against the project's anon key.
// Returns the authenticated user (and its id) or null.

import { createClient } from "@supabase/supabase-js";

export interface AuthResult {
  userId: string;
  accessToken: string;
}

export async function authenticate(request: Request): Promise<AuthResult | null> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, accessToken: token };
}
