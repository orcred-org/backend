import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Called by Vercel Cron daily — deletes recordings past their retention date
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Fetch recordings due for deletion (not disputed)
  const { data: due } = await supabase
    .from("applications")
    .select("id, recording_url")
    .lte("recording_delete_at", now)
    .eq("dispute_flag", false)
    .not("recording_url", "is", null);

  if (!due?.length) {
    return NextResponse.json({ success: true, deleted: 0 });
  }

  let deleted = 0;

  for (const app of due) {
    if (!app.recording_url) continue;

    // Delete from Supabase Storage
    await supabase.storage.from("private").remove([app.recording_url]);

    // Clear recording fields
    await supabase
      .from("applications")
      .update({ recording_url: null, recording_delete_at: null })
      .eq("id", app.id);

    deleted++;
  }

  return NextResponse.json({ success: true, deleted });
}
