import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = createServiceClient();

  // Verify idea belongs to this student
  const { data: idea } = await supabase
    .from("project_ideas")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", session.id)
    .single();

  if (!idea) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Deactivate all, then activate the selected one
  await supabase
    .from("project_ideas")
    .update({ is_active: false })
    .eq("user_id", session.id);

  const { error } = await supabase
    .from("project_ideas")
    .update({ is_active: true })
    .eq("id", id)
    .eq("user_id", session.id);

  if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });

  return NextResponse.json({ success: true });
}
