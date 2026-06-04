import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";
import { submitScoreSchema } from "@/lib/validators/reviewer";
import { issueCredential } from "@/lib/credentials";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "reviewer") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = submitScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id, technical_depth, communication, reproducibility, originality, ...rest } = parsed.data;

  const supabase = await createClient();

  // Verify assignment belongs to this reviewer and session has passed
  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, session_date, status")
    .eq("application_id", application_id)
    .eq("reviewer_id", session.id)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
  }

  if (new Date() <= new Date(assignment.session_date)) {
    return NextResponse.json(
      { success: false, error: "Cannot submit scores before the session has taken place" },
      { status: 422 }
    );
  }

  // Check scores not already submitted
  const { data: existing } = await supabase
    .from("scores")
    .select("id")
    .eq("application_id", application_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: false, error: "Scores already submitted and locked" }, { status: 409 });
  }

  // Calculate total score server-side
  const total_score = Math.round(
    technical_depth * 0.35 +
    communication   * 0.25 +
    reproducibility * 0.20 +
    originality     * 0.20
  );

  const passed = total_score >= 60;
  const is_borderline = total_score >= 58 && total_score <= 62;

  const serviceClient = createServiceClient();

  const { data: score, error } = await serviceClient
    .from("scores")
    .insert({
      application_id,
      reviewer_id:    session.id,
      technical_depth,
      communication,
      reproducibility,
      originality,
      total_score,
      final_score: total_score,
      passed,
      is_borderline,
      feedback_td:   rest.feedback_td,
      feedback_comm: rest.feedback_comm,
      feedback_repro: rest.feedback_repro,
      feedback_orig: rest.feedback_orig,
      internal_notes: rest.internal_notes ?? null,
      submitted_at:   new Date().toISOString(),
    })
    .select("id, total_score, passed, is_borderline")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Score submission failed" }, { status: 500 });

  // Update application status
  await serviceClient
    .from("applications")
    .update({ status: "completed" })
    .eq("id", application_id);

  // Update assignment status
  await serviceClient
    .from("reviewer_assignments")
    .update({ status: "completed" })
    .eq("application_id", application_id)
    .eq("reviewer_id", session.id);

  // Issue credential if passed, send failure email if not
  if (passed) {
    await issueCredential(application_id, session.id);
  } else {
    // Get student details for failure email
    const { data: appData } = await serviceClient
      .from("applications")
      .select("project_name, users:user_id (email, full_name)")
      .eq("id", application_id)
      .single();

    const student = (appData?.users as any);
    const resubDate = new Date();
    resubDate.setDate(resubDate.getDate() + 60);

    if (student) {
      await sendEmail({
        to:       student.email,
        subject:  "Your Orcred review result",
        template: "score_failed",
        data: {
          student_name:       student.full_name,
          score:              total_score,
          resubmission_date:  resubDate.toISOString().split("T")[0],
        },
      });
    }
  }

  // Alert admin if borderline
  if (is_borderline) {
    const { data: admin } = await serviceClient
      .from("users")
      .select("email")
      .eq("account_type", "admin")
      .single();

    if (admin) {
      await sendEmail({
        to:       admin.email,
        subject:  `Borderline score — second review needed`,
        template: "borderline_alert",
        data: { application_id, score: total_score },
      });
    }
  }

  return NextResponse.json({ success: true, data: score }, { status: 201 });
}
