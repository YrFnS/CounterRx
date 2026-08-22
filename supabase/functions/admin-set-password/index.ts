// CounterRx admin-set-password edge function (R2).
// Server-side: verifies caller is admin (super_admin or pharmacy_admin) via staff table,
// then calls Supabase auth admin API updateUserById to set new password for target user by email.
// Emails are s00X@counterrx.local per supabase/seed.sql.

import { createClient } from "@supabase/supabase-js";
import { corsHeaders, preflightResponse, json } from "./_shared/cors.ts";

interface ReqBody {
  staffEmail: string;
  newPassword: string;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, request);
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Unauthorized" }, 401, request);
  }

  // Supabase admin client with service role key
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: "Server not configured" }, 500, request);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify caller's JWT and get their user ID
  const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
  if (callerError || !callerData.user) {
    return json({ error: "Invalid caller token" }, 401, request);
  }
  const callerId = callerData.user.id;

  // Check if caller is admin by looking up their email in the staff table
  const callerEmail = callerData.user.email?.toLowerCase();
  if (!callerEmail) {
    return json({ error: "Caller has no email" }, 403, request);
  }

  // Map email to local staff id format (s001@... -> S-001)
  const callerCompact = callerEmail.split("@")[0];
  const callerStaffId = /^s\d{3}$/i.test(callerCompact) ? `S-${callerCompact.slice(1).toUpperCase()}` : null;
  if (!callerStaffId) {
    return json({ error: "Caller not a seeded staff account" }, 403, request);
  }

  // Look up caller in staff table using service role (bypasses RLS)
  const { data: callerStaff, error: staffError } = await supabaseAdmin
    .from("staff")
    .select("id, role, active")
    .eq("id", callerStaffId)
    .single();

  if (staffError || !callerStaff || !callerStaff.active) {
    return json({ error: "Caller not found or inactive" }, 403, request);
  }

  // Verify admin role
  const adminRoles = ["super_admin", "pharmacy_admin"];
  if (!adminRoles.includes(callerStaff.role)) {
    return json({ error: "Caller lacks admin privileges" }, 403, request);
  }

  // Parse request body
  let body: ReqBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, request);
  }

  const { staffEmail, newPassword } = body;
  if (!staffEmail || !newPassword) {
    return json({ error: "staffEmail and newPassword are required" }, 400, request);
  }

  // Validate password strength (minimum 8 chars)
  if (newPassword.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400, request);
  }

  // Look up target user by email
  const targetEmail = staffEmail.trim().toLowerCase();
  const { data: targetUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    return json({ error: "Failed to list users" }, 500, request);
  }

  const targetUser = targetUsers.users.find((u) => u.email?.toLowerCase() === targetEmail);
  if (!targetUser) {
    return json({ error: "Target user not found" }, 404, request);
  }

  // Verify target is a seeded staff account (s00X@counterrx.local)
  if (!/^s\d{3}@counterrx\.local$/i.test(targetEmail)) {
    return json({ error: "Target must be a seeded staff account" }, 400, request);
  }

  // Update user's password using admin API
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUser.id,
    { password: newPassword }
  );

  if (updateError) {
    return json({ error: updateError.message }, 500, request);
  }

  return json({ success: true, message: "Password updated successfully" }, 200, request);
});