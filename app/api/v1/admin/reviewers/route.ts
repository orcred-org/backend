import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const session = await getSessionWithRole();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: reviewers, error } = await supabase
    .from("users")
    .select("id, full_name, email, linkedin_url, created_at")
    .eq("account_type", "reviewer")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

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

  return NextResponse.json({ success: true, data: enriched });
}
