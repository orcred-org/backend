import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingWorkflowColumn } from "@/lib/workflow";

const FULL_SELECT = `
  id, reviewer_id, application_id, session_date, daily_room_name, daily_room_url, status,
  workflow_stage, session_completed_at, student_session_confirmed_at,
  student_feedback_audio, student_feedback_video, student_feedback_notes,
  reviewer_session_draft, reviewer_session_notes, student_session_notes,
  reviewer_joined_at, student_joined_at,
  reviewer_early_end_reason, student_early_end_reason,
  applications:application_id (
    id, project_name, user_id, tech_stack, github_url, loom_url,
    build_decision_1, build_decision_2, build_decision_3, what_broke, ai_tools_used,
    submitted_at, recording_url
  )
`;

const BASE_SELECT = `
  id, reviewer_id, application_id, session_date, daily_room_name, daily_room_url, status,
  applications:application_id (
    id, project_name, user_id, tech_stack, github_url, loom_url,
    build_decision_1, build_decision_2, build_decision_3, what_broke, ai_tools_used,
    submitted_at, recording_url
  )
`;

export type SessionAssignmentRow = {
  id: string;
  reviewer_id: string;
  application_id: string;
  session_date: string | null;
  daily_room_name: string | null;
  daily_room_url: string | null;
  status: string;
  workflow_stage?: string | null;
  session_completed_at?: string | null;
  student_session_confirmed_at?: string | null;
  student_feedback_audio?: number | null;
  student_feedback_video?: number | null;
  student_feedback_notes?: string | null;
  reviewer_session_draft?: string | null;
  reviewer_session_notes?: string | null;
  student_session_notes?: string | null;
  reviewer_joined_at?: string | null;
  student_joined_at?: string | null;
  reviewer_early_end_reason?: string | null;
  student_early_end_reason?: string | null;
  applications:
    | {
        id: string;
        project_name: string;
        user_id: string;
        tech_stack: string;
        github_url: string;
        loom_url: string;
        build_decision_1: string;
        build_decision_2: string;
        build_decision_3: string;
        what_broke: string;
        ai_tools_used: string;
        submitted_at: string;
        recording_url: string | null;
      }
    | {
        id: string;
        project_name: string;
        user_id: string;
        tech_stack: string;
        github_url: string;
        loom_url: string;
        build_decision_1: string;
        build_decision_2: string;
        build_decision_3: string;
        what_broke: string;
        ai_tools_used: string;
        submitted_at: string;
        recording_url: string | null;
      }[]
    | null;
};

export async function fetchSessionAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<{ data: SessionAssignmentRow | null; error: string | null }> {
  let { data, error } = await supabase
    .from("reviewer_assignments")
    .select(FULL_SELECT)
    .eq("id", assignmentId)
    .maybeSingle();

  if (error && isMissingWorkflowColumn(error.message)) {
    ({ data, error } = await supabase
      .from("reviewer_assignments")
      .select(BASE_SELECT)
      .eq("id", assignmentId)
      .maybeSingle());
  }

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: "Session not found" };
  }

  return { data: data as SessionAssignmentRow, error: null };
}
