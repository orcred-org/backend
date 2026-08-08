import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingWorkflowColumn } from "@/lib/workflow";

const REMINDER_MARKER = /\[admin_reminders:(\d+)\]/;
const SUBMITTED_MARKER = /Proposal submitted: (\S+)/;

export function parseProposalSubmittedAt(
  notes: string | null | undefined,
  columnValue: string | null | undefined,
): Date | null {
  if (columnValue) {
    const d = new Date(columnValue);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const match = notes?.match(SUBMITTED_MARKER);
  if (!match) return null;
  const d = new Date(match[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getAdminReminderCount(
  notes: string | null | undefined,
  columnValue: number | null | undefined,
): number {
  if (columnValue != null && !Number.isNaN(columnValue)) return columnValue;
  const match = notes?.match(REMINDER_MARKER);
  return match ? parseInt(match[1], 10) : 0;
}

export function appendReminderMeta(
  notes: string | null | undefined,
  count: number,
): string {
  const cleaned = (notes ?? "").replace(REMINDER_MARKER, "").trim();
  return `[admin_reminders:${count}]${cleaned ? `\n${cleaned}` : ""}`;
}

export function prependProposalSubmittedMeta(
  notes: string | null | undefined,
  submittedAt = new Date().toISOString(),
): string {
  const withoutSubmitted = (notes ?? "")
    .replace(/^Proposal submitted: \S+\n?/, "")
    .trim();
  const header = `Proposal submitted: ${submittedAt}`;
  return withoutSubmitted ? `${header}\n${withoutSubmitted}` : header;
}

export function isSessionConfirmed(params: {
  workflowStage?: string | null;
  assignmentStatus?: string | null;
  applicationStatus?: string | null;
}): boolean {
  if (params.workflowStage === "session_proposed") return false;
  if (params.workflowStage === "session_approved") return true;
  if (params.assignmentStatus === "scheduled") return true;
  if (params.applicationStatus === "scheduled") return true;
  return false;
}

export async function incrementAdminReminderCount(
  supabase: SupabaseClient,
  assignmentId: string,
  currentNotes: string | null | undefined,
  currentCount: number | null | undefined,
): Promise<number> {
  const next = getAdminReminderCount(currentNotes, currentCount) + 1;
  const notes = appendReminderMeta(currentNotes, next);

  const update = await supabase
    .from("reviewer_assignments")
    .update({
      admin_session_reminder_count: next,
      proposed_session_notes: notes,
    })
    .eq("id", assignmentId);

  if (isMissingWorkflowColumn(update.error?.message)) {
    await supabase
      .from("reviewer_assignments")
      .update({ proposed_session_notes: notes })
      .eq("id", assignmentId);
  } else if (update.error) {
    throw new Error(update.error.message);
  }

  return next;
}
