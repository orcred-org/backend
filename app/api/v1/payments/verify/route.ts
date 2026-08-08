import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { isRazorpayConfigured, verifyRazorpayPaymentSignature } from "@/lib/payments/razorpay";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const verifySchema = z.object({
  application_id: z.string().uuid(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json({ success: false, error: "Razorpay is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const valid = verifyRazorpayPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    return NextResponse.json({ success: false, error: "Invalid payment signature" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, project_name, users:user_id (email, full_name)")
    .eq("id", application_id)
    .eq("user_id", session.id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  if (application.status === "payment_confirmed") {
    return NextResponse.json({ success: true, data: { already_confirmed: true } });
  }

  if (!["submitted", "payment_pending"].includes(application.status)) {
    return NextResponse.json({ success: false, error: "Payment not allowed for this status" }, { status: 409 });
  }

  await supabase
    .from("applications")
    .update({
      status: "payment_confirmed",
      payment_at: new Date().toISOString(),
      utr_number: razorpay_payment_id,
    })
    .eq("id", application_id);

  const studentRaw = application.users;
  const student = (Array.isArray(studentRaw) ? studentRaw[0] : studentRaw) as {
    email: string;
    full_name: string;
  };
  await sendEmail({
    to: student.email,
    subject: "Payment confirmed — your Orcred application is being reviewed",
    template: "payment_confirmed",
    data: {
      student_name: student.full_name,
      project_name: application.project_name,
    },
  });

  return NextResponse.json({ success: true });
}
