import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { studentSessionConfirmSchema } from "@/lib/validators/session";
import { isDevFullAccess } from "@/lib/auth/devAccess";
import { requiresEarlyEndReason } from "@/lib/session/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student") && !isDevFullAccess(session?.email)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = studentSessionConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createServiceClient();
  const { assignment_id, feedback_audio, feedback_video, feedback_notes, early_end_reason } = parsed.data;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, application_id, session_date, session_completed_at, workflow_stage,
      reviewer_early_end_reason,
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

  const isOwner = app?.user_id === session.id;
  if (!isOwner && !isDevFullAccess(session.email)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const sessionDone =
    !!assignment.session_completed_at
    || assignment.workflow_stage === "session_done"
    || ["score_submitted", "score_approved", "completed"].includes(assignment.workflow_stage ?? "");

  if (!sessionDone) {
    return NextResponse.json(
      { success: false, error: "Wait for the reviewer to finish the session before confirming." },
      { status: 422 },
    );
  }

  const needsEarlyReason =
    !!assignment.session_date
    && !!assignment.session_completed_at
    && requiresEarlyEndReason(assignment.session_date, assignment.session_completed_at);

  const reviewerProvidedReason = !!assignment.reviewer_early_end_reason?.trim();
  const needsStudentEarlyReason = needsEarlyReason && !reviewerProvidedReason;

  if (needsStudentEarlyReason && !early_end_reason?.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "This session ended early. Please briefly explain why (e.g. technical issues, finished early).",
      },
      { status: 422 },
    );
  }

  const { error } = await supabase
    .from("reviewer_assignments")
    .update({
      student_session_confirmed_at: new Date().toISOString(),
      student_feedback_audio: feedback_audio ?? null,
      student_feedback_video: feedback_video ?? null,
      student_feedback_notes: feedback_notes?.trim() || null,
      ...(needsStudentEarlyReason && early_end_reason?.trim()
        ? { student_early_end_reason: early_end_reason.trim() }
        : {}),
    })
    .eq("id", assignment_id);

  if (error) {
    return NextResponse.json({ success: false, error: "Could not save confirmation" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
