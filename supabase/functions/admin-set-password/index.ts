// CounterRx admin-set-password edge function.
// Verifies caller is admin (super_admin or pharmacy_admin) via staff table,
// then calls Supabase auth admin API updateUserById to set new password for target user by email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore-file require-await

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ReqBody {
  staffEmail: string;
  newPassword: string;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: "Server not configured" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } =
    await supabaseAdmin.auth.getUser(token);
  if (callerError || !callerData.user) {
    return json({ error: "Invalid caller token" }, 401);
  }

  const callerEmail = callerData.user.email?.toLowerCase();
  if (!callerEmail) {
    return json({ error: "Caller has no email" }, 403);
  }

  const callerCompact = callerEmail.split("@")[0];
  const callerStaffId = /^s\d{3}$/i.test(callerCompact)
    ? `S-${callerCompact.slice(1).toUpperCase()}`
    : null;
  if (!callerStaffId) {
    return json({ error: "Caller not a seeded staff account" }, 403);
  }

  const { data: callerStaff, error: staffError } = await supabaseAdmin
    .from("staff")
    .select("id, role, active")
    .eq("id", callerStaffId)
    .single();

  if (staffError || !callerStaff || !callerStaff.active) {
    return json({ error: "Caller not found or inactive" }, 403);
  }

  const adminRoles = ["super_admin", "pharmacy_admin"];
  if (!adminRoles.includes(callerStaff.role)) {
    return json({ error: "Caller lacks admin privileges" }, 403);
  }

  let body: ReqBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { staffEmail, newPassword } = body;
  if (!staffEmail || !newPassword) {
    return json({ error: "staffEmail and newPassword are required" }, 400);
  }
  if (newPassword.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }

  const targetEmail = staffEmail.trim().toLowerCase();
  const { data: targetUsers, error: listError } =
    await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    return json({ error: "Failed to list users" }, 500);
  }

  const targetUser = targetUsers.users.find(
    (u) => u.email?.toLowerCase() === targetEmail,
  );
  if (!targetUser) {
    return json({ error: "Target user not found" }, 404);
  }
  if (!/^s\d{3}@counterrx\.local$/i.test(targetEmail)) {
    return json({ error: "Target must be a seeded staff account" }, 400);
  }

  const { error: updateError } = await supabaseAdmin.auth.admin
    .updateUserById(targetUser.id, { password: newPassword });
  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({ success: true, message: "Password updated successfully" }, 200);
});