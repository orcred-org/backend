/** Join window opens 24h before scheduled start. Live call capped at 40 minutes from scheduled start. */
export { SESSION_DURATION_MINUTES, EARLY_END_BUFFER_MINUTES } from "@/lib/session/audit";
export {
  getScheduledEndMs,
  joinOffsetMinutes,
  bothJoinedAt,
  actualMeetingMinutes,
  requiresEarlyEndReason,
  buildSessionJoinAudit,
  getSessionTimerSnapshot,
} from "@/lib/session/audit";
export type { SessionJoinAudit, SessionTimerSnapshot } from "@/lib/session/audit";

import { getScheduledEndMs, getSessionTimerSnapshot } from "@/lib/session/audit";

export const SESSION_JOIN_HOURS_BEFORE = 24;

/** @deprecated use getScheduledEndMs */
export function getSessionEndMs(sessionDate: string): number {
  return getScheduledEndMs(sessionDate);
}

export function getSessionTimerState(
  sessionDate: string | null | undefined,
  opts?: {
    reviewerJoinedAt?: string | null;
    studentJoinedAt?: string | null;
  },
) {
  const snap = getSessionTimerSnapshot(sessionDate, opts);
  return {
    durationMinutes: snap.durationMinutes,
    endsAt: snap.scheduledEndsAt,
    remainingMs: snap.remainingMs,
    timeExpired: snap.timeExpired,
    started: snap.started,
    reviewerJoinOffsetMin: snap.reviewerJoinOffsetMin,
    studentJoinOffsetMin: snap.studentJoinOffsetMin,
    bothJoinedAt: snap.bothJoinedAt,
    waitingForReviewer: snap.waitingForReviewer,
    waitingForStudent: snap.waitingForStudent,
  };
}

export function getSessionJoinState(
  sessionDate: string | null | undefined,
  opts?: { sessionDone?: boolean },
): {
  canJoin: boolean;
  message: string;
  opensAt?: string;
} {
  if (opts?.sessionDone) {
    return {
      canJoin: false,
      message: "This session has ended. The meeting is no longer available — review your notes below.",
    };
  }

  if (!sessionDate) {
    return { canJoin: false, message: "Session time is not set yet." };
  }

  const sessionTime = new Date(sessionDate);
  if (Number.isNaN(sessionTime.getTime())) {
    return { canJoin: false, message: "Invalid session time." };
  }

  const now = Date.now();
  const startMs = sessionTime.getTime();
  const opensMs = startMs - SESSION_JOIN_HOURS_BEFORE * 60 * 60 * 1000;
  const endMs = getScheduledEndMs(sessionDate);

  if (now < opensMs) {
    const opensAt = new Date(opensMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    return {
      canJoin: false,
      opensAt,
      message: `Join link opens 24 hours before your session (${opensAt} IST).`,
    };
  }

  if (now >= endMs) {
    return {
      canJoin: false,
      message: `The ${getSessionTimerSnapshot(sessionDate).durationMinutes}-minute session window has ended.`,
    };
  }

  return { canJoin: true, message: "You can join the session now." };
}
