import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { createRoom } from "@/lib/video";
import { z } from "zod";
import { sendEmail } from "@/lib/email";

const schema = z.object({
  application_id: z.string().uuid(),
  session_date:   z.string().datetime(),
});

export async function POST(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const session = await getSessionWithRole();
  if (!allowsRole(session, "admin")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { application_id, session_date } = parsed.data;
  const supabase = createServiceClient();

  // Verify assignment exists
  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, reviewer_id, daily_room_url, applications:application_id (users:user_id (email, full_name), project_name)")
    .eq("application_id", application_id)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
  }

  if (assignment.daily_room_url) {
    return NextResponse.json({ success: false, error: "Room already created for this session" }, { status: 409 });
  }

  const room = await createRoom(session_date);

  // Save room details + update session date
  await supabase
    .from("reviewer_assignments")
    .update({
      daily_room_url:  room.url,
      daily_room_name: room.name,
      session_date,
      status: "scheduled",
    })
    .eq("application_id", application_id);

  await supabase
    .from("applications")
    .update({ status: "scheduled" })
    .eq("id", application_id);

  // Send emails to student and reviewer
  const app = assignment.applications as any;
  const student = app.users;

  const { data: reviewer } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("id", assignment.reviewer_id)
    .single();

  await Promise.all([
    sendEmail({
      to:       student.email,
      subject:  "Your Orcred session is confirmed",
      template: "session_scheduled_student",
      data: {
        student_name: student.full_name,
        session_date,
        project_name: app.project_name,
      },
    }),
    sendEmail({
      to:       reviewer?.email!,
      subject:  "Orcred session scheduled",
      template: "session_assigned_reviewer",
      data: {
        reviewer_name: reviewer?.full_name,
        project_name:  app.project_name,
        session_date,
        tech_stack:    app.tech_stack ?? "",
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: { room_url: room.url, room_name: room.name } });
}
