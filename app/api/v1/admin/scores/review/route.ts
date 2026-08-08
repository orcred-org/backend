import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { corsJson } from "@/lib/cors";
import { sendEmail } from "@/lib/email";
import { setAssignmentStage } from "@/lib/workflow";
import { z } from "zod";

const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

const reviewScoreSchema = z.object({
  application_id: z.string().uuid(),
  action: z.enum(["approve", "request_revision", "under_review"]),
  notes: z.string().max(500).optional(),
  confirm: z.literal(true),
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

  const parsed = reviewScoreSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const { application_id, action, notes } = parsed.data;
  const supabase = createServiceClient();

  const { data: score } = await supabase
    .from("scores")
    .select("id, total_score, final_score, passed, application_id")
    .eq("application_id", application_id)
    .single();

  if (!score) return corsJson(req, { success: false, error: "Score not found" }, 404);

  const { data: app } = await supabase
    .from("applications")
    .select("project_name, user_id, users:user_id (email, full_name)")
    .eq("id", application_id)
    .single();

  const student = app?.users as { email: string; full_name: string } | undefined;
  const total = score.final_score ?? score.total_score;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, reviewer_id")
    .eq("application_id", application_id)
    .maybeSingle();

  if (action === "approve") {
    await supabase.from("scores").update({ admin_review_status: "approved" }).eq("id", score.id);
    await supabase.from("applications").update({ workflow_stage: "score_approved", status: "scheduled" }).eq("id", application_id);
    if (assignment) await setAssignmentStage(supabase, assignment.id, "score_approved", "scheduled");

    if (student) {
      if (score.passed) {
        await sendEmail({
          to: student.email,
          subject: "Your Orcred review results are in",
          template: "score_passed",
          data: {
            student_name: student.full_name,
            score: total,
            credential_url: `${DASHBOARD_URL}/dashboard/student`,
          },
        });
      } else {
        await sendEmail({
          to: student.email,
          subject: "Your Orcred review result",
          template: "score_failed",
          data: {
            student_name: student.full_name,
            score: total,
            resubmission_date: new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0],
          },
        });
      }
    }

    return corsJson(req, { success: true, data: { action } });
  }

  if (action === "request_revision") {
    await supabase.from("scores").delete().eq("id", score.id);
    await supabase.from("applications").update({ workflow_stage: "score_revision", status: "scheduled" }).eq("id", application_id);
    if (assignment) {
      await setAssignmentStage(supabase, assignment.id, "score_revision", "scheduled");
      await supabase
        .from("reviewer_tasks")
        .update({ status: "todo", unlocked: true, completed_at: null })
        .eq("assignment_id", assignment.id)
        .eq("task_key", "submit_score");
    }

    if (assignment?.reviewer_id) {
      const { data: reviewer } = await supabase.from("users").select("email").eq("id", assignment.reviewer_id).single();
      if (reviewer) {
        await sendEmail({
          to: reviewer.email,
          subject: "Score revision requested",
          template: "score_revision_reviewer",
          data: { project_name: app?.project_name, notes: notes ?? "" },
        });
      }
    }

    return corsJson(req, { success: true, data: { action } });
  }

  // under_review
  await supabase.from("scores").update({ admin_review_status: "under_review" }).eq("id", score.id);
  await supabase.from("applications").update({ workflow_stage: "under_review" }).eq("id", application_id);
  if (assignment) await setAssignmentStage(supabase, assignment.id, "under_review");

  if (student) {
    await sendEmail({
      to: student.email,
      subject: "Your project is under review",
      template: "under_review_student",
      data: {
        student_name: student.full_name,
        project_name: app?.project_name,
        dashboard_url: `${DASHBOARD_URL}/dashboard/student`,
      },
    });
  }

  return corsJson(req, { success: true, data: { action } });
}
