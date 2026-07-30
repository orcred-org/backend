import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { sessionJoinSchema } from "@/lib/validators/session";
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

  const parsed = sessionJoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const requestedAs = req.nextUrl.searchParams.get("as");
  const roleHint =
    requestedAs === "reviewer" || requestedAs === "student" ? requestedAs : null;

  const supabase = createServiceClient();
  const { assignment_id } = parsed.data;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, reviewer_id, session_date, session_completed_at, workflow_stage,
      reviewer_joined_at, student_joined_at,
      applications:application_id (user_id)
    `)
    .eq("id", assignment_id)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
  }

  const app = Array.isArray(assignment.applications)
    ? assignment.applications[0]
    : assignment.applications;

  const joinRole = resolveParticipantRole(
    session,
    { reviewer_id: assignment.reviewer_id },
    app?.user_id,
    roleHint,
  );

  if (!joinRole) {
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
    return NextResponse.json({ success: false, error: "Session already ended" }, { status: 422 });
  }

  const column = joinRole === "reviewer" ? "reviewer_joined_at" : "student_joined_at";
  const existing = assignment[column as "reviewer_joined_at" | "student_joined_at"];

  if (existing) {
    return NextResponse.json({ success: true, data: { joined_at: existing, first_join: false } });
  }

  const joinedAt = new Date().toISOString();
  const { error } = await supabase
    .from("reviewer_assignments")
    .update({ [column]: joinedAt })
    .eq("id", assignment_id);

  if (error) {
    return NextResponse.json({ success: false, error: "Could not record join time" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { joined_at: joinedAt, first_join: true } });
}
