import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { isMissingWorkflowColumn, setAssignmentStage, studentCodeFromApp } from "@/lib/workflow";
import { prependProposalSubmittedMeta } from "@/lib/scheduling/session-proposal";

const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export function isRescheduleRequest(notes: string | null | undefined): boolean {
  return !!notes?.includes("[Reschedule requested");
}

function formatSessionLabel(iso: string | null | undefined): string {
  if (!iso) return "not set";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export async function requestSessionReschedule(
  supabase: SupabaseClient,
  params: {
    assignmentId: string;
    requestedBy: "reviewer" | "student" | "admin";
    reason: string;
    preferredSessionAt?: string;
  },
) {
  if (params.requestedBy === "admin") {
    return adminRequestSessionReschedule(supabase, params);
  }

  const { data: assignment, error } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, application_id, session_date, proposed_session_at, proposed_session_notes,
      applications:application_id (project_name, users:user_id (email, full_name))
    `)
    .eq("id", params.assignmentId)
    .single();

  if (error || !assignment) throw new Error("Assignment not found");

  const previousTime =
    assignment.session_date ?? assignment.proposed_session_at ?? null;

  const submittedAt = new Date().toISOString();
  const notesBody = [
    `[Reschedule requested by ${params.requestedBy}]`,
    `Previous time: ${formatSessionLabel(previousTime)}`,
    `Reason: ${params.reason.trim()}`,
    params.preferredSessionAt
      ? `Preferred new time: ${formatSessionLabel(params.preferredSessionAt)}`
      : "Preferred new time: not specified — admin to coordinate",
  ].join("\n");
  const notes = prependProposalSubmittedMeta(notesBody, submittedAt);

  const updatePayload: Record<string, unknown> = {
    proposed_session_notes: notes,
    workflow_stage: "session_proposed",
    session_date: null,
    status: "assigned",
    daily_room_url: null,
    daily_room_name: null,
    session_proposal_submitted_at: submittedAt,
    admin_session_reminder_count: 0,
  };

  if (params.preferredSessionAt) {
    updatePayload.proposed_session_at = params.preferredSessionAt;
  }

  const updateResult = await supabase
    .from("reviewer_assignments")
    .update(updatePayload)
    .eq("id", params.assignmentId);

  if (isMissingWorkflowColumn(updateResult.error?.message)) {
    await supabase
      .from("reviewer_assignments")
      .update({
        session_date: null,
        status: "assigned",
        proposed_session_notes: notes,
      })
      .eq("id", params.assignmentId);
  }

  await setAssignmentStage(supabase, params.assignmentId, "session_proposed", "reviewer_assigned");

  const appRow = Array.isArray(assignment.applications)
    ? assignment.applications[0]
    : assignment.applications;
  const users = appRow?.users as
    | { email: string; full_name: string }
    | { email: string; full_name: string }[]
    | undefined;
  const student = Array.isArray(users) ? users[0] : users;
  const studentCode = studentCodeFromApp(assignment.application_id);
  const { data: admin } = await supabase
    .from("users")
    .select("email")
    .eq("account_type", "admin")
    .limit(1)
    .maybeSingle();

  if (admin) {
    await sendEmail({
      to: admin.email,
      subject: `Reschedule requested: ${appRow?.project_name ?? "Orcred session"}`,
      template: "session_reschedule_admin",
      data: {
        student_name: student?.full_name,
        project_name: appRow?.project_name,
        student_code: studentCode,
        requested_by: params.requestedBy,
        previous_time: formatSessionLabel(previousTime),
        preferred_time: params.preferredSessionAt
          ? formatSessionLabel(params.preferredSessionAt)
          : "Not specified",
        reason: params.reason.trim(),
        admin_url: `${DASHBOARD_URL}/dashboard/admin`,
      },
    });
  }

  return { success: true as const };
}

/** Admin rejects proposed time — reviewer must pick a new slot from student availability. */
async function adminRequestSessionReschedule(
  supabase: SupabaseClient,
  params: {
    assignmentId: string;
    reason: string;
    preferredSessionAt?: string;
  },
) {
  const { data: assignment, error } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, application_id, session_date, proposed_session_at, proposed_session_notes,
      reviewers:reviewer_id (email, full_name),
      applications:application_id (project_name, users:user_id (email, full_name))
    `)
    .eq("id", params.assignmentId)
    .single();

  if (error || !assignment) throw new Error("Assignment not found");

  const previousTime =
    assignment.session_date ?? assignment.proposed_session_at ?? null;

  const submittedAt = new Date().toISOString();
  const notesBody = [
    `[Reschedule requested by admin]`,
    `Previous time: ${formatSessionLabel(previousTime)}`,
    `Admin message: ${params.reason.trim()}`,
    params.preferredSessionAt
      ? `Suggested new time: ${formatSessionLabel(params.preferredSessionAt)}`
      : "Reviewer: please propose a new time from the student's availability.",
  ].join("\n");

  const updatePayload: Record<string, unknown> = {
    proposed_session_notes: notesBody,
    proposed_session_at: params.preferredSessionAt ?? null,
    workflow_stage: "accepted",
    session_date: null,
    status: "assigned",
    daily_room_url: null,
    daily_room_name: null,
    session_proposal_submitted_at: null,
    admin_session_reminder_count: 0,
  };

  const updateResult = await supabase
    .from("reviewer_assignments")
    .update(updatePayload)
    .eq("id", params.assignmentId);

  if (isMissingWorkflowColumn(updateResult.error?.message)) {
    await supabase
      .from("reviewer_assignments")
      .update({
        session_date: null,
        status: "assigned",
        proposed_session_notes: notesBody,
      })
      .eq("id", params.assignmentId);
  }

  await setAssignmentStage(supabase, params.assignmentId, "accepted", "reviewer_assigned");

  await supabase
    .from("reviewer_tasks")
    .update({ status: "todo", completed_at: null, notes: null })
    .eq("assignment_id", params.assignmentId)
    .eq("task_key", "propose_session");

  const appRow = Array.isArray(assignment.applications)
    ? assignment.applications[0]
    : assignment.applications;
  const users = appRow?.users as
    | { email: string; full_name: string }
    | { email: string; full_name: string }[]
    | undefined;
  const student = Array.isArray(users) ? users[0] : users;
  const reviewer = Array.isArray(assignment.reviewers)
    ? assignment.reviewers[0]
    : assignment.reviewers;
  const studentCode = studentCodeFromApp(assignment.application_id);

  if (student) {
    await sendEmail({
      to: student.email,
      subject: `Session update: ${appRow?.project_name ?? "Orcred review"}`,
      template: "session_reschedule_parties",
      data: {
        recipient_name: student.full_name,
        project_name: appRow?.project_name,
        previous_time: formatSessionLabel(previousTime),
        message: params.reason.trim(),
        action: "Our team is coordinating a new session time with your reviewer. You'll receive another email once a new slot is proposed.",
        dashboard_url: `${DASHBOARD_URL}/dashboard/student`,
      },
    });
  }

  if (reviewer) {
    await sendEmail({
      to: reviewer.email,
      subject: `Please propose a new session time: ${appRow?.project_name ?? "Orcred review"}`,
      template: "session_reschedule_parties",
      data: {
        recipient_name: reviewer.full_name,
        project_name: appRow?.project_name,
        student_code: studentCode,
        previous_time: formatSessionLabel(previousTime),
        message: params.reason.trim(),
        action: "Log in to your reviewer dashboard and propose a new session from the student's availability windows.",
        dashboard_url: `${DASHBOARD_URL}/dashboard/reviewer`,
      },
    });
  }

  return { success: true as const };
}
