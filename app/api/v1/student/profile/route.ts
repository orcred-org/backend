import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { updateProfileSchema } from "@/lib/validators/student";

function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export async function GET() {
  try {
    const session = await getSessionWithRole();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[student/profile GET]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

    const raw = typeof body === "object" && body !== null ? { ...body as Record<string, unknown> } : body;
    if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).linkedin_url === "string") {
      (raw as Record<string, unknown>).linkedin_url = normaliseUrl(
        (raw as Record<string, unknown>).linkedin_url as string,
      );
    }

    const parsed = updateProfileSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("users")
      .update(parsed.data)
      .eq("id", session.id)
      .select("id, email, full_name, college, graduation_year, linkedin_url")
      .single();

    if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[student/profile PUT]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
