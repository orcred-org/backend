import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export function generateCredentialHash(
  credentialId: string,
  userId: string,
  issuedAt: string
): string {
  return crypto
    .createHmac("sha256", process.env.CREDENTIAL_HASH_SECRET!)
    .update(`${credentialId}:${userId}:${issuedAt}`)
    .digest("hex");
}

export async function issueCredential(applicationId: string, userId: string) {
  const supabase = createServiceClient();
  const issuedAt = new Date().toISOString();

  // Use Postgres sequence for race-safe sequential ID
  const { data: seqRow } = await supabase
    .rpc("next_credential_sequence") as { data: number };

  const year = new Date().getFullYear();
  const credentialId = `ORC-${year}-${String(seqRow).padStart(3, "0")}`;
  const credentialUrl = `https://orcred.com/verify/${credentialId}`;
  const hash = generateCredentialHash(credentialId, userId, issuedAt);

  const { data: credential, error } = await supabase
    .from("credentials")
    .insert({
      application_id: applicationId,
      user_id:        userId,
      credential_id:  credentialId,
      credential_url: credentialUrl,
      issued_at:      issuedAt,
      hash,
      linkedin_added: false,
      public_opt_in:  false,
    })
    .select("id, credential_id, credential_url, issued_at")
    .single();

  if (error) throw new Error(`Credential issuance failed: ${error.message}`);

  // Kick off placement tracking
  await supabase.from("placement_tracking").insert({
    user_id:          userId,
    credential_id:    credential.id,
    followup_30_due:  daysFromNow(30),
    followup_60_due:  daysFromNow(60),
    followup_90_due:  daysFromNow(90),
    followup_30_sent: false,
    followup_60_sent: false,
    followup_90_sent: false,
  });

  // Get student + score details for email
  const [userRes, scoreRes, appRes] = await Promise.all([
    supabase.from("users").select("email, full_name").eq("id", userId).single(),
    supabase.from("scores").select("final_score, total_score").eq("application_id", applicationId).single(),
    supabase.from("applications").select("project_name").eq("id", applicationId).single(),
  ]);

  if (userRes.data) {
    await sendEmail({
      to:       userRes.data.email,
      subject:  "You passed — your Orcred credential is ready",
      template: "score_passed",
      data: {
        student_name:   userRes.data.full_name,
        score:          scoreRes.data?.final_score ?? scoreRes.data?.total_score,
        credential_url: credentialUrl,
        project_name:   appRes.data?.project_name,
      },
    });
  }

  return credential;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
