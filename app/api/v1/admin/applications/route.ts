import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp } from "@/lib/auth/session";
import { adminByIp } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success: rateLimitOk } = await adminByIp.limit(ip);
  if (!rateLimitOk) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });

  const session = await getSessionWithRole();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status    = searchParams.get("status");
  const search    = searchParams.get("search");
  const dateFrom  = searchParams.get("date_from");
  const dateTo    = searchParams.get("date_to");
  const page      = parseInt(searchParams.get("page") || "1");
  const limit     = 50;

  const supabase = createServiceClient();

  let query = supabase
    .from("applications")
    .select(`
      id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
      users:user_id (full_name, email),
      reviewer_assignments (
        reviewer_id, session_date, status,
        reviewers:reviewer_id (full_name)
      ),
      scores (total_score, final_score, passed)
    `, { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status)   query = query.eq("status", status);
  if (search)   query = query.ilike("project_name", `%${search}%`);
  if (dateFrom) query = query.gte("submitted_at", dateFrom);
  if (dateTo)   query = query.lte("submitted_at", dateTo);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

  return NextResponse.json({ success: true, data, total: count, page, limit });
}
