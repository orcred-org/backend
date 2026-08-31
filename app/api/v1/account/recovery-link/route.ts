import { NextRequest } from "next/server";
import { corsJson } from "@/lib/cors";
import { getSessionWithRole } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { sendLoginLink } from "@/lib/auth/send-login-link";
import { magicLinkByEmail } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }

  const email = session.email.toLowerCase();
  const { success: rateOk } = await magicLinkByEmail.limit(email);
  if (!rateOk) {
    return corsJson(
      req,
      { success: false, error: "Too many recovery emails — wait up to 1 hour and try again." },
      429,
    );
  }

  const supabase = createServiceClient();
  const result = await sendLoginLink(supabase, email);

  if (!result.ok) {
    return corsJson(req, { success: false, error: result.error ?? "Could not send recovery link" }, 500);
  }

  return corsJson(req, { success: true, data: { email } });
}
