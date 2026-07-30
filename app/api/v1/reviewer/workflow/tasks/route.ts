import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import {
  inferWorkflowStage,
  isMissingWorkflowColumn,
  studentCodeFromApp,
  synthesizeWorkflowTasks,
} from "@/lib/workflow";

export async function GET(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("reviewer_tasks")
    .select(`
      id, task_key, title, status, sort_order, unlocked, is_custom, notes, completed_at, created_at,
      assignment_id, application_id
    `)
    .eq("reviewer_id", session.id)
    .order("sort_order", { ascending: true });

  if (!error && data && data.length > 0) {
    return NextResponse.json({ success: true, data });
  }

  if (error && !isMissingWorkflowColumn(error.message)) {
    return NextResponse.json({ success: false, error: "Failed to fetch tasks" }, { status: 500 });
  }

  const { data: assignments } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, application_id, status, session_date,
      applications:application_id (project_name, status)
    `)
    .eq("reviewer_id", session.id)
    .order("assigned_at", { ascending: false });

  const synthetic = (assignments ?? []).flatMap((a) => {
    const app = Array.isArray(a.applications) ? a.applications[0] : a.applications;
    const stage = inferWorkflowStage(
      { status: a.status, session_date: a.session_date },
      app?.status,
    );
    return synthesizeWorkflowTasks({
      assignmentId: a.id,
      applicationId: a.application_id,
      reviewerId: session.id,
      studentCode: studentCodeFromApp(a.application_id),
      stage,
    });
  });

  return NextResponse.json({ success: true, data: synthetic, synthetic: true });
}
