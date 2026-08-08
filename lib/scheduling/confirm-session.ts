import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { setAssignmentStage } from "@/lib/workflow";
import { createRoom } from "@/lib/video";
import { isMissingWorkflowColumn } from "@/lib/workflow";

const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

function formatSessionLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

/** Apply or re-apply a confirmed session time (creates Daily room, emails parties). */
export async function confirmSessionSchedule(
  supabase: SupabaseClient,
  assignmentId: string,
  sessionDate: string,
  opts?: { isReschedule?: boolean; adminNote?: string },
) {
  const { data: assignment, error } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, application_id, session_date, proposed_session_at,
      reviewers:reviewer_id (email, full_name),
      applications:application_id (project_name, tech_stack, users:user_id (email, full_name))
    `)
    .eq("id", assignmentId)
    .single();

  if (error || !assignment) throw new Error("Assignment not found");

  const previousTime = assignment.session_date ?? assignment.proposed_session_at ?? null;

  let dailyRoomUrl: string | null = null;
  let dailyRoomName: string | null = null;

  if (process.env.DAILY_API_KEY) {
    try {
      const room = await createRoom(sessionDate);
      dailyRoomUrl = room.url;
      dailyRoomName = room.name;
    } catch (err) {
      console.error("[confirm-session] Daily room creation failed:", (err as Error).message);
    }
  }

  const updatePayload: Record<string, unknown> = {
    session_date: sessionDate,
    proposed_session_at: sessionDate,
    status: "scheduled",
    workflow_stage: "session_approved",
    daily_room_url: dailyRoomUrl,
    daily_room_name: dailyRoomName,
    session_completed_at: null,
  };

  if (opts?.adminNote?.trim()) {
    updatePayload.proposed_session_notes = [
      opts.isReschedule ? "[Rescheduled by admin]" : "[Scheduled by admin]",
      previousTime ? `Previous time: ${formatSessionLabel(previousTime)}` : null,
      opts.adminNote.trim(),
    ].filter(Boolean).join("\n");
  }

  const updateResult = await supabase
    .from("reviewer_assignments")
    .update(updatePayload)
    .eq("id", assignmentId);

  if (isMissingWorkflowColumn(updateResult.error?.message)) {
    await supabase
      .from("reviewer_assignments")
      .update({
        session_date: sessionDate,
        status: "scheduled",
        daily_room_url: dailyRoomUrl,
        daily_room_name: dailyRoomName,
      })
      .eq("id", assignmentId);
  }

  await setAssignmentStage(supabase, assignmentId, "session_approved", "scheduled");

  const sessionLabel = formatSessionLabel(sessionDate);
  const sessionPageUrl = `${DASHBOARD_URL}/dashboard/session/${assignmentId}`;
  const appRaw = assignment.applications;
  const app = (Array.isArray(appRaw) ? appRaw[0] : appRaw) as {
    project_name: string;
    tech_stack?: string;
    users: { email: string; full_name: string } | { email: string; full_name: string }[];
  };
  const reviewerRaw = assignment.reviewers;
  const reviewer = (Array.isArray(reviewerRaw) ? reviewerRaw[0] : reviewerRaw) as {
    email: string;
    full_name: string;
  };
  const studentRaw = app.users;
  const student = (Array.isArray(studentRaw) ? studentRaw[0] : studentRaw) as {
    email: string;
    full_name: string;
  };

  const studentSubject = opts?.isReschedule
    ? "Your Orcred review session has been rescheduled"
    : "Your Orcred review session is scheduled";

  await sendEmail({
    to: student.email,
    subject: studentSubject,
    template: "session_scheduled_student",
    data: {
      student_name: student.full_name,
      project_name: app.project_name,
      session_date: sessionLabel,
      session_url: sessionPageUrl,
    },
  });

  await sendEmail({
    to: reviewer.email,
    subject: opts?.isReschedule
      ? `Session rescheduled: ${app.project_name}`
      : `Session confirmed: ${app.project_name}`,
    template: "session_assigned_reviewer",
    data: {
      reviewer_name: reviewer.full_name,
      project_name: app.project_name,
      tech_stack: app.tech_stack ?? "",
      session_date: sessionLabel,
      session_url: sessionPageUrl,
    },
  });

  return { session_date: sessionDate, previous_time: previousTime };
}
