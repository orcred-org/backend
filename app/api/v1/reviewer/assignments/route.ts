import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import {
  inferWorkflowStage,
  isMissingWorkflowColumn,
  studentCodeFromApp,
} from "@/lib/workflow";

export async function GET(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();

  const workflowSelect = `
    id, application_id, assigned_at, session_date, status, daily_room_url,
    workflow_stage, proposed_session_at, proposed_session_notes,
    applications:application_id (
      id, project_name, tech_stack, submitted_at, status, github_url, loom_url,
      users:user_id (full_name, email)
    )
  `;
  const baseSelect = `
    id, application_id, assigned_at, session_date, status, daily_room_url,
    applications:application_id (
      id, project_name, tech_stack, submitted_at, status, github_url, loom_url,
      users:user_id (full_name, email)
    )
  `;

  let { data, error } = await supabase
    .from("reviewer_assignments")
    .select(workflowSelect)
    .eq("reviewer_id", session.id)
    .order("assigned_at", { ascending: false });

  if (error && isMissingWorkflowColumn(error.message)) {
    const fallbackResult = await supabase
      .from("reviewer_assignments")
      .select(baseSelect)
      .eq("reviewer_id", session.id)
      .order("assigned_at", { ascending: false });
    data = fallbackResult.data as typeof data;
    error = fallbackResult.error;
  }

  if (error) {
    console.error("[reviewer/assignments]", error.message);
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }

  const normalized = (data ?? []).map((row) => {
    const app = Array.isArray(row.applications) ? row.applications[0] : row.applications;
    const users = app?.users;
    const student = Array.isArray(users) ? users[0] : users;
    const stage = inferWorkflowStage(
      {
        status: row.status,
        session_date: row.session_date,
        workflow_stage: (row as { workflow_stage?: string }).workflow_stage,
      },
      app?.status,
    );
    return {
      ...row,
      applications: app ?? null,
      student_name: student?.full_name ?? null,
      student_email: student?.email ?? null,
      student_code: studentCodeFromApp(row.application_id ?? app?.id ?? ""),
      workflow_stage: stage,
    };
  });

  return NextResponse.json({ success: true, data: normalized });
}
