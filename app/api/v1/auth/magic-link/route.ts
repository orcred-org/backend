import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { magicLinkByEmail, magicLinkByIp } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { isAdminOnlyAuth } from "@/lib/platformGates";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

async function ensureAuthUser(
  supabase: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<boolean> {
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!createError) return true;

  const msg = createError.message?.toLowerCase() ?? "";
  if (
    msg.includes("already")
    || msg.includes("exists")
    || msg.includes("registered")
    || createError.status === 422
  ) {
    return true;
  }

  console.error("[magic-link] createUser error:", createError.message, "email:", email);
  return false;
}

export async function POST(req: NextRequest) {
  try {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { success: ipOk } = await magicLinkByIp.limit(ip);
  if (!ipOk) {
    return NextResponse.json(
      { success: false, error: "Too many login attempts. Wait up to 1 hour and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });

  const { email } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const { success: emailOk } = await magicLinkByEmail.limit(normalizedEmail);
  if (!emailOk) {
    return NextResponse.json(
      { success: false, error: "Too many login attempts for this email. Wait up to 1 hour and try again." },
      { status: 429 }
    );
  }

  const supabase = createServiceClient();

  if (isAdminOnlyAuth()) {
    const { data: profile } = await supabase
      .from("users")
      .select("account_type")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (!profile || profile.account_type !== "admin") {
      console.info("[magic-link] skipped — not an admin profile:", normalizedEmail);
      // Same response as success — no email enumeration; never create Auth users
      return NextResponse.json({ success: true });
    }
  }

  if (!(await ensureAuthUser(supabase, normalizedEmail))) {
    return NextResponse.json({ success: true });
  }

  // Always return success — prevents email enumeration
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[magic-link] generateLink error:", error?.message, "email:", normalizedEmail);
    // Still return success — prevents email enumeration
    return NextResponse.json({ success: true });
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
  const link = `${backendUrl}/api/v1/auth/callback?token_hash=${data.properties.hashed_token}&type=email`;

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Orcred login link",
      template: "magic_link",
      data: { link },
    });
    console.info("[magic-link] sent to:", normalizedEmail);
  } catch (err) {
    console.error("[magic-link] email send error:", err);
  }

  return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[magic-link] unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
