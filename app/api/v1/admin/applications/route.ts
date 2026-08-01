import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { adminByIp } from "@/lib/ratelimit";
import { corsJson } from "@/lib/cors";

export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success: rateLimitOk } = await adminByIp.limit(ip);
  if (!rateLimitOk) return corsJson(req, { success: false, error: "Too many requests" }, 429);

  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const { searchParams } = new URL(req.url);
  const status    = searchParams.get("status");
  const search    = searchParams.get("search");
  const dateFrom  = searchParams.get("date_from");
  const dateTo    = searchParams.get("date_to");
  const page      = parseInt(searchParams.get("page") || "1");
  const limit     = 10;

  const supabase = createServiceClient();

  const baseSelect = `
      id, user_id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
      users:user_id (id, full_name, email),
      reviewer_assignments (
        reviewer_id, session_date, status,
        reviewers:reviewer_id (full_name)
      ),
      scores (total_score, final_score, passed)
    `;

  const workflowSelect = `
      id, user_id, project_name, tech_stack, status, submitted_at, payment_at, utr_number,
      users:user_id (id, full_name, email),
      reviewer_assignments (
        reviewer_id, session_date, status, workflow_stage, proposed_session_at, proposed_session_notes, student_code,
        reviewers:reviewer_id (full_name)
      ),
      scores (total_score, final_score, passed)
    `;

  let query = supabase
    .from("applications")
    .select(workflowSelect, { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status)   query = query.eq("status", status);
  if (search)   query = query.ilike("project_name", `%${search}%`);
  if (dateFrom) query = query.gte("submitted_at", dateFrom);
  if (dateTo)   query = query.lte("submitted_at", dateTo);

  let { data, error, count } = await query;

  if (error?.message?.includes("workflow_stage") || error?.message?.includes("does not exist")) {
    let fallback = supabase
      .from("applications")
      .select(baseSelect, { count: "exact" })
      .order("submitted_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status)   fallback = fallback.eq("status", status);
    if (search)   fallback = fallback.ilike("project_name", `%${search}%`);
    if (dateFrom) fallback = fallback.gte("submitted_at", dateFrom);
    if (dateTo)   fallback = fallback.lte("submitted_at", dateTo);
    const fallbackResult = await fallback;
    data = fallbackResult.data as typeof data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) {
    console.error("[admin/applications]", error.message);
    return corsJson(req, { success: false, error: error.message || "Failed to fetch" }, 500);
  }

  return corsJson(req, { success: true, data, total: count, page, limit });
}
