import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { magicLinkByEmail, magicLinkByIp } from "@/lib/ratelimit";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Rate limit by IP
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
    return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
  }

  const { email } = parsed.data;

  // Rate limit by email
  const { success: emailOk } = await magicLinkByEmail.limit(email.toLowerCase());
  if (!emailOk) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();

  // Always return same response whether email exists or not — prevents enumeration
  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // students created via separate signup flow
      emailRedirectTo: `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"}/api/v1/auth/callback`,
    },
  });

  return NextResponse.json({ success: true });
}
