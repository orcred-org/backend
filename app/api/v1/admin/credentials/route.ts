import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const session = await getSessionWithRole();
  if (!allowsRole(session, "admin")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("credentials")
    .select(`
      id, credential_id, credential_url, issued_at, linkedin_added, linkedin_added_at, public_opt_in,
      users:user_id (full_name, email),
      applications:application_id (project_name, tech_stack),
      scores:application_id (final_score, total_score, passed),
      placement_tracking:user_id (placed, company, role)
    `)
    .order("issued_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
