import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { z } from "zod";

const schema = z.object({
  application_id: z.string().uuid(),
  total_score:    z.number().int().min(0).max(100),
  feedback:       z.string().min(10).optional(),
});

/** Admin manual score entry — bypasses reviewer session requirements. */
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

  const { application_id, total_score, feedback } = parsed.data;
  const supabase = createServiceClient();

  const { data: app } = await supabase
    .from("applications")
    .select("id, user_id, status")
    .eq("id", application_id)
    .single();

  if (!app) return corsJson(req, { success: false, error: "Application not found" }, 404);

  const { data: existing } = await supabase
    .from("scores")
    .select("id")
    .eq("application_id", application_id)
    .maybeSingle();

  if (existing) {
    return corsJson(req, { success: false, error: "Score already exists for this application" }, 409);
  }

  const passed = total_score >= 60;
  const note = feedback ?? "Manual admin score entry.";
  const dim = total_score;

  const { data: score, error } = await supabase
    .from("scores")
    .insert({
      application_id,
      reviewer_id:     session.id,
      technical_depth: dim,
      communication:   dim,
      reproducibility: dim,
      problem_solving:     dim,
      total_score,
      final_score:     total_score,
      passed,
      feedback_td:     note,
      feedback_comm:   note,
      feedback_repro:  note,
      feedback_ps:   note,
      internal_notes:  "Admin manual entry",
      admin_review_status: "approved",
      submitted_at:    new Date().toISOString(),
    })
    .select("id, total_score, final_score, passed")
    .single();

  if (error) return corsJson(req, { success: false, error: "Score submission failed" }, 500);

  await supabase
    .from("applications")
    .update({ status: "scheduled", workflow_stage: "score_approved" })
    .eq("id", application_id);

  return corsJson(req, {
    success: true,
    data: { ...score, manual: true },
  }, 201);
}
