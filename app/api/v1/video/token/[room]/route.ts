import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";
import { createToken } from "@/lib/video";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ room: string }> }
) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { room } = await params;
  const supabase = await createClient();

  // Find assignment for this room
  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, reviewer_id, session_date, application_id, applications:application_id (user_id)")
    .eq("daily_room_name", room)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
  }

  const app = assignment.applications as any;
  const isReviewer = session.role === "reviewer" && session.id === assignment.reviewer_id;
  const isStudent  = session.role === "student"  && session.id === app.user_id;

  if (!isReviewer && !isStudent) {
    return NextResponse.json({ success: false, error: "Not authorised for this room" }, { status: 403 });
  }

  // Token only available 15 minutes before session
  const sessionTime = new Date(assignment.session_date);
  const now = new Date();
  const minutesUntil = (sessionTime.getTime() - now.getTime()) / 60000;

  if (minutesUntil > 15) {
    return NextResponse.json(
      { success: false, error: "Session link activates 15 minutes before start" },
      { status: 403 }
    );
  }

  // Reviewer gets host token, student gets participant token
  const { token } = await createToken(room, isReviewer, assignment.session_date);

  return NextResponse.json({ success: true, data: { token } });
}
