import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { magicLinkByEmail, magicLinkByIp } from "@/lib/ratelimit";
import { isAdminOnlyAuth } from "@/lib/platformGates";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  consent: z.literal(true),
});

export async function POST(req: NextRequest) {
  if (isAdminOnlyAuth()) {
    return NextResponse.json(
      { success: false, error: "Student sign-up is not open yet. Join the waitlist instead." },
      { status: 403 },
    );
  }

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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  const { email } = parsed.data;

  const { success: emailOk } = await magicLinkByEmail.limit(email.toLowerCase());
  if (!emailOk) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const supabase = createServiceClient();

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (authError) {
    // Always return same response — prevents email enumeration
    return NextResponse.json({ success: true });
  }

  // Create user profile
  await supabase.from("users").insert({
    id: authData.user.id,
    email,
    account_type: "student",
    consent_given: true,
    consent_at: new Date().toISOString(),
  });

  // Send magic link
  await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/auth/callback`,
    },
  });

  return NextResponse.json({ success: true });
}
