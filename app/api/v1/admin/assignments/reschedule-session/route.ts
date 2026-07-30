import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { adminRescheduleSessionSchema } from "@/lib/validators/admin";
import { confirmSessionSchedule } from "@/lib/scheduling/confirm-session";
import { corsJson } from "@/lib/cors";

const SESSION_DONE_STAGES = new Set([
  "session_done",
  "score_submitted",
  "score_approved",
  "completed",
]);

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

  const parsed = adminRescheduleSessionSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const { assignment_id, new_session_at, note } = parsed.data;
  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, session_date, proposed_session_at, workflow_stage, status, session_completed_at")
    .eq("id", assignment_id)
    .single();

  if (!assignment) {
    return corsJson(req, { success: false, error: "Assignment not found" }, 404);
  }

  if (assignment.session_completed_at || SESSION_DONE_STAGES.has(assignment.workflow_stage ?? "")) {
    return corsJson(req, { success: false, error: "Session is already marked done — cannot reschedule" }, 422);
  }

  const hasSession =
    !!assignment.session_date
    || !!assignment.proposed_session_at
    || assignment.status === "scheduled"
    || assignment.workflow_stage === "session_proposed"
    || assignment.workflow_stage === "session_approved";

  if (!hasSession) {
    return corsJson(req, { success: false, error: "No session to reschedule yet" }, 422);
  }

  try {
    const result = await confirmSessionSchedule(supabase, assignment_id, new_session_at, {
      isReschedule: true,
      adminNote: note,
    });
    return corsJson(req, { success: true, data: result });
  } catch (err) {
    console.error("[admin/reschedule-session]", (err as Error).message);
    return corsJson(req, { success: false, error: (err as Error).message }, 500);
  }
}
