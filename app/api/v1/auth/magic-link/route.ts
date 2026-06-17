import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { magicLinkByEmail, magicLinkByIp } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });

  const { email } = parsed.data;

  const supabase = createServiceClient();

  // Always return success — prevents email enumeration
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[magic-link] generateLink error:", error?.message, "email:", email);
    // Still return success — prevents email enumeration
    return NextResponse.json({ success: true });
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
  const link = `${backendUrl}/api/v1/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`;

  try {
    await sendEmail({
      to: email,
      subject: "Your Orcred login link",
      template: "magic_link",
      data: { link },
    });
  } catch (err) {
    console.error("[magic-link] email send error:", err);
  }

  return NextResponse.json({ success: true });
}
