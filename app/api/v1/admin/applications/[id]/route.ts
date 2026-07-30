import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { enrichAssignmentWorkflow } from "@/lib/workflow";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const baseSelect = `
      id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
      github_url, loom_url, build_decision_1, build_decision_2, build_decision_3,
      what_broke, ai_tools_used, recording_url,
      users:user_id (id, full_name, email),
      scores (
        id, total_score, final_score, passed,
        technical_depth, communication, reproducibility, problem_solving,
        feedback_td, feedback_comm, feedback_repro, feedback_ps
      ),
      credentials (id, credential_id, credential_url, issued_at),
      reviewer_assignments (
        id, session_date, status,
        reviewers:reviewer_id (full_name, email)
      )
    `;

  const workflowSelect = `
      id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
      github_url, loom_url, build_decision_1, build_decision_2, build_decision_3,
      what_broke, ai_tools_used, recording_url,
      users:user_id (id, full_name, email),
      scores (
        id, total_score, final_score, passed, admin_review_status,
        technical_depth, communication, reproducibility, problem_solving,
        feedback_td, feedback_comm, feedback_repro, feedback_ps,
        submitted_at
      ),
      credentials (id, credential_id, credential_url, issued_at),
      reviewer_assignments (
        id, session_date, status, workflow_stage, proposed_session_at, proposed_session_notes, student_code,
        session_proposal_submitted_at, admin_session_reminder_count, accepted_at, session_completed_at,
        student_session_confirmed_at, student_feedback_audio, student_feedback_video, student_feedback_notes,
        reviewer_joined_at, student_joined_at, reviewer_early_end_reason, student_early_end_reason,
        reviewers:reviewer_id (id, full_name, email),
        reviewer_tasks (
          id, task_key, title, status, notes, completed_at, sort_order, unlocked, is_custom
        )
      )
    `;

  let { data, error } = await supabase.from("applications").select(workflowSelect).eq("id", id).single();

  if (error?.message?.includes("workflow_stage") || error?.message?.includes("does not exist") || error?.message?.includes("reviewer_tasks")) {
    const partialSelect = workflowSelect.replace(/,\s*reviewer_tasks \([^)]+\)/, "");
    ({ data, error } = await supabase.from("applications").select(partialSelect).eq("id", id).single());
  }

  if (error?.message?.includes("workflow_stage") || error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase.from("applications").select(baseSelect).eq("id", id).single());
  }

  if (error || !data) {
    console.error("[admin/applications/id]", error?.message);
    return corsJson(req, { success: false, error: error?.message || "Application not found" }, 404);
  }

  const assignmentRaw = Array.isArray(data.reviewer_assignments)
    ? data.reviewer_assignments[0]
    : data.reviewer_assignments;

  if (assignmentRaw) {
    const reviewers = assignmentRaw.reviewers as { id?: string } | { id?: string }[] | null;
    const reviewer = Array.isArray(reviewers) ? reviewers[0] : reviewers;
    enrichAssignmentWorkflow(
      assignmentRaw as Record<string, unknown>,
      data.id,
      data.status,
      reviewer?.id,
    );
  }

  return corsJson(req, { success: true, data });
}
