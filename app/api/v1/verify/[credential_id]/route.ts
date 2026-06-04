import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyByIp } from "@/lib/ratelimit";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ credential_id: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success: rateLimitOk } = await verifyByIp.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { credential_id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("credentials")
    .select(`
      credential_id, credential_url, issued_at, hash, public_opt_in,
      users:user_id (
        full_name, linkedin_url
      ),
      applications:application_id (
        project_name, tech_stack
      ),
      scores:application_id (
        total_score, final_score, passed,
        technical_depth, communication, reproducibility, originality
      )
    `)
    .eq("credential_id", credential_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Credential not found" }, { status: 404 });
  }

  // Verify hash
  const expectedHash = crypto
    .createHmac("sha256", process.env.CREDENTIAL_HASH_SECRET!)
    .update(`${data.credential_id}:${(data.users as any).id}:${data.issued_at}`)
    .digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedHash),
    Buffer.from(data.hash)
  );

  // Only return LinkedIn if student opted in
  const user = data.users as any;

  return NextResponse.json({
    success: true,
    data: {
      credential_id:  data.credential_id,
      credential_url: data.credential_url,
      issued_at:      data.issued_at,
      is_valid:       isValid,
      student_name:   user.full_name,
      linkedin_url:   data.public_opt_in ? user.linkedin_url : null,
      project_name:   (data.applications as any).project_name,
      tech_stack:     (data.applications as any).tech_stack,
      scores:         data.scores,
    },
  });
}
