import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { confirmPaymentSchema } from "@/lib/validators/admin";
import { sendEmail } from "@/lib/email";
import { corsJson } from "@/lib/cors";

export async function POST(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = confirmPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const { application_id } = parsed.data;
  const supabase = createServiceClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, project_name, users:user_id (email, full_name)")
    .eq("id", application_id)
    .single();

  if (!application) {
    return corsJson(req, { success: false, error: "Application not found" }, 404);
  }

  if (!["submitted", "payment_pending"].includes(application.status)) {
    return corsJson(req, {
      success: false,
      error: `Cannot confirm payment from status: ${application.status}`,
    }, 422);
  }

  await supabase
    .from("applications")
    .update({
      status:     "payment_confirmed",
      payment_at: new Date().toISOString(),
    })
    .eq("id", application_id);

  const studentRaw = application.users;
  const student = (Array.isArray(studentRaw) ? studentRaw[0] : studentRaw) as {
    email: string;
    full_name: string;
  };

  await sendEmail({
    to:      student.email,
    subject: "Payment confirmed — your Orcred application is being reviewed",
    template: "payment_confirmed",
    data: {
      student_name: student.full_name,
      project_name: application.project_name,
    },
  });

  return corsJson(req, { success: true });
}
