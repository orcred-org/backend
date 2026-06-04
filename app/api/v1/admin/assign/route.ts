import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp } from "@/lib/auth/session";
import { assignReviewerSchema } from "@/lib/validators/admin";
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

  const parsed = assignReviewerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id, reviewer_id, session_date } = parsed.data;
  const supabase = createServiceClient();

  // Verify application exists and is in payment_confirmed state
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, project_name, tech_stack, users:user_id (email, full_name)")
    .eq("id", application_id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  if (application.status !== "payment_confirmed") {
    return NextResponse.json(
      { success: false, error: "Application must be payment_confirmed before assigning reviewer" },
      { status: 422 }
    );
  }

  // Create assignment
  const { error: assignError } = await supabase
    .from("reviewer_assignments")
    .insert({
      application_id,
      reviewer_id,
      session_date,
      assigned_at: new Date().toISOString(),
      status: "assigned",
    });

  if (assignError) {
    return NextResponse.json({ success: false, error: "Assignment failed" }, { status: 500 });
  }

  // Update application status
  await supabase
    .from("applications")
    .update({ status: "reviewer_assigned" })
    .eq("id", application_id);

  // Get reviewer email
  const { data: reviewer } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("id", reviewer_id)
    .single();

  const student = application.users as any;

  // Send emails to student and reviewer
  await Promise.all([
    sendEmail({
      to:      student.email,
      subject: "Your Orcred reviewer has been assigned",
      template: "reviewer_assigned",
      data: {
        student_name: student.full_name,
        project_name: application.project_name,
        session_date,
      },
    }),
    sendEmail({
      to:      reviewer?.email!,
      subject: `New Orcred session assigned — ${application.project_name}`,
      template: "session_assigned_reviewer",
      data: {
        reviewer_name: reviewer?.full_name,
        project_name:  application.project_name,
        tech_stack:    application.tech_stack,
        session_date,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
