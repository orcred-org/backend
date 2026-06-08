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
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    appsAll,
    appsThisMonth,
    appsLastMonth,
    scoresAll,
    credentialsAll,
    linkedinAdded,
    paymentsAll,
    paymentsThisMonth,
  ] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact" }),
    supabase.from("applications").select("id", { count: "exact" }).gte("submitted_at", startOfMonth),
    supabase.from("applications").select("id", { count: "exact" }).gte("submitted_at", startOfLastMonth).lt("submitted_at", startOfMonth),
    supabase.from("scores").select("total_score, final_score, passed"),
    supabase.from("credentials").select("id", { count: "exact" }),
    supabase.from("credentials").select("id", { count: "exact" }).eq("linkedin_added", true),
    supabase.from("applications").select("payment_amount").not("payment_at", "is", null),
    supabase.from("applications").select("payment_amount").not("payment_at", "is", null).gte("payment_at", startOfMonth),
  ]);

  const allScores = scoresAll.data ?? [];

  const avgScore = allScores.length
    ? Math.round(allScores.reduce((sum, s) => sum + (s.final_score ?? s.total_score ?? 0), 0) / allScores.length)
    : 0;

  const passRateAllTime = allScores.length
    ? Math.round((allScores.filter(s => s.passed).length / allScores.length) * 100)
    : 0;

  const linkedinConversionRate = (credentialsAll.count ?? 0) > 0
    ? Math.round(((linkedinAdded.count ?? 0) / (credentialsAll.count ?? 1)) * 100)
    : 0;

  const revenueAll = (paymentsAll.data ?? []).reduce((sum, r) => sum + (r.payment_amount ?? 0), 0);
  const revenueThisMonth = (paymentsThisMonth.data ?? []).reduce((sum, r) => sum + (r.payment_amount ?? 0), 0);

  return NextResponse.json({
    success: true,
    data: {
      applications: {
        total:      appsAll.count ?? 0,
        this_month: appsThisMonth.count ?? 0,
        last_month: appsLastMonth.count ?? 0,
      },
      scores: {
        average:            avgScore,
        pass_rate_all_time: passRateAllTime,
      },
      credentials: {
        total:                   credentialsAll.count ?? 0,
        linkedin_conversion_pct: linkedinConversionRate,
      },
      revenue: {
        all_time:   revenueAll,
        this_month: revenueThisMonth,
      },
    },
  });
}
