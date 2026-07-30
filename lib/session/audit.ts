/** Shared session timing rules (mirrored in frontend/lib/sessionAccess.ts). */
export const SESSION_DURATION_MINUTES = 40;
export const EARLY_END_BUFFER_MINUTES = 5;

export function getScheduledEndMs(sessionDate: string): number {
  return new Date(sessionDate).getTime() + SESSION_DURATION_MINUTES * 60 * 1000;
}

export function joinOffsetMinutes(sessionDate: string, joinedAt: string): number {
  const startMs = new Date(sessionDate).getTime();
  const joinedMs = new Date(joinedAt).getTime();
  return Math.round((joinedMs - startMs) / 60_000);
}

export function bothJoinedAt(
  reviewerJoinedAt?: string | null,
  studentJoinedAt?: string | null,
): string | null {
  if (!reviewerJoinedAt || !studentJoinedAt) return null;
  const ms = Math.max(new Date(reviewerJoinedAt).getTime(), new Date(studentJoinedAt).getTime());
  return new Date(ms).toISOString();
}

export function actualMeetingMinutes(
  sessionDate: string,
  sessionCompletedAt: string,
  reviewerJoinedAt?: string | null,
  studentJoinedAt?: string | null,
): number {
  const endMs = new Date(sessionCompletedAt).getTime();
  const overlapStart = bothJoinedAt(reviewerJoinedAt, studentJoinedAt);
  const startMs = overlapStart
    ? new Date(overlapStart).getTime()
    : new Date(sessionDate).getTime();
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

/** Session ended more than buffer minutes before the scheduled hard stop. */
export function requiresEarlyEndReason(sessionDate: string, sessionCompletedAt: string): boolean {
  const completedMs = new Date(sessionCompletedAt).getTime();
  const scheduledEndMs = getScheduledEndMs(sessionDate);
  return completedMs < scheduledEndMs - EARLY_END_BUFFER_MINUTES * 60_000;
}

export interface SessionJoinAudit {
  scheduled_at: string;
  scheduled_ends_at: string;
  reviewer_joined_at: string | null;
  student_joined_at: string | null;
  both_joined_at: string | null;
  reviewer_join_offset_min: number | null;
  student_join_offset_min: number | null;
  session_completed_at: string | null;
  actual_meeting_minutes: number | null;
  requires_early_end_reason: boolean;
  reviewer_early_end_reason: string | null;
  student_early_end_reason: string | null;
}

export function buildSessionJoinAudit(
  sessionDate: string | null | undefined,
  fields: {
    reviewer_joined_at?: string | null;
    student_joined_at?: string | null;
    session_completed_at?: string | null;
    reviewer_early_end_reason?: string | null;
    student_early_end_reason?: string | null;
  },
): SessionJoinAudit | null {
  if (!sessionDate) return null;

  const scheduledEndsAt = new Date(getScheduledEndMs(sessionDate)).toISOString();
  const bothAt = bothJoinedAt(fields.reviewer_joined_at, fields.student_joined_at);

  let actualMinutes: number | null = null;
  let needsEarlyReason = false;
  if (fields.session_completed_at) {
    actualMinutes = actualMeetingMinutes(
      sessionDate,
      fields.session_completed_at,
      fields.reviewer_joined_at,
      fields.student_joined_at,
    );
    needsEarlyReason = requiresEarlyEndReason(sessionDate, fields.session_completed_at);
  }

  return {
    scheduled_at: sessionDate,
    scheduled_ends_at: scheduledEndsAt,
    reviewer_joined_at: fields.reviewer_joined_at ?? null,
    student_joined_at: fields.student_joined_at ?? null,
    both_joined_at: bothAt,
    reviewer_join_offset_min: fields.reviewer_joined_at
      ? joinOffsetMinutes(sessionDate, fields.reviewer_joined_at)
      : null,
    student_join_offset_min: fields.student_joined_at
      ? joinOffsetMinutes(sessionDate, fields.student_joined_at)
      : null,
    session_completed_at: fields.session_completed_at ?? null,
    actual_meeting_minutes: actualMinutes,
    requires_early_end_reason: needsEarlyReason,
    reviewer_early_end_reason: fields.reviewer_early_end_reason ?? null,
    student_early_end_reason: fields.student_early_end_reason ?? null,
  };
}

export interface SessionTimerSnapshot {
  durationMinutes: number;
  scheduledEndsAt: string | null;
  remainingMs: number;
  timeExpired: boolean;
  started: boolean;
  reviewerJoinOffsetMin: number | null;
  studentJoinOffsetMin: number | null;
  bothJoinedAt: string | null;
  waitingForReviewer: boolean;
  waitingForStudent: boolean;
}

export function getSessionTimerSnapshot(
  sessionDate: string | null | undefined,
  opts?: {
    reviewerJoinedAt?: string | null;
    studentJoinedAt?: string | null;
  },
): SessionTimerSnapshot {
  const durationMinutes = SESSION_DURATION_MINUTES;
  const empty: SessionTimerSnapshot = {
    durationMinutes,
    scheduledEndsAt: null,
    remainingMs: 0,
    timeExpired: false,
    started: false,
    reviewerJoinOffsetMin: null,
    studentJoinOffsetMin: null,
    bothJoinedAt: null,
    waitingForReviewer: false,
    waitingForStudent: false,
  };

  if (!sessionDate) return empty;

  const startMs = new Date(sessionDate).getTime();
  if (Number.isNaN(startMs)) {
    return { ...empty, timeExpired: true };
  }

  const scheduledEndMs = getScheduledEndMs(sessionDate);
  const now = Date.now();
  const remainingMs = Math.max(0, scheduledEndMs - now);

  const reviewerOffset = opts?.reviewerJoinedAt
    ? joinOffsetMinutes(sessionDate, opts.reviewerJoinedAt)
    : null;
  const studentOffset = opts?.studentJoinedAt
    ? joinOffsetMinutes(sessionDate, opts.studentJoinedAt)
    : null;

  return {
    durationMinutes,
    scheduledEndsAt: new Date(scheduledEndMs).toISOString(),
    remainingMs,
    timeExpired: now >= scheduledEndMs,
    started: now >= startMs,
    reviewerJoinOffsetMin: reviewerOffset,
    studentJoinOffsetMin: studentOffset,
    bothJoinedAt: bothJoinedAt(opts?.reviewerJoinedAt, opts?.studentJoinedAt),
    waitingForReviewer: !!opts?.studentJoinedAt && !opts?.reviewerJoinedAt,
    waitingForStudent: !!opts?.reviewerJoinedAt && !opts?.studentJoinedAt,
  };
}
