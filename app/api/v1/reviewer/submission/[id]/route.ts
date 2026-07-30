import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import {
  inferWorkflowStage,
  isMissingWorkflowColumn,
  studentCodeFromApp,
  synthesizeWorkflowTasks,
} from "@/lib/workflow";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = createServiceClient();

  const assignmentSelect = `
    id, session_date, status, daily_room_url, daily_room_name,
    workflow_stage, student_code, proposed_session_at, proposed_session_notes,
    accepted_at, session_completed_at
  `;
  const assignmentBaseSelect = `
    id, session_date, status, daily_room_url, daily_room_name
  `;

  let { data: assignment, error: assignmentError } = await supabase
    .from("reviewer_assignments")
    .select(assignmentSelect)
    .eq("application_id", id)
    .eq("reviewer_id", session.id)
    .single();

  if (assignmentError && isMissingWorkflowColumn(assignmentError.message)) {
    ({ data: assignment, error: assignmentError } = await supabase
      .from("reviewer_assignments")
      .select(assignmentBaseSelect)
      .eq("application_id", id)
      .eq("reviewer_id", session.id)
      .single());
  }

  if (assignmentError || !assignment) {
    return NextResponse.json({ success: false, error: "Not found or not assigned to you" }, { status: 404 });
  }

  const appSelect = `
    id, project_name, tech_stack, github_url, loom_url,
    build_decision_1, build_decision_2, build_decision_3,
    what_broke, ai_tools_used, submitted_at, availability, workflow_stage,
    users:user_id (full_name, email)
  `;
  const appBaseSelect = `
    id, project_name, tech_stack, github_url, loom_url, status,
    build_decision_1, build_decision_2, build_decision_3,
    what_broke, ai_tools_used, submitted_at, availability,
    users:user_id (full_name, email)
  `;

  let { data: application, error: appError } = await supabase
    .from("applications")
    .select(appSelect)
    .eq("id", id)
    .single();

  if (appError && isMissingWorkflowColumn(appError.message)) {
    ({ data: application, error: appError } = await supabase
      .from("applications")
      .select(appBaseSelect)
      .eq("id", id)
      .single());
  }

  if (appError || !application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  const users = application.users as { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  const student = Array.isArray(users) ? users[0] : users;

  const { data: dbTasks, error: tasksError } = await supabase
    .from("reviewer_tasks")
    .select("id, task_key, title, status, sort_order, unlocked, is_custom, notes")
    .eq("assignment_id", assignment.id)
    .order("sort_order", { ascending: true });

  const stage = inferWorkflowStage(assignment, application.status);
  const studentCode = (assignment as { student_code?: string }).student_code ?? studentCodeFromApp(id);
  const tasks = (!tasksError && dbTasks && dbTasks.length > 0)
    ? dbTasks
    : synthesizeWorkflowTasks({
        assignmentId: assignment.id,
        applicationId: id,
        reviewerId: session.id,
        studentCode,
        stage,
      });

  const scoreSelect = "id, submitted_at, admin_review_status, passed, total_score, final_score";
  const scoreBaseSelect = "id, submitted_at, passed, total_score, final_score";
  let { data: existingScore, error: scoreError } = await supabase
    .from("scores")
    .select(scoreSelect)
    .eq("application_id", id)
    .maybeSingle();

  if (scoreError && isMissingWorkflowColumn(scoreError.message)) {
    ({ data: existingScore } = await supabase
      .from("scores")
      .select(scoreBaseSelect)
      .eq("application_id", id)
      .maybeSingle());
  }

  const sessionDone = !!(assignment as { session_completed_at?: string }).session_completed_at
    || stage === "session_done"
    || stage === "score_submitted"
    || (!!(assignment.session_date) && new Date() > new Date(assignment.session_date));

  const canSubmitScore = sessionDone && !existingScore;

  return NextResponse.json({
    success: true,
    data: {
      application: {
        ...application,
        users: undefined,
        workflow_stage: (application as { workflow_stage?: string }).workflow_stage ?? stage,
      },
      assignment: {
        ...assignment,
        workflow_stage: (assignment as { workflow_stage?: string }).workflow_stage ?? stage,
        student_code: studentCode,
      },
      tasks,
      can_submit_score: canSubmitScore,
      score_submitted: !!existingScore,
      score_pending_admin: existingScore?.admin_review_status === "pending",
      student: student ?? null,
    },
  });
}
