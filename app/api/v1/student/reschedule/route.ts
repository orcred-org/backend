import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { requestRescheduleSchema } from "@/lib/validators/student";
import { requestSessionReschedule } from "@/lib/scheduling/reschedule";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = requestRescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createServiceClient();
  const { application_id, reason, preferred_session_at } = parsed.data;

  const { data: application } = await supabase
    .from("applications")
    .select("id")
    .eq("id", application_id)
    .eq("user_id", session.id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, session_date, proposed_session_at, workflow_stage, status")
    .eq("application_id", application_id)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "No session to reschedule" }, { status: 422 });
  }

  const hasSession =
    !!assignment.session_date
    || !!assignment.proposed_session_at
    || assignment.workflow_stage === "session_proposed"
    || assignment.workflow_stage === "session_approved"
    || assignment.status === "scheduled";

  if (!hasSession) {
    return NextResponse.json({ success: false, error: "No session scheduled yet" }, { status: 422 });
  }

  await requestSessionReschedule(supabase, {
    assignmentId: assignment.id,
    requestedBy: "student",
    reason,
    preferredSessionAt: preferred_session_at,
  });

  return NextResponse.json({ success: true });
}
