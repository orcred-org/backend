import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

export async function GET() {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_ideas")
    .select("id, project_name, tech_stack, difficulty, is_active, generated_at, source, why_reviewable, key_architectural_decision, what_could_go_wrong")
    .eq("user_id", session.id)
    .order("generated_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
