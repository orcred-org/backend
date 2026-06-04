import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp } from "@/lib/auth/session";
import { confirmPaymentSchema } from "@/lib/validators/admin";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const session = await getSessionWithRole();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = confirmPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id } = parsed.data;
  const supabase = createServiceClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, project_name, users:user_id (email, full_name)")
    .eq("id", application_id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  if (application.status !== "payment_pending") {
    return NextResponse.json(
      { success: false, error: "Application is not awaiting payment confirmation" },
      { status: 422 }
    );
  }

  await supabase
    .from("applications")
    .update({
      status:     "payment_confirmed",
      payment_at: new Date().toISOString(),
    })
    .eq("id", application_id);

  const student = application.users as any;

  await sendEmail({
    to:      student.email,
    subject: "Payment confirmed — your Orcred application is being reviewed",
    template: "payment_confirmed",
    data: {
      student_name: student.full_name,
      project_name: application.project_name,
    },
  });

  return NextResponse.json({ success: true });
}
