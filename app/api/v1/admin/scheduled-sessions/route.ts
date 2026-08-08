import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { isMissingWorkflowColumn, studentCodeFromApp } from "@/lib/workflow";

export type CalendarSessionStatus =
  | "done"
  | "skipped"
  | "today"
  | "rescheduled_past"
  | "upcoming";

type AssignmentRow = {
  id: string;
  session_date: string;
  daily_room_url?: string | null;
  daily_room_name?: string | null;
  student_code?: string | null;
  workflow_stage?: string | null;
  status: string;
  session_completed_at?: string | null;
  proposed_session_notes?: string | null;
  proposed_session_at?: string | null;
  applications: {
    id: string;
    project_name: string;
    status: string;
    users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  } | {
    id: string;
    project_name: string;
    status: string;
    users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  }[] | null;
  reviewers: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export type CalendarSessionPayload = {
  assignment_id: string;
  application_id: string;
  project_name: string;
  session_date: string;
  calendar_status: CalendarSessionStatus;
  is_ghost?: boolean;
  moved_to_date?: string | null;
  assignment_status: string;
  workflow_stage?: string | null;
  daily_room_url?: string | null;
  student_code?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
};

const SESSION_DONE_STAGES = new Set([
  "session_done",
  "score_submitted",
  "score_approved",
  "completed",
]);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function parsePreviousTimes(notes: string | null | undefined): Date[] {
  if (!notes) return [];
  const out: Date[] = [];
  const re = /Previous time:\s*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(notes)) !== null) {
    const d = new Date(m[1].trim());
    if (!Number.isNaN(d.getTime())) out.push(d);
  }
  return out;
}

function classifySession(row: AssignmentRow, now: Date): CalendarSessionStatus {
  const sessionAt = new Date(row.session_date);
  const isNoShow = row.status === "no_show_student" || row.status === "no_show_reviewer";
  const isDone =
    row.status === "completed"
    || !!row.session_completed_at
    || (row.workflow_stage != null && SESSION_DONE_STAGES.has(row.workflow_stage));

  if (isDone) return "done";
  if (isNoShow) return "skipped";

  if (sameCalendarDay(sessionAt, now)) return "today";

  if (sessionAt.getTime() < now.getTime()) return "skipped";

  return "upcoming";
}

function mapRowBase(row: AssignmentRow) {
  const app = Array.isArray(row.applications) ? row.applications[0] : row.applications;
  const reviewer = Array.isArray(row.reviewers) ? row.reviewers[0] : row.reviewers;
  const student = Array.isArray(app?.users) ? app.users[0] : app?.users;
  return {
    assignment_id: row.id,
    application_id: app?.id ?? "",
    project_name: app?.project_name ?? "Unknown project",
    session_date: row.session_date,
    assignment_status: row.status,
    workflow_stage: row.workflow_stage ?? null,
    daily_room_url: row.daily_room_url ?? null,
    student_code: row.student_code ?? (app?.id ? studentCodeFromApp(app.id) : null),
    student_name: student?.full_name ?? null,
    student_email: student?.email ?? null,
    reviewer_name: reviewer?.full_name ?? null,
    reviewer_email: reviewer?.email ?? null,
  };
}

function inRange(iso: string, from: string | null, to: string | null): boolean {
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

async function fetchCalendarAssignments(
  supabase: ReturnType<typeof createServiceClient>,
  from: string | null,
  to: string | null,
) {
  const baseSelect = `
    id, session_date, daily_room_url, status,
    applications:application_id (
      id, project_name, status,
      users:user_id (full_name, email)
    ),
    reviewers:reviewer_id (full_name, email)
  `;

  const workflowSelect = `
    id, session_date, daily_room_url, daily_room_name, student_code, workflow_stage, status,
    session_completed_at, proposed_session_notes, proposed_session_at,
    applications:application_id (
      id, project_name, status,
      users:user_id (full_name, email)
    ),
    reviewers:reviewer_id (full_name, email)
  `;

  const runPrimary = (select: string) => {
    let query = supabase
      .from("reviewer_assignments")
      .select(select)
      .not("session_date", "is", null)
      .order("session_date", { ascending: true });

    if (from) query = query.gte("session_date", from);
    if (to) query = query.lte("session_date", to);
    return query;
  };

  const runRescheduleNotes = (select: string) =>
    supabase
      .from("reviewer_assignments")
      .select(select)
      .not("session_date", "is", null)
      .ilike("proposed_session_notes", "%Previous time:%");

  let { data, error } = await runPrimary(workflowSelect);

  if (error && isMissingWorkflowColumn(error.message)) {
    ({ data, error } = await runPrimary(baseSelect));
  }

  if (error) return { data: null as AssignmentRow[] | null, error };

  let noteRows: AssignmentRow[] = [];
  const notesRes = await runRescheduleNotes(workflowSelect);
  if (!notesRes.error) {
    noteRows = (notesRes.data ?? []) as unknown as AssignmentRow[];
  } else if (isMissingWorkflowColumn(notesRes.error.message)) {
    const fallback = await runRescheduleNotes(baseSelect);
    if (!fallback.error) noteRows = (fallback.data ?? []) as unknown as AssignmentRow[];
  }

  const byId = new Map<string, AssignmentRow>();
  for (const row of (data ?? []) as unknown as AssignmentRow[]) byId.set(row.id, row);
  for (const row of noteRows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }

  return { data: [...byId.values()], error: null };
}

/** Past + upcoming admin-approved sessions for the calendar (includes rescheduled ghost slots). */
export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = createServiceClient();
  const { data, error } = await fetchCalendarAssignments(supabase, from, to);

  if (error) {
    console.error("[admin/scheduled-sessions]", error.message);
    return corsJson(req, { success: false, error: "Failed to fetch sessions" }, 500);
  }

  const now = new Date();
  const sessions: CalendarSessionPayload[] = [];
  const ghostKeys = new Set<string>();

  for (const row of data ?? []) {
    const base = mapRowBase(row);
    const currentDate = new Date(row.session_date);

    if (inRange(row.session_date, from, to)) {
      sessions.push({
        ...base,
        calendar_status: classifySession(row, now),
      });
    }

    const previousTimes = parsePreviousTimes(row.proposed_session_notes);
    for (const prev of previousTimes) {
      if (sameCalendarDay(prev, currentDate)) continue;
      const prevIso = prev.toISOString();
      if (!inRange(prevIso, from, to)) continue;

      const ghostKey = `${row.id}:${prevIso}`;
      if (ghostKeys.has(ghostKey)) continue;
      ghostKeys.add(ghostKey);

      sessions.push({
        ...base,
        session_date: prevIso,
        calendar_status: "rescheduled_past",
        is_ghost: true,
        moved_to_date: row.session_date,
      });
    }
  }

  sessions.sort(
    (a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime(),
  );

  return corsJson(req, { success: true, data: sessions });
}
