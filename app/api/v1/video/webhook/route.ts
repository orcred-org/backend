import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDailyWebhook } from "@/lib/video";
import { issueCredential } from "@/lib/credentials";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-daily-signature") ?? "";
  const body = await req.text();

  if (!verifyDailyWebhook(body, signature)) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body);
  const { type, properties } = event;
  const roomName: string = properties?.room_name ?? "";

  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("reviewer_assignments")
    .select("id, application_id, reviewer_id, session_date, applications:application_id (user_id)")
    .eq("daily_room_name", roomName)
    .single();

  if (!assignment) return NextResponse.json({ success: true }); // unknown room, ignore

  const app = assignment.applications as any;

  switch (type) {
    case "meeting-ended": {
      const durationMinutes: number = Math.floor((properties?.duration ?? 0) / 60);
      await supabase
        .from("reviewer_assignments")
        .update({ session_duration: durationMinutes })
        .eq("id", assignment.id);
      break;
    }

    case "recording-ready": {
      const recordingUrl: string = properties?.recording_url ?? "";
      const deleteAt = new Date();
      deleteAt.setDate(deleteAt.getDate() + 90);

      await supabase
        .from("applications")
        .update({
          recording_url:       recordingUrl,
          recording_delete_at: deleteAt.toISOString(),
        })
        .eq("id", assignment.application_id);
      break;
    }

    case "participant-left": {
      // Detect no-show — if student left in first 5 minutes flag it
      const duration: number = properties?.duration ?? 999;
      const participantId: string = properties?.user_id ?? "";

      if (duration < 300 && participantId !== assignment.reviewer_id) {
        await supabase
          .from("reviewer_assignments")
          .update({ status: "no_show_student" })
          .eq("id", assignment.id);

        // Alert admin
        const { data: admin } = await supabase
          .from("users")
          .select("email")
          .eq("account_type", "admin")
          .single();

        if (admin) {
          await sendEmail({
            to:       admin.email,
            subject:  "Orcred — candidate no-show",
            template: "borderline_alert", // reuse for now — admin alert
            data: { application_id: assignment.application_id, score: "N/A — no-show" },
          });
        }
      }
      break;
    }

    // Score submission triggers credential issuance (called from reviewer scores route)
    // This webhook handles video infrastructure events only
  }

  return NextResponse.json({ success: true });
}
