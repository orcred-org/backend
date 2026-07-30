import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";

export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const supabase = createServiceClient();

  // Reviewers + admins who completed reviewer onboarding (demo accounts use admin + reviewer profile)
  const { data: reviewers, error } = await supabase
    .from("users")
    .select("id, full_name, email, linkedin_url, created_at, account_type, reviewer_onboarding_complete")
    .or("account_type.eq.reviewer,and(account_type.eq.admin,reviewer_onboarding_complete.eq.true)")
    .order("created_at", { ascending: false });

  if (error) return corsJson(req, { success: false, error: "Failed to fetch" }, 500);

  // Enrich with session stats per reviewer
  const enriched = await Promise.all(
    (reviewers ?? []).map(async (reviewer) => {
      const [assignmentsRes, scoresRes] = await Promise.all([
        supabase
          .from("reviewer_assignments")
          .select("id, status")
          .eq("reviewer_id", reviewer.id),
        supabase
          .from("scores")
          .select("total_score, final_score, passed")
          .eq("reviewer_id", reviewer.id),
      ]);

      const assignments = assignmentsRes.data ?? [];
      const scores      = scoresRes.data ?? [];

      const completed   = assignments.filter(a => a.status === "completed").length;
      const avgScore    = scores.length
        ? Math.round(scores.reduce((s, r) => s + (r.final_score ?? r.total_score), 0) / scores.length)
        : null;
      const passRate    = scores.length
        ? Math.round((scores.filter(s => s.passed).length / scores.length) * 100)
        : null;

      return {
        ...reviewer,
        sessions_completed: completed,
        average_score:      avgScore,
        pass_rate:          passRate,
      };
    })
  );

  return corsJson(req, { success: true, data: enriched });
}
