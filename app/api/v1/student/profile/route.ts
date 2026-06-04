import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";
import { updateProfileSchema } from "@/lib/validators/student";

export async function GET() {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, college, graduation_year, linkedin_url, created_at, consent_given, consent_at")
    .eq("id", session.id)
    .single();

  if (error) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Calculate profile completion
  const fields = [data.full_name, data.college, data.graduation_year, data.linkedin_url];
  const filled = fields.filter(Boolean).length;
  const completion = Math.round((filled / fields.length) * 100);

  return NextResponse.json({ success: true, data: { ...data, profile_completion: completion } });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update(parsed.data)
    .eq("id", session.id)
    .select("id, email, full_name, college, graduation_year, linkedin_url")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
