import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskStatus = "new" | "todo" | "in_progress" | "done" | "cancelled" | "under_review";

export type WorkflowStage =
  | "assigned"
  | "accepted"
  | "session_proposed"
  | "session_approved"
  | "session_done"
  | "score_submitted"
  | "score_approved"
  | "score_revision"
  | "under_review"
  | "completed";

export const WORKFLOW_TASK_DEFS = [
  { key: "review_submission", title: "Review candidate application", order: 1 },
  { key: "accept_candidate", title: "Accept candidate", order: 2 },
  { key: "propose_session", title: "Propose session date & time", order: 3 },
  { key: "conduct_session", title: "Mark session as done", order: 4 },
  { key: "submit_score", title: "Submit review scores", order: 5 },
] as const;

export type WorkflowTaskKey = (typeof WORKFLOW_TASK_DEFS)[number]["key"];

export function studentCodeFromApp(applicationId: string): string {
  return `STU-${applicationId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export async function seedWorkflowTasks(
  supabase: SupabaseClient,
  params: {
    assignmentId: string;
    applicationId: string;
    reviewerId: string;
    studentCode: string;
  },
) {
  const rows = WORKFLOW_TASK_DEFS.map((t) => ({
    assignment_id: params.assignmentId,
    application_id: params.applicationId,
    reviewer_id: params.reviewerId,
    task_key: t.key,
    title: `[${params.studentCode}] ${t.title}`,
    sort_order: t.order,
    unlocked: t.order === 1,
    status: t.order === 1 ? "todo" : "new",
  }));

  const { error } = await supabase.from("reviewer_tasks").insert(rows);
  if (error) throw new Error(`Failed to seed workflow tasks: ${error.message}`);
}

export async function completeTask(
  supabase: SupabaseClient,
  taskId: string,
  reviewerId: string,
) {
  const { data: task, error } = await supabase
    .from("reviewer_tasks")
    .select("id, assignment_id, task_key, sort_order, unlocked")
    .eq("id", taskId)
    .eq("reviewer_id", reviewerId)
    .single();

  if (error || !task) throw new Error("Task not found");
  if (!task.unlocked) throw new Error("Complete previous steps first");

  await supabase
    .from("reviewer_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", taskId);

  const next = WORKFLOW_TASK_DEFS.find((t) => t.order === task.sort_order + 1);
  if (next) {
    await supabase
      .from("reviewer_tasks")
      .update({ unlocked: true, status: "todo" })
      .eq("assignment_id", task.assignment_id)
      .eq("task_key", next.key);
  }

  return { task_key: task.task_key as WorkflowTaskKey, assignment_id: task.assignment_id };
}

export async function setAssignmentStage(
  supabase: SupabaseClient,
  assignmentId: string,
  stage: WorkflowStage,
  appStatus?: string,
) {
  const assignmentUpdate = await supabase
    .from("reviewer_assignments")
    .update({ workflow_stage: stage })
    .eq("id", assignmentId);

  if (assignmentUpdate.error?.message?.includes("workflow_stage")) {
    if (!appStatus) return;
    const { data: a } = await supabase
      .from("reviewer_assignments")
      .select("application_id")
      .eq("id", assignmentId)
      .single();
    if (a?.application_id) {
      await supabase.from("applications").update({ status: appStatus }).eq("id", a.application_id);
    }
    return;
  }

  const { data: a } = await supabase
    .from("reviewer_assignments")
    .select("application_id")
    .eq("id", assignmentId)
    .single();

  if (a?.application_id) {
    const appUpdate: { status?: string; workflow_stage?: string } = {};
    if (appStatus) appUpdate.status = appStatus;
    appUpdate.workflow_stage = stage;

    const { error } = await supabase
      .from("applications")
      .update(appUpdate)
      .eq("id", a.application_id);

    if (error?.message?.includes("workflow_stage")) {
      await supabase
        .from("applications")
        .update(appStatus ? { status: appStatus } : {})
        .eq("id", a.application_id);
    }
  }
}

export function isMissingWorkflowColumn(message?: string): boolean {
  if (!message) return false;
  return (
    message.includes("does not exist") ||
    message.includes("Could not find") ||
    message.includes("reviewer_tasks") ||
    message.includes("workflow_stage") ||
    message.includes("reviewer_session_notes") ||
    message.includes("reviewer_session_draft") ||
    message.includes("student_session_notes") ||
    message.includes("session_completed_at") ||
    message.includes("reviewer_joined_at") ||
    message.includes("student_code") ||
    message.includes("admin_review_status") ||
    message.includes("schema cache")
  );
}

export type SyntheticTask = {
  id: string;
  task_key: string;
  title: string;
  status: TaskStatus;
  sort_order: number;
  unlocked: boolean;
  is_custom: boolean;
  notes: string | null;
  assignment_id: string;
  application_id: string;
};

export function inferWorkflowStage(assignment: {
  status: string;
  session_date: string | null;
  workflow_stage?: string | null;
  proposed_session_at?: string | null;
  proposed_session_notes?: string | null;
  accepted_at?: string | null;
  session_completed_at?: string | null;
}, applicationStatus?: string): WorkflowStage {
  if (assignment.workflow_stage) return assignment.workflow_stage as WorkflowStage;
  if (applicationStatus === "completed") return "completed";
  if (assignment.session_completed_at) return "session_done";
  if (assignment.status === "scheduled" && assignment.session_date) {
    const past = new Date() > new Date(assignment.session_date);
    return past ? "session_done" : "session_approved";
  }
  if (assignment.proposed_session_notes || assignment.proposed_session_at) return "session_proposed";
  if (assignment.accepted_at) return "accepted";
  if (applicationStatus === "scheduled") return "session_approved";
  if (applicationStatus === "reviewer_assigned") return "assigned";
  return "assigned";
}

const STAGE_DONE_THROUGH: Record<WorkflowStage, number> = {
  assigned: 0,
  accepted: 1,
  session_proposed: 3,
  session_approved: 3,
  session_done: 4,
  score_submitted: 5,
  score_approved: 5,
  score_revision: 4,
  under_review: 4,
  completed: 5,
};

export function resolvedSystemTaskStatus(
  taskKey: WorkflowTaskKey,
  sortOrder: number,
  stage: WorkflowStage,
  dbStatus?: TaskStatus,
): TaskStatus {
  if (dbStatus === "done" || dbStatus === "cancelled") return dbStatus;
  const doneThrough = STAGE_DONE_THROUGH[stage] ?? 0;
  if (sortOrder <= doneThrough) return "done";
  if (sortOrder === doneThrough + 1) return dbStatus === "in_progress" ? "in_progress" : "todo";
  return "new";
}

export async function markSystemTasksDoneThrough(
  supabase: SupabaseClient,
  assignmentId: string,
  throughOrder: number,
) {
  const keys = WORKFLOW_TASK_DEFS.filter((t) => t.order <= throughOrder).map((t) => t.key);
  if (keys.length === 0) return;

  await supabase
    .from("reviewer_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId)
    .in("task_key", keys);

  const next = WORKFLOW_TASK_DEFS.find((t) => t.order === throughOrder + 1);
  if (next) {
    await supabase
      .from("reviewer_tasks")
      .update({ unlocked: true, status: "todo" })
      .eq("assignment_id", assignmentId)
      .eq("task_key", next.key);
  }
}

export function enrichAssignmentWorkflow(
  assignment: Record<string, unknown>,
  applicationId: string,
  applicationStatus?: string,
  reviewerId?: string,
) {
  const stage = inferWorkflowStage(
    assignment as Parameters<typeof inferWorkflowStage>[0],
    applicationStatus,
  );
  assignment.workflow_stage = stage;

  const studentCode =
    (assignment.student_code as string | null)
    ?? studentCodeFromApp(applicationId);

  const rawTasks = assignment.reviewer_tasks;
  const taskList = Array.isArray(rawTasks) ? rawTasks : rawTasks ? [rawTasks] : [];

  if (taskList.length === 0) {
    assignment.reviewer_tasks = synthesizeWorkflowTasks({
      assignmentId: String(assignment.id),
      applicationId,
      reviewerId: reviewerId ?? "",
      studentCode,
      stage,
    });
    return;
  }

  assignment.reviewer_tasks = taskList.map((task) => {
    const t = task as SyntheticTask;
    if (t.is_custom) return t;
    const def = WORKFLOW_TASK_DEFS.find((d) => d.key === t.task_key);
    const order = def?.order ?? t.sort_order ?? 0;
    const status = resolvedSystemTaskStatus(
      t.task_key as WorkflowTaskKey,
      order,
      stage,
      t.status as TaskStatus,
    );
    return {
      ...t,
      status,
      unlocked: status !== "new",
    };
  });
}

export function synthesizeWorkflowTasks(params: {
  assignmentId: string;
  applicationId: string;
  reviewerId: string;
  studentCode?: string | null;
  stage: WorkflowStage;
}): SyntheticTask[] {
  const code = params.studentCode ?? studentCodeFromApp(params.applicationId);
  return WORKFLOW_TASK_DEFS.map((t) => {
    const status = resolvedSystemTaskStatus(t.key, t.order, params.stage);
    return {
      id: `synthetic-${params.assignmentId}-${t.key}`,
      task_key: t.key,
      title: `[${code}] ${t.title}`,
      status,
      sort_order: t.order,
      unlocked: status !== "new",
      is_custom: false,
      notes: null,
      assignment_id: params.assignmentId,
      application_id: params.applicationId,
    };
  });
}
