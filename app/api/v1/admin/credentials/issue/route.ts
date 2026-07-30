import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { issueCredential } from "@/lib/credentials";
import { corsJson } from "@/lib/cors";
import { z } from "zod";

const schema = z.object({
  application_id:   z.string().uuid(),
  confirm_reviewed: z.literal(true),
  override_failed:  z.literal(true).optional(),
});

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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const supabase = createServiceClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, user_id, status")
    .eq("id", parsed.data.application_id)
    .single();

  if (!app) return corsJson(req, { success: false, error: "Application not found" }, 404);

  const { data: existingCred } = await supabase
    .from("credentials")
    .select("credential_id")
    .eq("application_id", app.id)
    .maybeSingle();

  if (existingCred) {
    return corsJson(req, { success: true, data: { credential: existingCred, already_issued: true } });
  }

  const { data: score } = await supabase
    .from("scores")
    .select("passed, final_score, total_score")
    .eq("application_id", app.id)
    .maybeSingle();

  if (!score) {
    return corsJson(req, {
      success: false,
      error: "A reviewed score is required before issuing a credential",
    }, 422);
  }

  if (!score.passed && !parsed.data.override_failed) {
    return corsJson(req, {
      success: false,
      error: "Review did not pass. Set override_failed to issue manually.",
    }, 422);
  }

  const total = score.final_score ?? score.total_score;
  const credential = await issueCredential(app.id, app.user_id, { totalScore: total });

  await supabase.from("applications").update({ status: "completed" }).eq("id", app.id);

  return corsJson(req, { success: true, data: { credential, overridden: !score.passed } });
}
