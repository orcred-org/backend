import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";

type UserRow = {
  id: string;
  email: string;
  account_type: string;
  full_name: string | null;
  college?: string | null;
  graduation_year?: number | null;
  linkedin_url?: string | null;
  current_company?: string | null;
  current_role?: string | null;
  years_experience?: number | null;
  expertise?: string | null;
  timezone?: string | null;
  reviewer_onboarding_complete?: boolean;
  created_at: string;
  consent_given?: boolean;
  consent_at?: string | null;
};

function isMissingColumnError(message?: string): boolean {
  if (!message) return false;
  return message.includes("does not exist") || message.includes("schema cache");
}

async function fetchUserById(supabase: ReturnType<typeof createServiceClient>, id: string) {
  const profileSelect = `
    id, email, account_type, full_name, college, graduation_year, linkedin_url,
    current_company, current_role, years_experience, expertise, timezone,
    reviewer_onboarding_complete, created_at, consent_given, consent_at
  `;

  const baseSelect = `
    id, email, account_type, full_name, college, graduation_year, linkedin_url,
    created_at, consent_given, consent_at
  `;

  let { data, error } = await supabase
    .from("users")
    .select(profileSelect)
    .eq("id", id)
    .single();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from("users")
      .select(baseSelect)
      .eq("id", id)
      .single());
  }

  return { user: data as UserRow | null, error };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { user, error } = await fetchUserById(supabase, id);

  if (error) {
    console.error("[admin/users]", id, error.message);
    if (error.code === "PGRST116") {
      return corsJson(req, { success: false, error: "User not found" }, 404);
    }
    return corsJson(req, { success: false, error: "Failed to fetch user" }, 500);
  }

  if (!user) {
    return corsJson(req, { success: false, error: "User not found" }, 404);
  }

  if (user.account_type === "student") {
    const [{ data: applications }, { data: ideas }, { data: credentials }] = await Promise.all([
      supabase
        .from("applications")
        .select(`
          id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
          github_url, loom_url, build_decision_1, build_decision_2, build_decision_3,
          what_broke, ai_tools_used, availability, recording_consent,
          scores (
            total_score, final_score, passed,
            technical_depth, communication, reproducibility, problem_solving,
            feedback_td, feedback_comm, feedback_repro, feedback_ps,
            submitted_at
          ),
          credentials (credential_id, credential_url, issued_at, linkedin_added),
          reviewer_assignments (
            session_date, status,
            reviewers:reviewer_id (full_name, email)
          )
        `)
        .eq("user_id", id)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("project_ideas")
        .select("id, project_name, tech_stack, description, is_active, generated_at")
        .eq("user_id", id)
        .order("generated_at", { ascending: false }),
      supabase
        .from("credentials")
        .select("credential_id, credential_url, issued_at, linkedin_added, application_id")
        .eq("user_id", id)
        .order("issued_at", { ascending: false }),
    ]);

    return corsJson(req, {
      success: true,
      data: {
        user,
        applications: applications ?? [],
        project_ideas: ideas ?? [],
        credentials: credentials ?? [],
      },
    });
  }

  if (user.account_type === "reviewer") {
    const [{ data: assignments }, { data: scores }] = await Promise.all([
      supabase
        .from("reviewer_assignments")
        .select(`
          id, session_date, status, assigned_at,
          applications:application_id (
            id, project_name, tech_stack, status, submitted_at,
            users:user_id (full_name, email)
          )
        `)
        .eq("reviewer_id", id)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("scores")
        .select(`
          total_score, final_score, passed, submitted_at, is_borderline,
          applications:application_id (project_name)
        `)
        .eq("reviewer_id", id)
        .order("submitted_at", { ascending: false }),
    ]);

    const assignmentList = assignments ?? [];
    const completed = assignmentList.filter((a) => a.status === "completed").length;
    const scoreList = scores ?? [];
    const avgScore = scoreList.length
      ? Math.round(scoreList.reduce((s, r) => s + (r.final_score ?? r.total_score), 0) / scoreList.length)
      : null;
    const passRate = scoreList.length
      ? Math.round((scoreList.filter((s) => s.passed).length / scoreList.length) * 100)
      : null;

    return corsJson(req, {
      success: true,
      data: {
        user,
        assignments: assignmentList,
        scores: scoreList,
        stats: {
          sessions_completed: completed,
          total_assignments: assignmentList.length,
          average_score: avgScore,
          pass_rate: passRate,
        },
      },
    });
  }

  return corsJson(req, { success: true, data: { user } });
}
