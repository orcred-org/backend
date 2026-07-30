import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import {
  createCustomTaskSchema,
  proposeSessionSchema,
  requestRescheduleSchema,
  updateTaskStatusSchema,
} from "@/lib/validators/reviewer";
import { completeTask, isMissingWorkflowColumn, setAssignmentStage, studentCodeFromApp, markSystemTasksDoneThrough } from "@/lib/workflow";
import { requestSessionReschedule } from "@/lib/scheduling/reschedule";
import { prependProposalSubmittedMeta } from "@/lib/scheduling/session-proposal";
import { sendEmail } from "@/lib/email";
import { markSessionDoneSchema } from "@/lib/validators/session";
import { requiresEarlyEndReason, SESSION_DURATION_MINUTES } from "@/lib/session/audit";

const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const action = body.action as string;
  const supabase = createServiceClient();

  if (action === "update_task") {
    const parsed = updateTaskStatusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });

    const { error } = await supabase
      .from("reviewer_tasks")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.task_id)
      .eq("reviewer_id", session.id);

    if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "complete_task") {
    const taskId = body.task_id as string;
    if (!taskId) return NextResponse.json({ success: false, error: "task_id required" }, { status: 422 });

    const result = await completeTask(supabase, taskId, session.id);
    return NextResponse.json({ success: true, data: result });
  }

  if (action === "accept_candidate") {
    const assignmentId = body.assignment_id as string;
    if (!assignmentId) return NextResponse.json({ success: false, error: "assignment_id required" }, { status: 422 });

    const { data: assignment } = await supabase
      .from("reviewer_assignments")
      .select("id, application_id, applications:application_id (project_name, users:user_id (email, full_name))")
      .eq("id", assignmentId)
      .eq("reviewer_id", session.id)
      .single();

    if (!assignment) return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });

    const acceptUpdate = await supabase
      .from("reviewer_assignments")
      .update({ accepted_at: new Date().toISOString(), workflow_stage: "accepted" })
      .eq("id", assignmentId);

    if (isMissingWorkflowColumn(acceptUpdate.error?.message)) {
      await supabase.from("reviewer_assignments").update({ status: "assigned" }).eq("id", assignmentId);
    }

    await setAssignmentStage(supabase, assignmentId, "accepted", "reviewer_assigned");

    const { data: acceptTask } = await supabase
      .from("reviewer_tasks")
      .select("id")
      .eq("assignment_id", assignmentId)
      .eq("task_key", "accept_candidate")
      .maybeSingle();

    if (acceptTask) await completeTask(supabase, acceptTask.id, session.id);
    try {
      await markSystemTasksDoneThrough(supabase, assignmentId, 2);
    } catch { /* reviewer_tasks may be unavailable */ }

    const appRow = Array.isArray(assignment.applications) ? assignment.applications[0] : assignment.applications;
    const users = appRow?.users as { email: string; full_name: string } | { email: string; full_name: string }[] | undefined;
    const student = Array.isArray(users) ? users[0] : users;
    if (student) {
      await sendEmail({
        to: student.email,
        subject: "Your reviewer accepted your application",
        template: "reviewer_accepted_student",
        data: {
          student_name: student.full_name,
          project_name: appRow?.project_name ?? 'your project',
          dashboard_url: `${DASHBOARD_URL}/dashboard/student`,
        },
      });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "propose_session") {
    const parsed = proposeSessionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });

    const { assignment_id, proposed_session_at, notes } = parsed.data;

    const { data: assignment } = await supabase
      .from("reviewer_assignments")
      .select(`
        id, application_id,
        applications:application_id (project_name, users:user_id (full_name))
      `)
      .eq("id", assignment_id)
      .eq("reviewer_id", session.id)
      .single();

    if (!assignment) return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });

    const submittedAt = new Date().toISOString();
    const fullNotes = prependProposalSubmittedMeta(notes ?? null, submittedAt);

    const proposeUpdate = await supabase
      .from("reviewer_assignments")
      .update({
        proposed_session_at,
        proposed_session_notes: fullNotes,
        workflow_stage: "session_proposed",
        session_date: null,
        session_proposal_submitted_at: submittedAt,
        admin_session_reminder_count: 0,
      })
      .eq("id", assignment_id);

    if (proposeUpdate.error) {
      if (isMissingWorkflowColumn(proposeUpdate.error.message)) {
        console.error("[reviewer/workflow] propose_session missing DB columns — run migrations 006 + 007");
        return NextResponse.json(
          {
            success: false,
            error: "Session proposal could not be saved. Ask admin to run Supabase migrations 006 and 007, then try again.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ success: false, error: "Failed to save session proposal" }, { status: 500 });
    }

    await setAssignmentStage(supabase, assignment_id, "session_proposed", "reviewer_assigned");

    try {
      await markSystemTasksDoneThrough(supabase, assignment_id, 3);
    } catch {
      const { data: proposeTask } = await supabase
        .from("reviewer_tasks")
        .select("id")
        .eq("assignment_id", assignment_id)
        .eq("task_key", "propose_session")
        .maybeSingle();
      if (proposeTask) await completeTask(supabase, proposeTask.id, session.id);
    }

    const sessionLabel = new Date(proposed_session_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const appRow = Array.isArray(assignment.applications) ? assignment.applications[0] : assignment.applications;
    const users = appRow?.users as { full_name: string } | { full_name: string }[] | undefined;
    const studentUser = Array.isArray(users) ? users[0] : users;
    const studentCode = studentCodeFromApp(assignment.application_id);
    const { data: admin } = await supabase.from("users").select("email").eq("account_type", "admin").limit(1).maybeSingle();

    if (admin) {
      await sendEmail({
        to: admin.email,
        subject: `Session proposed: ${appRow?.project_name}`,
        template: "session_proposed_admin",
        data: {
          student_name: studentUser?.full_name,
          project_name: appRow?.project_name,
          session_date: sessionLabel,
          notes: fullNotes,
          student_code: studentCode,
          admin_url: `${DASHBOARD_URL}/dashboard/admin`,
        },
      });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "request_reschedule") {
    const parsed = requestRescheduleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });

    const { assignment_id, reason, preferred_session_at } = parsed.data;

    const { data: assignment } = await supabase
      .from("reviewer_assignments")
      .select("id")
      .eq("id", assignment_id)
      .eq("reviewer_id", session.id)
      .single();

    if (!assignment) return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });

    await requestSessionReschedule(supabase, {
      assignmentId: assignment_id,
      requestedBy: "reviewer",
      reason,
      preferredSessionAt: preferred_session_at,
    });

    return NextResponse.json({ success: true });
  }

  if (action === "mark_session_done") {
    const parsed = markSessionDoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
    }

    const { assignment_id, early_end_reason } = parsed.data;

    const { data: assignment } = await supabase
      .from("reviewer_assignments")
      .select("id, session_date")
      .eq("id", assignment_id)
      .eq("reviewer_id", session.id)
      .single();

    if (!assignment) {
      return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
    }

    const completedAt = new Date().toISOString();
    const needsReason =
      !!assignment.session_date
      && requiresEarlyEndReason(assignment.session_date, completedAt);

    if (needsReason && !early_end_reason?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: `This session ended before the ${SESSION_DURATION_MINUTES}-minute window. Please explain why before continuing.`,
        },
        { status: 422 },
      );
    }

    await supabase
      .from("reviewer_assignments")
      .update({
        session_completed_at: completedAt,
        workflow_stage: "session_done",
        status: "completed",
        ...(needsReason && early_end_reason?.trim()
          ? { reviewer_early_end_reason: early_end_reason.trim() }
          : {}),
      })
      .eq("id", assignment_id)
      .eq("reviewer_id", session.id);

    await setAssignmentStage(supabase, assignment_id, "session_done", "scheduled");

    const { data: sessionTask } = await supabase
      .from("reviewer_tasks")
      .select("id")
      .eq("assignment_id", assignment_id)
      .eq("task_key", "conduct_session")
      .single();

    if (sessionTask) await completeTask(supabase, sessionTask.id, session.id);

    return NextResponse.json({ success: true });
  }

  if (action === "create_custom_task") {
    const parsed = createCustomTaskSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });

    const { data: assignment } = await supabase
      .from("reviewer_assignments")
      .select("id, application_id, student_code")
      .eq("id", parsed.data.assignment_id)
      .eq("reviewer_id", session.id)
      .single();

    if (!assignment) return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });

    const cat = parsed.data.category ?? "personal";
    const code = (assignment as { student_code?: string }).student_code
      ?? studentCodeFromApp(assignment.application_id);
    const prefix = cat === "personal" ? "Personal" : cat.startsWith("student:") ? code : cat;

    const { data: task, error } = await supabase
      .from("reviewer_tasks")
      .insert({
        assignment_id: assignment.id,
        application_id: assignment.application_id,
        reviewer_id: session.id,
        task_key: `custom_${Date.now()}`,
        title: `[${prefix}] ${parsed.data.title}`,
        notes: parsed.data.description ?? null,
        status: parsed.data.status ?? "todo",
        sort_order: 99,
        unlocked: true,
        is_custom: true,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ success: false, error: "Failed to create task" }, { status: 500 });
    return NextResponse.json({ success: true, data: task });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
