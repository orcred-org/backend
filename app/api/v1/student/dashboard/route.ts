import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

export async function GET() {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();

  // Fetch profile, active project idea, latest application, credential — all in parallel
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
          session_date, status, daily_room_url
        )
      `)
      .eq("user_id", session.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("credentials")
      .select(`
        id, credential_id, credential_url, issued_at, linkedin_added, public_opt_in,
        scores:application_id (
          total_score, final_score, technical_depth, communication, reproducibility, originality, passed,
          feedback_td, feedback_comm, feedback_repro, feedback_orig
        )
      `)
      .eq("user_id", session.id)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const fields = [profile?.full_name, profile?.college, profile?.graduation_year, profile?.linkedin_url];
  const profileCompletion = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  // Determine dashboard state (1–5)
  let state: 1 | 2 | 3 | 4 | 5 = 1;
  if (credentialRes.data) state = 5;
  else if (applicationRes.data?.status === "scheduled") state = 4;
  else if (applicationRes.data) state = 3;
  else if (ideaRes.data) state = 2;

  return NextResponse.json({
    success: true,
    data: {
      state,
      profile: { ...profile, profile_completion: profileCompletion },
      active_idea:   ideaRes.data   ?? null,
      application:   applicationRes.data ?? null,
      credential:    credentialRes.data  ?? null,
    },
  });
}
