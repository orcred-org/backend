import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { enrichAssignmentWorkflow } from "@/lib/workflow";
import { isMissingSchemaError, SCORES_CORE, SCORES_RUBRIC_LEGACY, SCORES_RUBRIC_MODERN } from "@/lib/db/schemaFallback";

function scoresBlock(rubric: string | null, extra = ""): string {
  const core = `${SCORES_CORE}${extra ? `, ${extra}` : ""}`;
  if (!rubric) return `scores (${core})`;
  return `scores (${core}, ${rubric})`;
}

function buildApplicationSelect(opts: {
  workflow: boolean;
  rubric: "modern" | "legacy" | null;
  includeTasks: boolean;
}): string {
  const rubricStr =
    opts.rubric === "modern"
      ? SCORES_RUBRIC_MODERN
      : opts.rubric === "legacy"
        ? SCORES_RUBRIC_LEGACY
        : null;
  const scoreExtra = opts.workflow ? "admin_review_status, submitted_at" : "";
  const scores = scoresBlock(rubricStr, scoreExtra);

  const assignmentBase = `
        id, session_date, status,
        reviewers:reviewer_id (full_name, email)`;
  const assignmentWorkflow = `
        id, session_date, status, workflow_stage, proposed_session_at, proposed_session_notes, student_code,
        session_proposal_submitted_at, admin_session_reminder_count, accepted_at, session_completed_at,
        student_session_confirmed_at, student_feedback_audio, student_feedback_video, student_feedback_notes,
        reviewer_joined_at, student_joined_at, reviewer_early_end_reason, student_early_end_reason,
        reviewers:reviewer_id (id, full_name, email)`;
  const tasks = `,
        reviewer_tasks (
          id, task_key, title, status, notes, completed_at, sort_order, unlocked, is_custom
        )`;

  let assignments = opts.workflow ? assignmentWorkflow : assignmentBase;
  if (opts.workflow && opts.includeTasks) assignments += tasks;

  return `
      id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
      github_url, loom_url, build_decision_1, build_decision_2, build_decision_3,
      what_broke, ai_tools_used, recording_url,
      users:user_id (id, full_name, email),
      ${scores},
      credentials (id, credential_id, credential_url, issued_at),
      reviewer_assignments (${assignments}
      )
    `;
}

function normalizeLegacyScoreFields(app: Record<string, unknown>): void {
  const raw = app.scores;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const s = row as Record<string, unknown>;
    if (s.problem_solving == null && s.originality != null) {
      s.problem_solving = s.originality;
    }
    if (s.feedback_ps == null && s.feedback_orig != null) {
      s.feedback_ps = s.feedback_orig;
    }
  }
}

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

  const selects = [
    buildApplicationSelect({ workflow: true, rubric: "modern", includeTasks: true }),
    buildApplicationSelect({ workflow: true, rubric: "modern", includeTasks: false }),
    buildApplicationSelect({ workflow: false, rubric: "modern", includeTasks: false }),
    buildApplicationSelect({ workflow: true, rubric: null, includeTasks: false }),
    buildApplicationSelect({ workflow: false, rubric: null, includeTasks: false }),
    buildApplicationSelect({ workflow: true, rubric: "legacy", includeTasks: false }),
    buildApplicationSelect({ workflow: false, rubric: "legacy", includeTasks: false }),
  ];

  let data = null;
  let error: { message: string } | null = null;

  for (const select of selects) {
    const result = await supabase.from("applications").select(select).eq("id", id).single();
    data = result.data;
    error = result.error;
    if (!error) break;
    if (!isMissingSchemaError(error.message)) break;
  }

  if (error || !data) {
    console.error("[admin/applications/id]", error?.message);
    return corsJson(req, { success: false, error: error?.message || "Application not found" }, 404);
  }

  const app = data as unknown as {
    id: string;
    status: string;
    reviewer_assignments?: unknown;
  };

  const assignmentRaw = Array.isArray(app.reviewer_assignments)
    ? app.reviewer_assignments[0]
    : app.reviewer_assignments;

  if (assignmentRaw) {
    const row = assignmentRaw as Record<string, unknown> & { reviewers?: { id?: string } | { id?: string }[] | null };
    const reviewers = row.reviewers;
    const reviewer = Array.isArray(reviewers) ? reviewers[0] : reviewers;
    enrichAssignmentWorkflow(
      row,
      app.id,
      app.status,
      reviewer?.id,
    );
  }

  normalizeLegacyScoreFields(app as unknown as Record<string, unknown>);

  return corsJson(req, { success: true, data: app });
}
