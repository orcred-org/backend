import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

import { magicLinkByEmail, magicLinkByIp } from "@/lib/ratelimit";

import { sendWaitlistConfirmationEmail, sendWaitlistAdminNotify } from "@/lib/email/sendWaitlistSignupEmails";

import { waitlistSubmitSchema } from "@/lib/validators/waitlist";



function joinDomains(domains: string[]): string {

  return domains.map((d) => d.trim()).filter(Boolean).join(", ");

}



export async function POST(req: NextRequest) {

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";



  const { success: ipOk } = await magicLinkByIp.limit(ip);

  if (!ipOk) {

    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });

  }



  let body: unknown;

  try {

    body = await req.json();

  } catch {

    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

  }



  const parsed = waitlistSubmitSchema.safeParse(body);

  if (!parsed.success) {

    return NextResponse.json(

      { success: false, error: "Invalid input", details: parsed.error.flatten() },

      { status: 422 },

    );

  }



  const d = parsed.data;

  const email = d.email.toLowerCase().trim();

  const domain = joinDomains(d.domains);



  const { success: emailOk } = await magicLinkByEmail.limit(email);

  if (!emailOk) {

    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });

  }



  const supabase = createServiceClient();



  const { data: existing } = await supabase

    .from("waitlist_entries")

    .select("id, status")

    .ilike("email", email)

    .maybeSingle();



  const emailPayload = {

    full_name: d.full_name.trim(),

    email,

    domain,

    degree: d.degree.trim(),

    referral_source: d.referral_source,

    motivation: d.motivation.trim(),

  };



  if (existing) {
    const message =
      existing.status === "converted"
        ? "This email has already joined Orcred."
        : "You're already registered on the waitlist with this email.";

    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }



  const { data: row, error: insertError } = await supabase

    .from("waitlist_entries")

    .insert({

      email,

      full_name:       emailPayload.full_name,

      domain:          emailPayload.domain,

      degree:          emailPayload.degree,

      referral_source: emailPayload.referral_source,

      motivation:      emailPayload.motivation,

      status:     "pending",

    })

    .select("id")

    .single();



  if (insertError) {
    console.error("[waitlist/submit] insert error:", insertError.message);

    if (insertError.code === "23505") {
      return NextResponse.json(
        { success: false, error: "You're already registered on the waitlist with this email." },
        { status: 409 },
      );
    }

    if (insertError.message.includes("waitlist_entries") && insertError.message.includes("schema cache")) {

      return NextResponse.json(

        {

          success: false,

          error: "Waitlist is not set up on this database yet. Run backend/supabase/apply-waitlist-idempotent.sql in Supabase SQL Editor.",

        },

        { status: 503 },

      );

    }

    return NextResponse.json({ success: false, error: "Could not save signup" }, { status: 500 });

  }



  const signupPayload = { id: row.id, ...emailPayload };

  try {
    await sendWaitlistAdminNotify(signupPayload);
  } catch (err) {
    console.error("[waitlist/submit] admin notify failed:", (err as Error).message);
    // Signup is saved — do not fail the request if admin inbox delivery fails.
  }

  try {
    await sendWaitlistConfirmationEmail(signupPayload);
  } catch (err) {

    console.error("[waitlist/submit] confirmation email failed:", (err as Error).message);

    return NextResponse.json(

      { success: false, error: "Saved your signup but confirmation email failed. Please try again or contact us." },

      { status: 502 },

    );

  }



  return NextResponse.json({ success: true, data: { id: row.id } });

}

