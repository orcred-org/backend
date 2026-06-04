import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp } from "@/lib/auth/session";
import { updateReviewerSchema } from "@/lib/validators/admin";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAllowedAdminIp(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const session = await getSessionWithRole();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = updateReviewerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createServiceClient();

  if (parsed.data.action === "terminate") {
    // Disable Supabase Auth user entirely
    await supabase.auth.admin.updateUser(id, { ban_duration: "876600h" }); // 100 years
  }

  // Log action in user record (could extend schema with a status field)
  // For now just returns success — admin tracks terminations manually
  return NextResponse.json({ success: true, action: parsed.data.action });
}
