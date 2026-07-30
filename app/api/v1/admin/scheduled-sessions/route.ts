import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { isMissingWorkflowColumn, studentCodeFromApp } from "@/lib/workflow";

type AssignmentRow = {
  id: string;
  session_date: string;
  daily_room_url?: string | null;
  daily_room_name?: string | null;
  student_code?: string | null;
  workflow_stage?: string | null;
  status: string;
  applications: {
    id: string;
    project_name: string;
    status: string;
    users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  } | {
    id: string;
    project_name: string;
    status: string;
    users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  }[] | null;
  reviewers: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

async function fetchScheduledAssignments(
  supabase: ReturnType<typeof createServiceClient>,
  from: string | null,
  to: string | null,
) {
  const baseSelect = `
    id, session_date, daily_room_url, status,
    applications:application_id (
      id, project_name, status,
      users:user_id (full_name, email)
    ),
    reviewers:reviewer_id (full_name, email)
  `;

  const workflowSelect = `
    id, session_date, daily_room_url, daily_room_name, student_code, workflow_stage, status,
    applications:application_id (
      id, project_name, status,
      users:user_id (full_name, email)
    ),
    reviewers:reviewer_id (full_name, email)
  `;

  const runQuery = (select: string) => {
    let query = supabase
      .from("reviewer_assignments")
      .select(select)
      .eq("status", "scheduled")
      .not("session_date", "is", null)
      .order("session_date", { ascending: true });

    if (from) query = query.gte("session_date", from);
    if (to) query = query.lte("session_date", to);
    return query;
  };

  let { data, error } = await runQuery(workflowSelect);

  if (error && isMissingWorkflowColumn(error.message)) {
    ({ data, error } = await runQuery(baseSelect));
  }

  return { data: data as AssignmentRow[] | null, error };
}

/** Admin-approved sessions only — never tentative proposals. */
export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = createServiceClient();
  const { data, error } = await fetchScheduledAssignments(supabase, from, to);

  if (error) {
    console.error("[admin/scheduled-sessions]", error.message);
    return corsJson(req, { success: false, error: "Failed to fetch sessions" }, 500);
  }

  const sessions = (data ?? [])
    .filter((row) => {
      const app = Array.isArray(row.applications) ? row.applications[0] : row.applications;
      return app?.status === "scheduled" || row.workflow_stage === "session_approved";
    })
    .map((row) => {
      const app = Array.isArray(row.applications) ? row.applications[0] : row.applications;
      const reviewer = Array.isArray(row.reviewers) ? row.reviewers[0] : row.reviewers;
      const student = Array.isArray(app?.users) ? app.users[0] : app?.users;
      return {
        assignment_id: row.id,
        application_id: app?.id,
        project_name: app?.project_name,
        session_date: row.session_date,
        daily_room_url: row.daily_room_url ?? null,
        student_code: row.student_code ?? (app?.id ? studentCodeFromApp(app.id) : null),
        student_name: student?.full_name ?? null,
        student_email: student?.email ?? null,
        reviewer_name: reviewer?.full_name ?? null,
        reviewer_email: reviewer?.email ?? null,
      };
    });

  return corsJson(req, { success: true, data: sessions });
}
