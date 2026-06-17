import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("credentials")
    .select(`
      id, credential_id, credential_url, issued_at, linkedin_added, linkedin_added_at, public_opt_in, hash,
      applications:application_id (
        project_name, tech_stack
      ),
      scores:application_id (
        total_score, final_score, passed,
        technical_depth, communication, reproducibility, originality,
        feedback_td, feedback_comm, feedback_repro, feedback_orig
      )
    `)
    .eq("id", id)
    .eq("user_id", session.id)  // RLS: student can only see own credential
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}
