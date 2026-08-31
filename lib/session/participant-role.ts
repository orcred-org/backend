import { isDevFullAccess } from "@/lib/auth/devAccess";

export type ParticipantRole = "reviewer" | "student" | "admin";

/**
 * Resolve live-session participant role.
 * When `requestedAs` is set, it always wins (required for dev full-access testing
 * where one account is both reviewer and student on the same assignment).
 */
export function resolveParticipantRole(
  session: { id: string; email: string; role: string },
  assignment: { reviewer_id: string },
  appUserId: string | undefined,
  requestedAs: ParticipantRole | null,
): ParticipantRole | null {
  const isReviewer = session.id === assignment.reviewer_id;
  const isStudent = !!appUserId && session.id === appUserId;
  const isAdmin = session.role === "admin";
  const dev = isDevFullAccess(session.email);

  if (requestedAs === "admin") {
    if (isAdmin) return "admin";
    return null;
  }

  if (requestedAs === "reviewer") {
    if (isReviewer || dev) return "reviewer";
    return null;
  }

  if (requestedAs === "student") {
    if (isStudent || dev) return "student";
    return null;
  }

  // No ?as= hint — only allow unambiguous real assignments
  if (isReviewer && !isStudent && (session.role === "reviewer" || dev)) return "reviewer";
  if (isStudent && !isReviewer && (session.role === "student" || dev)) return "student";

  // Same user is both reviewer and student (common in local dev) — must pass ?as=
  if (dev && isReviewer && isStudent) return null;

  if (dev) {
    if (isReviewer) return "reviewer";
    if (isStudent) return "student";
  }

  if (isReviewer && session.role === "reviewer") return "reviewer";
  if (isStudent && session.role === "student") return "student";

  return null;
}

export function participantRoleError(requestedAs: ParticipantRole | null): string {
  if (requestedAs === "admin") {
    return "Admin access required to observe this session.";
  }
  if (requestedAs) {
    return `You cannot join this session as ${requestedAs}.`;
  }
  return "Add ?as=reviewer, ?as=student, or ?as=admin to the URL.";
}
