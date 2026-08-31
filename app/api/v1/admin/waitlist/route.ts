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
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;

  const supabase = createServiceClient();

  let query = supabase
    .from("waitlist_entries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq("status", status);
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%,domain.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;

  if (error) {
    if (error.message.includes("waitlist_entries") && error.message.includes("does not exist")) {
      return corsJson(req, {
        success: true,
        data: [],
        total: 0,
        page,
        limit,
        migration_required: true,
      });
    }
    console.error("[admin/waitlist]", error.message);
    return corsJson(req, { success: false, error: error.message }, 500);
  }

  return corsJson(req, { success: true, data, total: count, page, limit });
}
