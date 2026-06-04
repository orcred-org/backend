import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

// Called by Vercel Cron daily — secured by secret header
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Fetch all due followups not yet sent
  const { data: records } = await supabase
    .from("placement_tracking")
    .select(`
      id,
      followup_30_due, followup_30_sent,
      followup_60_due, followup_60_sent,
      followup_90_due, followup_90_sent,
      users:user_id (email, full_name)
    `)
    .or(
      `and(followup_30_due.lte.${today},followup_30_sent.eq.false),` +
      `and(followup_60_due.lte.${today},followup_60_sent.eq.false),` +
      `and(followup_90_due.lte.${today},followup_90_sent.eq.false)`
    );

  if (!records?.length) {
    return NextResponse.json({ success: true, sent: 0 });
  }

  let sent = 0;

  for (const record of records) {
    const student = record.users as any;
    if (!student?.email) continue;

    const updates: Record<string, boolean> = {};

    if (record.followup_30_due <= today && !record.followup_30_sent) {
      await sendEmail({
        to:       student.email,
        subject:  "How has your Orcred credential been received?",
        template: "placement_followup_30",
        data:     { student_name: student.full_name },
      });
      updates.followup_30_sent = true;
      sent++;
    }

    if (record.followup_60_due <= today && !record.followup_60_sent) {
      await sendEmail({
        to:       student.email,
        subject:  "60-day check-in from Orcred",
        template: "placement_followup_60",
        data:     { student_name: student.full_name },
      });
      updates.followup_60_sent = true;
      sent++;
    }

    if (record.followup_90_due <= today && !record.followup_90_sent) {
      await sendEmail({
        to:       student.email,
        subject:  "Final check-in from Orcred",
        template: "placement_followup_90",
        data:     { student_name: student.full_name },
      });
      updates.followup_90_sent = true;
      sent++;
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("placement_tracking")
        .update(updates)
        .eq("id", record.id);
    }
  }

  return NextResponse.json({ success: true, sent });
}
