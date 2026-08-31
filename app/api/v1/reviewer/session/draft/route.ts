import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { reviewerSessionDraftSchema } from "@/lib/validators/session";
import { isDevFullAccess } from "@/lib/auth/devAccess";
import { isMissingWorkflowColumn } from "@/lib/workflow";

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "reviewer") && !isDevFullAccess(session.email)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = reviewerSessionDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createServiceClient();
  const { assignment_id, draft } = parsed.data;

  let updateQuery = supabase
    .from("reviewer_assignments")
    .update({ reviewer_session_draft: draft })
    .eq("id", assignment_id);

  if (!isDevFullAccess(session.email)) {
    updateQuery = updateQuery.eq("reviewer_id", session.id);
  }

  const { error } = await updateQuery;

  if (error) {
    if (isMissingWorkflowColumn(error.message)) {
      // Hosted DB may not have migration 011 yet — don't spam 500s on auto-save.
      return NextResponse.json({ success: true, persisted: false });
    }
    return NextResponse.json({ success: false, error: "Could not save draft" }, { status: 500 });
  }

  return NextResponse.json({ success: true, persisted: true });
}
