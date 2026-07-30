import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { paymentSubmitSchema } from "@/lib/validators/student";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = paymentSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id, utr_number } = parsed.data;

  const supabase = createServiceClient();

  // Verify application belongs to this student and is in submitted state
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, user_id")
    .eq("id", application_id)
    .eq("user_id", session.id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  if (application.status !== "submitted") {
    return NextResponse.json({ success: false, error: "Payment already submitted" }, { status: 409 });
  }

  // Save UTR — admin will manually confirm
  const { error } = await supabase
    .from("applications")
    .update({
      utr_number,
      status: "payment_pending",
    })
    .eq("id", application_id)
    .eq("user_id", session.id);

  if (error) return NextResponse.json({ success: false, error: "Failed to save" }, { status: 500 });

  return NextResponse.json({ success: true });
}
