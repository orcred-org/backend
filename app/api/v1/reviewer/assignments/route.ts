import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

export async function GET() {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "reviewer") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("reviewer_assignments")
    .select(`
      id, assigned_at, session_date, status, daily_room_url,
      applications:application_id (
        id, project_name, tech_stack, submitted_at, status
      )
    `)
    .eq("reviewer_id", session.id)
    .order("assigned_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
