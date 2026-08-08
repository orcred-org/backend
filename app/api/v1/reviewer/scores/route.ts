import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { submitScoreSchema } from "@/lib/validators/reviewer";
import { sendEmail } from "@/lib/email";
import { completeTask, setAssignmentStage } from "@/lib/workflow";
import { computeWeightedTotal, ratingTo100, excludedKeys } from "@/lib/scoring";
import type { CriterionKey } from "@/lib/scoring";
import { requiresEarlyEndReason } from "@/lib/session/audit";

function dimScore(key: CriterionKey, ratings: ReturnType<typeof submitScoreSchema.parse>["ratings"]): number {
  const r = ratings[key];
  return r.excluded ? 0 : ratingTo100(r.value);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = submitScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id, ratings, feedback_notes } = parsed.data;
  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, session_date, session_completed_at, workflow_stage, reviewer_early_end_reason")
    .eq("application_id", application_id)
    .eq("reviewer_id", session.id)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
  }

  if (!assignment.session_completed_at && assignment.workflow_stage !== "session_done") {
    return NextResponse.json(
      { success: false, error: "Mark the session as done before submitting scores" },
      { status: 422 }
    );
  }

  const earlyEndReason = typeof body === "object" && body && "early_end_reason" in body
    ? String((body as { early_end_reason?: string }).early_end_reason ?? "").trim()
    : "";

  const needsEarlyReason =
    !!assignment.session_date
    && !!assignment.session_completed_at
    && requiresEarlyEndReason(assignment.session_date, assignment.session_completed_at);

  if (
    needsEarlyReason
    && !assignment.reviewer_early_end_reason
    && earlyEndReason.length < 10
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "This session ended early. Explain why before submitting scores (min 10 characters).",
      },
      { status: 422 },
    );
  }

  if (needsEarlyReason && earlyEndReason.length >= 10 && !assignment.reviewer_early_end_reason) {
    await supabase
      .from("reviewer_assignments")
      .update({ reviewer_early_end_reason: earlyEndReason })
      .eq("id", assignment.id);
  }

  const { data: existing } = await supabase
    .from("scores")
    .select("id")
    .eq("application_id", application_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: false, error: "Scores already submitted and locked" }, { status: 409 });
  }

  const total_score = computeWeightedTotal(ratings);
  const passed = total_score >= 60;
  const is_borderline = total_score >= 58 && total_score <= 62;
  const excluded = excludedKeys(ratings);

  const { data: score, error } = await supabase
    .from("scores")
    .insert({
      application_id,
      reviewer_id:     session.id,
      technical_depth: dimScore("technical_depth", ratings),
      communication:   dimScore("communication", ratings),
      reproducibility: dimScore("reproducibility", ratings),
      problem_solving: dimScore("problem_solving", ratings),
      total_score,
      final_score:     total_score,
      passed,
      is_borderline,
      feedback_td:     feedback_notes,
      feedback_comm:   feedback_notes,
      feedback_repro:  feedback_notes,
      feedback_ps:     feedback_notes,
      internal_notes:  excluded.length
        ? `Excluded criteria: ${excluded.join(", ")}`
        : null,
      submitted_at:    new Date().toISOString(),
      admin_review_status: "pending",
    })
    .select("id, total_score, passed, is_borderline")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Score submission failed" }, { status: 500 });

  await setAssignmentStage(supabase, assignment.id, "score_submitted", "scheduled");

  const { data: scoreTask } = await supabase
    .from("reviewer_tasks")
    .select("id")
    .eq("assignment_id", assignment.id)
    .eq("task_key", "submit_score")
    .single();

  if (scoreTask) await completeTask(supabase, scoreTask.id, session.id);

  const { data: appData } = await supabase
    .from("applications")
    .select("project_name")
    .eq("id", application_id)
    .single();

  const { data: admin } = await supabase.from("users").select("email").eq("account_type", "admin").limit(1).maybeSingle();
  if (admin) {
    await sendEmail({
      to: admin.email,
      subject: `Score ready for review: ${appData?.project_name}`,
      template: "score_pending_admin",
      data: { application_id, score: total_score, passed, project_name: appData?.project_name },
    });
  }

  if (is_borderline && admin) {
    await sendEmail({
      to: admin.email,
      subject: "Borderline score — second review needed",
      template: "borderline_alert",
      data: { application_id, score: total_score },
    });
  }

  return NextResponse.json(
    { success: true, data: { ...score, pending_admin_review: true } },
    { status: 201 }
  );
}
