import type { SupabaseClient } from "@supabase/supabase-js";
import { createRoom, isDailyRoomValid } from "@/lib/video";

/** Ensure a valid Daily room exists for an assignment (recreates if missing or expired). */
export async function ensureAssignmentDailyRoom(
  supabase: SupabaseClient,
  assignmentId: string,
  sessionDate: string,
): Promise<{ url: string; name: string } | null> {
  if (!process.env.DAILY_API_KEY) return null;

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, daily_room_url, daily_room_name, session_date")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return null;

  if (
    assignment.daily_room_url
    && assignment.daily_room_name
    && await isDailyRoomValid(assignment.daily_room_name)
  ) {
    return { url: assignment.daily_room_url, name: assignment.daily_room_name };
  }

  const room = await createRoom(sessionDate);

  await supabase
    .from("reviewer_assignments")
    .update({
      daily_room_url: room.url,
      daily_room_name: room.name,
    })
    .eq("id", assignmentId);

  return { url: room.url, name: room.name };
}
