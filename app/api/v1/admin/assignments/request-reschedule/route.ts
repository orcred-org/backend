import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { adminRequestRescheduleSchema } from "@/lib/validators/admin";
import { requestSessionReschedule } from "@/lib/scheduling/reschedule";
import { corsJson } from "@/lib/cors";

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

  const parsed = adminRequestRescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const supabase = createServiceClient();
  const { assignment_id, reason, preferred_session_at } = parsed.data;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, session_date, proposed_session_at, workflow_stage, status")
    .eq("id", assignment_id)
    .single();

  if (!assignment) {
    return corsJson(req, { success: false, error: "Assignment not found" }, 404);
  }

  const canReschedule =
    !!assignment.proposed_session_at
    || !!assignment.session_date
    || assignment.workflow_stage === "session_proposed"
    || assignment.status === "scheduled";

  if (!canReschedule) {
    return corsJson(req, { success: false, error: "No session proposal to reschedule" }, 422);
  }

  await requestSessionReschedule(supabase, {
    assignmentId: assignment_id,
    requestedBy: "admin",
    reason,
    preferredSessionAt: preferred_session_at,
  });

  return corsJson(req, { success: true });
}
