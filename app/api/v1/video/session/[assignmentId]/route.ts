import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";
import { createToken } from "@/lib/video";
import { ensureAssignmentDailyRoom } from "@/lib/video/ensure-room";
import { getSessionJoinState, getSessionTimerState } from "@/lib/video/session-access";
import { buildSessionJoinAudit } from "@/lib/session/audit";
import { participantRoleError, resolveParticipantRole } from "@/lib/session/participant-role";
import { fetchSessionAssignment } from "@/lib/session/fetch-assignment";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const session = await getSessionWithRole(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { assignmentId } = await params;
  const requestedAs = req.nextUrl.searchParams.get("as");
  const roleHint =
    requestedAs === "reviewer" || requestedAs === "student" || requestedAs === "admin"
      ? requestedAs
      : null;

  const supabase = createServiceClient();

  const { data: assignment, error: fetchError } = await fetchSessionAssignment(supabase, assignmentId);

  if (fetchError || !assignment) {
    return NextResponse.json(
      { success: false, error: fetchError ?? "Session not found" },
      { status: fetchError === "Session not found" ? 404 : 500 },
    );
  }

  const app = Array.isArray(assignment.applications)
    ? assignment.applications[0]
    : assignment.applications;

  const participantRole = resolveParticipantRole(
    session,
    { reviewer_id: assignment.reviewer_id },
    app?.user_id,
    roleHint,
  );

  if (!participantRole) {
    return NextResponse.json(
      { success: false, error: participantRoleError(roleHint) },
      { status: 403 },
    );
  }

  const { data: scoreRow } = await supabase
    .from("scores")
    .select("id, total_score, passed, submitted_at")
    .eq("application_id", assignment.application_id)
    .maybeSingle();

  const sessionScheduled = !!assignment.session_date;
  const sessionDone =
    !!assignment.session_completed_at
    || assignment.workflow_stage === "session_done"
    || ["score_submitted", "score_approved", "completed"].includes(assignment.workflow_stage ?? "");

  const timer = getSessionTimerState(assignment.session_date, {
    reviewerJoinedAt: assignment.reviewer_joined_at,
    studentJoinedAt: assignment.student_joined_at,
  });
  const joinState = getSessionJoinState(assignment.session_date, { sessionDone });
  const adminObserver = participantRole === "admin";
  const canJoinVideo =
    joinState.canJoin && !sessionDone && !timer.timeExpired && sessionScheduled;

  const audit = buildSessionJoinAudit(assignment.session_date, {
    reviewer_joined_at: assignment.reviewer_joined_at,
    student_joined_at: assignment.student_joined_at,
    session_completed_at: assignment.session_completed_at,
    reviewer_early_end_reason: assignment.reviewer_early_end_reason,
    student_early_end_reason: assignment.student_early_end_reason,
  });

  let dailyRoomUrl = assignment.daily_room_url;
  let dailyRoomName = assignment.daily_room_name;
  let token: string | null = null;
  let roomError: string | null = null;

  if (canJoinVideo && assignment.session_date) {
    try {
      const room = await ensureAssignmentDailyRoom(
        supabase,
        assignmentId,
        assignment.session_date,
      );
      if (room) {
        dailyRoomUrl = room.url;
        dailyRoomName = room.name;
      }
    } catch (err) {
      roomError = (err as Error).message;
      console.error("[video/session] room error:", roomError);
    }
  }

  if (canJoinVideo && dailyRoomName && process.env.DAILY_API_KEY && assignment.session_date) {
    try {
      const isHost = participantRole === "reviewer";
      const displayName =
        participantRole === "admin"
          ? "Orcred Admin"
          : isHost
            ? "Reviewer"
            : "Student";
      const { token: meetingToken } = await createToken(
        dailyRoomName,
        isHost,
        assignment.session_date,
        displayName,
        { observer: participantRole === "admin" },
      );
      token = meetingToken;
    } catch (err) {
      roomError = (err as Error).message;
      console.error("[video/session] token error:", roomError);
    }
  }

  const participantNotes =
    participantRole === "reviewer"
      ? assignment.reviewer_session_notes ?? null
      : participantRole === "student"
        ? assignment.student_session_notes ?? null
        : null;

  return NextResponse.json({
    success: true,
    data: {
      assignment_id: assignment.id,
      application_id: assignment.application_id,
      project_name: app?.project_name ?? null,
      session_date: assignment.session_date,
      daily_room_url: dailyRoomUrl,
      role: participantRole,
      is_host: participantRole === "reviewer",
      is_observer: adminObserver,
      join_window_open: joinState.canJoin && !sessionDone && !timer.timeExpired,
      session_scheduled: sessionScheduled,
      session_done: sessionDone,
      meeting_closed: sessionDone || timer.timeExpired,
      session_completed_at: assignment.session_completed_at,
      student_confirmed_at: assignment.student_session_confirmed_at,
      student_feedback: assignment.student_session_confirmed_at
        ? {
            audio: assignment.student_feedback_audio,
            video: assignment.student_feedback_video,
            notes: assignment.student_feedback_notes,
          }
        : null,
      score_submitted: !!scoreRow,
      score_pending_admin: !!scoreRow && !(scoreRow as { admin_review_status?: string }).admin_review_status,
      can_join: canJoinVideo && !!token && !!dailyRoomUrl,
      join_message: joinState.message,
      opens_at: joinState.opensAt ?? null,
      room_error: roomError,
      token,
      room_name: dailyRoomName,
      recording_url: app?.recording_url ?? null,
      reviewer_session_draft: assignment.reviewer_session_draft ?? null,
      session_notes: participantNotes,
      notes_locked: sessionDone || timer.timeExpired,
      timer: {
        duration_minutes: timer.durationMinutes,
        ends_at: timer.endsAt,
        remaining_ms: timer.remainingMs,
        time_expired: timer.timeExpired,
        started: timer.started,
        reviewer_join_offset_min: timer.reviewerJoinOffsetMin,
        student_join_offset_min: timer.studentJoinOffsetMin,
        both_joined_at: timer.bothJoinedAt,
        waiting_for_reviewer: timer.waitingForReviewer,
        waiting_for_student: timer.waitingForStudent,
      },
      audit,
      score_submitted_at: scoreRow?.submitted_at ?? null,
      requires_early_end_reason: audit?.requires_early_end_reason ?? false,
      reviewer_early_end_reason: assignment.reviewer_early_end_reason ?? null,
      application: app
        ? {
            id: app.id,
            project_name: app.project_name,
            tech_stack: app.tech_stack,
            github_url: app.github_url,
            loom_url: app.loom_url,
            build_decision_1: app.build_decision_1,
            build_decision_2: app.build_decision_2,
            build_decision_3: app.build_decision_3,
            what_broke: app.what_broke,
            ai_tools_used: app.ai_tools_used,
            submitted_at: app.submitted_at,
          }
        : null,
    },
  });
}
