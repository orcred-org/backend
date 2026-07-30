import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { waitlistUpdateSchema } from "@/lib/validators/waitlist";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return corsJson(req, { success: false, error: "Not found" }, 404);
  }

  return corsJson(req, { success: true, data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = waitlistUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    if (parsed.data.status === "invited") {
      update.invited_at = new Date().toISOString();
    }
  }
  if (parsed.data.admin_notes !== undefined) {
    update.admin_notes = parsed.data.admin_notes;
  }

  const { data, error } = await supabase
    .from("waitlist_entries")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return corsJson(req, { success: false, error: error?.message ?? "Update failed" }, 500);
  }

  return corsJson(req, { success: true, data });
}
