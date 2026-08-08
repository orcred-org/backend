import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { sendEmail } from "@/lib/email";
import { isMissingWorkflowColumn, studentCodeFromApp } from "@/lib/workflow";
import {
  getAdminReminderCount,
  incrementAdminReminderCount,
  parseProposalSubmittedAt,
} from "@/lib/scheduling/session-proposal";
import { z } from "zod";

const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const MAX_REMINDERS = 2;
const REMINDER_AFTER_HOURS = 24;

const reminderSchema = z.object({
  assignment_id: z.string().uuid(),
  confirm: z.literal(true),
});

export async function POST(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = reminderSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const supabase = createServiceClient();
  const { assignment_id } = parsed.data;

  const workflowSelect = `
    id, application_id, workflow_stage, proposed_session_at, proposed_session_notes,
    session_proposal_submitted_at, admin_session_reminder_count,
    applications:application_id (project_name, users:user_id (full_name))
  `;
  const baseSelect = `
    id, application_id, proposed_session_at, proposed_session_notes,
    applications:application_id (project_name, users:user_id (full_name))
  `;

  let { data: assignment, error } = await supabase
    .from("reviewer_assignments")
    .select(workflowSelect)
    .eq("id", assignment_id)
    .single();

  if (error && isMissingWorkflowColumn(error.message)) {
    ({ data: assignment, error } = await supabase
      .from("reviewer_assignments")
      .select(baseSelect)
      .eq("id", assignment_id)
      .single());
  }

  if (error || !assignment) {
    return corsJson(req, { success: false, error: "Assignment not found" }, 404);
  }

  const row = assignment as unknown as {
    id: string;
    application_id: string;
    workflow_stage?: string;
    proposed_session_at?: string | null;
    proposed_session_notes?: string | null;
    session_proposal_submitted_at?: string | null;
    admin_session_reminder_count?: number | null;
    applications: { project_name: string; users: { full_name: string } } | { project_name: string; users: { full_name: string } }[];
  };

  if (row.workflow_stage && row.workflow_stage !== "session_proposed") {
    return corsJson(req, { success: false, error: "No pending session proposal" }, 422);
  }

  if (!row.proposed_session_at && !row.proposed_session_notes) {
    return corsJson(req, { success: false, error: "No session proposed yet" }, 422);
  }

  const reminderCount = getAdminReminderCount(
    row.proposed_session_notes,
    row.admin_session_reminder_count,
  );
  if (reminderCount >= MAX_REMINDERS) {
    return corsJson(req, { success: false, error: "Reminder limit reached (2 max)" }, 422);
  }

  const submittedAt = parseProposalSubmittedAt(
    row.proposed_session_notes,
    row.session_proposal_submitted_at,
  );
  if (!submittedAt) {
    return corsJson(req, { success: false, error: "Proposal submission time unknown" }, 422);
  }

  const hoursWaiting = (Date.now() - submittedAt.getTime()) / (1000 * 60 * 60);
  if (hoursWaiting < REMINDER_AFTER_HOURS) {
    const hoursLeft = Math.ceil(REMINDER_AFTER_HOURS - hoursWaiting);
    return corsJson(req, {
      success: false,
      error: `Reminder available in ~${hoursLeft} hour${hoursLeft === 1 ? "" : "s"} (24h after proposal)`,
    }, 422);
  }

  const appRow = Array.isArray(row.applications) ? row.applications[0] : row.applications;
  const users = appRow?.users as { full_name: string } | { full_name: string }[] | undefined;
  const student = Array.isArray(users) ? users[0] : users;
  const studentCode = studentCodeFromApp(row.application_id);

  await incrementAdminReminderCount(
    supabase,
    assignment_id,
    row.proposed_session_notes,
    row.admin_session_reminder_count,
  );

  const sessionLabel = row.proposed_session_at
    ? new Date(row.proposed_session_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "See notes";

  await sendEmail({
    to: session.email,
    subject: `Reminder: approve session for ${appRow?.project_name ?? "Orcred application"}`,
    template: "session_proposal_reminder_admin",
    data: {
      student_name: student?.full_name,
      project_name: appRow?.project_name,
      student_code: studentCode,
      session_date: sessionLabel,
      notes: row.proposed_session_notes ?? "",
      hours_waiting: Math.floor(hoursWaiting),
      admin_url: `${DASHBOARD_URL}/dashboard/admin`,
    },
  });

  return corsJson(req, {
    success: true,
    data: { reminders_sent: reminderCount + 1, reminders_remaining: MAX_REMINDERS - reminderCount - 1 },
  });
}
