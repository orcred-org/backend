import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";

export async function GET() {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();

  const [profileRes, ideaRes, applicationRes, credentialRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, college, graduation_year, linkedin_url")
      .eq("id", session.id)
      .single(),

    supabase
      .from("project_ideas")
      .select("id, project_name, tech_stack, difficulty, why_reviewable, key_architectural_decision, what_could_go_wrong")
      .eq("user_id", session.id)
      .eq("is_active", true)
      .maybeSingle(),

    supabase
      .from("applications")
      .select(`
        id, project_name, tech_stack, status, submitted_at, payment_at, payment_amount,
        utr_number,
        reviewer_assignments (
          id, session_date, status, daily_room_url, workflow_stage, proposed_session_at, proposed_session_notes
        ),
        scores (
          total_score, final_score, technical_depth, communication, reproducibility, problem_solving, passed,
          feedback_td, feedback_comm, feedback_repro, feedback_ps
        )
      `)
      .eq("user_id", session.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("credentials")
      .select("id, credential_id, credential_url, issued_at, linkedin_added, public_opt_in")
      .eq("user_id", session.id)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const fields = [profile?.full_name, profile?.college, profile?.graduation_year, profile?.linkedin_url];
  const profileCompletion = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  const application = applicationRes.data;
  const credential = credentialRes.data;

  let state: 1 | 2 | 3 | 4 | 5 | 6 = 1;
  const assignment = Array.isArray(application?.reviewer_assignments)
    ? application.reviewer_assignments[0]
    : application?.reviewer_assignments;
  if (credential || application?.status === "completed") state = 6;
  else if (application?.status === "scheduled") state = 5;
  else if (application?.status === "reviewer_assigned" || assignment) state = 4;
  else if (application) state = 3;
  else if (ideaRes.data) state = 2;

  // Normalize scores: credential join returns object; application join returns array
  const appScores = Array.isArray(application?.scores)
    ? application.scores[0]
    : application?.scores;

  return NextResponse.json({
    success: true,
    data: {
      state,
      profile: { ...profile, profile_completion: profileCompletion },
      active_idea: ideaRes.data ?? null,
      application: application ?? null,
      application_score: appScores ?? null,
      credential: credential ?? null,
    },
  });
}
