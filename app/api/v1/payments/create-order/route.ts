import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/payments/razorpay";

const DEFAULT_AMOUNT_PAISE = 199900;

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { success: false, error: "Razorpay is not configured. Use manual UTR payment or ask admin to confirm payment." },
      { status: 503 },
    );
  }

  let body: { application_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const applicationId = body.application_id;
  if (!applicationId) {
    return NextResponse.json({ success: false, error: "application_id required" }, { status: 422 });
  }

  const supabase = createServiceClient();
  const { data: application } = await supabase
    .from("applications")
    .select("id, status, payment_amount, user_id")
    .eq("id", applicationId)
    .eq("user_id", session.id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  if (!["submitted", "payment_pending"].includes(application.status)) {
    return NextResponse.json({ success: false, error: "Payment not required for this application" }, { status: 409 });
  }

  const amountPaise = application.payment_amount ?? DEFAULT_AMOUNT_PAISE;
  const order = await createRazorpayOrder({
    amountPaise,
    receipt: `app_${application.id.slice(0, 8)}`,
    notes: { application_id: application.id, user_id: session.id },
  });

  await supabase
    .from("applications")
    .update({ status: "payment_pending" })
    .eq("id", application.id);

  return NextResponse.json({
    success: true,
    data: {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      application_id: application.id,
    },
  });
}
