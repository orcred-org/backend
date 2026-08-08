import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { assignReviewerSchema } from "@/lib/validators/admin";
import { sendEmail } from "@/lib/email";
import { corsJson } from "@/lib/cors";
import {
  isMissingWorkflowColumn,
  seedWorkflowTasks,
  setAssignmentStage,
  studentCodeFromApp,
} from "@/lib/workflow";

const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

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

  const parsed = assignReviewerSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const { application_id, reviewer_id } = parsed.data;
  const supabase = createServiceClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, project_name, tech_stack, users:user_id (email, full_name)")
    .eq("id", application_id)
    .single();

  if (!application) {
    return corsJson(req, { success: false, error: "Application not found" }, 404);
  }

  if (application.status !== "payment_confirmed") {
    return corsJson(req, {
      success: false,
      error: "Application must be payment_confirmed before assigning reviewer",
    }, 422);
  }

  const { data: existing } = await supabase
    .from("reviewer_assignments")
    .select("id")
    .eq("application_id", application_id)
    .maybeSingle();

  if (existing) {
    return corsJson(req, { success: false, error: "Reviewer already assigned" }, 409);
  }

  const studentCode = studentCodeFromApp(application_id);

  let assignment: { id: string } | null = null;
  let workflowEnabled = true;

  const workflowInsert = await supabase
    .from("reviewer_assignments")
    .insert({
      application_id,
      reviewer_id,
      status: "assigned",
      workflow_stage: "assigned",
      student_code: studentCode,
    })
    .select("id")
    .single();

  if (isMissingWorkflowColumn(workflowInsert.error?.message)) {
    workflowEnabled = false;
    const legacyInsert = await supabase
      .from("reviewer_assignments")
      .insert({
        application_id,
        reviewer_id,
        status: "assigned",
      })
      .select("id")
      .single();

    if (legacyInsert.error || !legacyInsert.data) {
      console.error("[admin/assign]", legacyInsert.error?.message);
      return corsJson(req, { success: false, error: legacyInsert.error?.message ?? "Assign failed" }, 500);
    }
    assignment = legacyInsert.data;
  } else if (workflowInsert.error || !workflowInsert.data) {
    console.error("[admin/assign]", workflowInsert.error?.message);
    return corsJson(req, { success: false, error: workflowInsert.error?.message ?? "Assign failed" }, 500);
  } else {
    assignment = workflowInsert.data;
  }

  if (workflowEnabled) {
    try {
      await seedWorkflowTasks(supabase, {
        assignmentId: assignment.id,
        applicationId: application_id,
        reviewerId: reviewer_id,
        studentCode,
      });
    } catch (err) {
      console.warn("[admin/assign] workflow tasks not seeded:", (err as Error).message);
      workflowEnabled = false;
    }
  }

  await setAssignmentStage(supabase, assignment.id, "assigned", "reviewer_assigned");

  const { data: reviewer } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("id", reviewer_id)
    .single();

  const studentRaw = application.users;
  const student = (Array.isArray(studentRaw) ? studentRaw[0] : studentRaw) as {
    email: string;
    full_name: string;
  };

  if (reviewer) {
    await sendEmail({
      to: reviewer.email,
      subject: `New Orcred assignment: ${application.project_name}`,
      template: "reviewer_assigned_notify",
      data: {
        reviewer_name: reviewer.full_name,
        project_name: application.project_name,
        tech_stack: application.tech_stack,
        student_code: studentCode,
        dashboard_url: `${DASHBOARD_URL}/dashboard/reviewer`,
      },
    });
  }

  await sendEmail({
    to: student.email,
    subject: "You have a reviewer assigned!",
    template: "reviewer_assigned_student",
    data: {
      student_name: student.full_name,
      project_name: application.project_name,
      dashboard_url: `${DASHBOARD_URL}/dashboard/student`,
    },
  });

  return corsJson(req, {
    success: true,
    data: {
      assignment_id: assignment.id,
      student_code: studentCode,
      workflow_enabled: workflowEnabled,
    },
  });
}
