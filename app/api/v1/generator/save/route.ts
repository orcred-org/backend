import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";
import { saveIdeaSchema } from "@/lib/validators/generator";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = saveIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createServiceClient();

  // Deactivate current active idea
  await supabase
    .from("project_ideas")
    .update({ is_active: false })
    .eq("user_id", session.id)
    .eq("is_active", true);

  // Save new idea as active
  const { data, error } = await supabase
    .from("project_ideas")
    .insert({
      user_id:      session.id,
      ...parsed.data,
      is_active:    true,
      generated_at: new Date().toISOString(),
    })
    .select("id, project_name, tech_stack, difficulty, is_active")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Save failed" }, { status: 500 });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
