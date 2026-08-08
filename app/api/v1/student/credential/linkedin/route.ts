import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";

/** Mark the student's credential as added to LinkedIn (analytics). */
export async function POST() {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const { data: cred, error } = await supabase
    .from("credentials")
    .select("id")
    .eq("user_id", session.id)
    .maybeSingle();

  if (error || !cred) {
    return NextResponse.json({ success: false, error: "No credential found" }, { status: 404 });
  }

  await supabase
    .from("credentials")
    .update({ linkedin_added: true, linkedin_added_at: new Date().toISOString() })
    .eq("id", cred.id);

  return NextResponse.json({ success: true });
}
