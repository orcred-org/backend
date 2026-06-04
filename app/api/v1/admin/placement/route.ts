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

  const { data, error } = await supabase
    .from("placement_tracking")
    .select(`
      id, placed, placed_at, company, role, notes,
      followup_30_due, followup_30_sent, followup_30_response,
      followup_60_due, followup_60_sent, followup_60_response,
      followup_90_due, followup_90_sent, followup_90_response,
      users:user_id (full_name, email),
      credentials:credential_id (credential_id, credential_url, issued_at)
    `)
    .order("followup_30_due", { ascending: true });

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
