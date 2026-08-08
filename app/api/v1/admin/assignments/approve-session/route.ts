import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { confirmSessionSchedule } from "@/lib/scheduling/confirm-session";
import { z } from "zod";

const approveSessionSchema = z.object({
  assignment_id: z.string().uuid(),
  confirm: z.literal(true),
});

export async function POST(req: NextRequest) {
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

  const parsed = approveSessionSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const supabase = createServiceClient();
  const { assignment_id } = parsed.data;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, proposed_session_at")
    .eq("id", assignment_id)
    .single();

  if (!assignment?.proposed_session_at) {
    return corsJson(req, { success: false, error: "No session proposed yet" }, 422);
  }

  try {
    const result = await confirmSessionSchedule(
      supabase,
      assignment_id,
      assignment.proposed_session_at,
    );
    return corsJson(req, { success: true, data: result });
  } catch (err) {
    return corsJson(req, { success: false, error: (err as Error).message }, 500);
  }
}
