import { NextRequest } from "next/server";
import { corsJson } from "@/lib/cors";
import { getSessionWithRole } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { accountEmailChangeSchema } from "@/lib/validators/account";

import { accountEmailChangeByUser } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }

  const { success: rateOk } = await accountEmailChangeByUser.limit(session.id);
  if (!rateOk) {
    return corsJson(req, { success: false, error: "Too many email change attempts — try again later." }, 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = accountEmailChangeSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const newEmail = parsed.data.new_email.toLowerCase();
  if (newEmail === session.email.toLowerCase()) {
    return corsJson(req, { success: false, error: "That is already your email address." }, 422);
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .ilike("email", newEmail)
    .maybeSingle();

  if (existing && existing.id !== session.id) {
    return corsJson(req, { success: false, error: "That email is already in use." }, 409);
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(session.id, {
    email: newEmail,
  });

  if (authError) {
    console.error("[account/email-change]", authError.message);
    return corsJson(req, { success: false, error: "Could not start email change — try again." }, 500);
  }

  // Keep public.users in sync once Supabase accepts the change request.
  await supabase.from("users").update({ email: newEmail }).eq("id", session.id);

  return corsJson(req, {
    success: true,
    data: {
      message: "Check your new inbox for a confirmation link from Supabase. Your login email updates after you confirm.",
      pending_email: newEmail,
    },
  });
}
