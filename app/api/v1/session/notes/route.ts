import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";
import { sessionNotesSchema } from "@/lib/validators/session";
import { participantRoleError, resolveParticipantRole } from "@/lib/session/participant-role";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = sessionNotesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const requestedAs = req.nextUrl.searchParams.get("as");
  const roleHint =
    requestedAs === "reviewer" || requestedAs === "student" ? requestedAs : null;

  const supabase = createServiceClient();
  const { assignment_id, notes } = parsed.data;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, reviewer_id, session_completed_at, workflow_stage, applications:application_id (user_id)")
    .eq("id", assignment_id)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
  }

  const app = Array.isArray(assignment.applications)
    ? assignment.applications[0]
    : assignment.applications;

  const notesRole = resolveParticipantRole(
    session,
    { reviewer_id: assignment.reviewer_id },
    app?.user_id,
    roleHint,
  );

  if (!notesRole) {
    return NextResponse.json(
      { success: false, error: participantRoleError(roleHint) },
      { status: 403 },
    );
  }

  const sessionDone =
    !!assignment.session_completed_at
    || assignment.workflow_stage === "session_done"
    || ["score_submitted", "score_approved", "completed"].includes(assignment.workflow_stage ?? "");

  if (sessionDone) {
    return NextResponse.json(
      { success: false, error: "Session notes are locked after the call ends." },
      { status: 422 },
    );
  }

  const column = notesRole === "reviewer" ? "reviewer_session_notes" : "student_session_notes";

  const { error } = await supabase
    .from("reviewer_assignments")
    .update({ [column]: notes })
    .eq("id", assignment_id);

  if (error) {
    return NextResponse.json({ success: false, error: "Could not save notes" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
