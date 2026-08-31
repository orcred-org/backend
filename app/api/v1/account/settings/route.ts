import { NextRequest } from "next/server";
import { corsJson } from "@/lib/cors";
import { getSessionWithRole } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { updateAccountSettingsSchema } from "@/lib/validators/account";

export async function GET(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, account_type, created_at")
    .eq("id", session.id)
    .single();

  if (error || !data) {
    return corsJson(req, { success: false, error: "Profile not found" }, 404);
  }

  return corsJson(req, { success: true, data });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = updateAccountSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .update({ full_name: parsed.data.full_name })
    .eq("id", session.id)
    .select("id, email, full_name, account_type, created_at")
    .single();

  if (error) {
    return corsJson(req, { success: false, error: "Update failed" }, 500);
  }

  return corsJson(req, { success: true, data });
}
