import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "reviewer") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = createServiceClient();

  // Verify this application is assigned to this reviewer
  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, session_date, status, daily_room_url, daily_room_name")
    .eq("application_id", id)
    .eq("reviewer_id", session.id)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Not found or not assigned to you" }, { status: 404 });
  }

  const { data: application } = await supabase
    .from("applications")
    .select(`
      id, project_name, tech_stack, github_url, loom_url,
      build_decision_1, build_decision_2, build_decision_3,
      what_broke, ai_tools_used, submitted_at
    `)
    .eq("id", id)
    .single();

  // Check if score already submitted
  const { data: existingScore } = await supabase
    .from("scores")
    .select("id, submitted_at")
    .eq("application_id", id)
    .maybeSingle();

  // Score form only available after session time has passed
  const sessionTime = new Date(assignment.session_date);
  const now = new Date();
  const canSubmitScore = now > sessionTime && !existingScore;

  // Reveal student identity only after score is locked
  let studentIdentity = null;
  if (existingScore) {
    const { data: student } = await supabase
      .from("applications")
      .select("users:user_id (full_name, college, linkedin_url)")
      .eq("id", id)
      .single();
    studentIdentity = (student?.users as any) ?? null;
  }

  return NextResponse.json({
    success: true,
    data: {
      application,
      assignment,
      can_submit_score: canSubmitScore,
      score_submitted:  !!existingScore,
      student_identity: studentIdentity,
    },
  });
}
