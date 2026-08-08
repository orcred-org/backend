import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { createToken } from "@/lib/video";
import { getSessionJoinState } from "@/lib/video/session-access";
import { isDevFullAccess } from "@/lib/auth/devAccess";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { room } = await params;
  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, reviewer_id, session_date, application_id, applications:application_id (user_id)")
    .eq("daily_room_name", room)
    .single();

  if (!assignment) {
    return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
  }

  const app = assignment.applications as { user_id: string } | { user_id: string }[] | null;
  const userId = Array.isArray(app) ? app[0]?.user_id : app?.user_id;

  const isReviewer =
    session.id === assignment.reviewer_id
    && (allowsRole(session, "reviewer") || isDevFullAccess(session.email));
  const isStudent =
    session.id === userId
    && (allowsRole(session, "student") || isDevFullAccess(session.email));

  if (!isReviewer && !isStudent) {
    return NextResponse.json({ success: false, error: "Not authorised for this room" }, { status: 403 });
  }

  const joinState = getSessionJoinState(assignment.session_date);
  if (!joinState.canJoin) {
    return NextResponse.json({ success: false, error: joinState.message }, { status: 403 });
  }

  const { token } = await createToken(room, isReviewer, assignment.session_date!);

  return NextResponse.json({ success: true, data: { token } });
}
