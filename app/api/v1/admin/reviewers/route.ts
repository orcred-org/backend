import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { isMissingSchemaError } from "@/lib/db/schemaFallback";
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

  const profileSelect =
    "id, full_name, email, linkedin_url, created_at, account_type, reviewer_onboarding_complete";
  const baseSelect = "id, full_name, email, linkedin_url, created_at, account_type";

  const result = await supabase
    .from("users")
    .select(profileSelect)
    .in("account_type", ["reviewer", "admin"])
    .order("created_at", { ascending: false });

  let reviewers: typeof result.data = result.data;
  let error = result.error;

  if (error && isMissingSchemaError(error.message)) {
    const fallback = await supabase
      .from("users")
      .select(baseSelect)
      .in("account_type", ["reviewer", "admin"])
      .order("created_at", { ascending: false });
    reviewers = fallback.data as typeof result.data;
    error = fallback.error;
  }

  // Admins only appear here once reviewer onboarding is complete (when column exists).
  const filtered = (reviewers ?? []).filter((r) => {
    if (r.account_type === "reviewer") return true;
    if (r.account_type === "admin") {
      const complete = (r as { reviewer_onboarding_complete?: boolean }).reviewer_onboarding_complete;
      return complete === true;
    }
    return false;
  });

  if (error) {
    console.error("[admin/reviewers]", error.message);
    return corsJson(req, { success: false, error: "Failed to fetch" }, 500);
  }

  // Enrich with session stats per reviewer
  const enriched = await Promise.all(
    filtered.map(async (reviewer) => {
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
