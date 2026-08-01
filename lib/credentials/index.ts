import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export interface IssuedCredential {
  credentialId: string;
  credentialUrl: string;
  issuedAt: string;
  hash: string;
}

export function credentialBaseUrl(): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (app) return app;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return "https://orcred.com";
}

export function generateCredentialHash(
  credentialId: string,
  userId: string,
  issuedAt: string
): string {
  const secret = process.env.CREDENTIAL_HASH_SECRET;
  if (!secret) throw new Error("CREDENTIAL_HASH_SECRET is not configured");

  // Postgres returns +00:00; we store with Z — normalize so verify always matches
  const normalized = new Date(issuedAt).toISOString();

  return crypto
    .createHmac("sha256", secret)
    .update(`${credentialId}:${userId}:${normalized}`)
    .digest("hex");
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function createPlacementTracking(
  userId: string,
  credentialUuid: string,
  issuedAt: string
) {
  const supabase = createServiceClient();
  const base = new Date(issuedAt);

  const { data: existing } = await supabase
    .from("placement_tracking")
    .select("id")
    .eq("credential_id", credentialUuid)
    .maybeSingle();

  if (existing) return;

  await supabase.from("placement_tracking").insert({
    user_id:       userId,
    credential_id: credentialUuid,
    followup_30_due: addDays(base, 30),
    followup_60_due: addDays(base, 60),
    followup_90_due: addDays(base, 90),
  });
}

async function sendPassEmail(
  userId: string,
  applicationId: string,
  credential: IssuedCredential,
  totalScore: number
) {
  const supabase = createServiceClient();
  const [{ data: user }, { data: app }] = await Promise.all([
    supabase.from("users").select("email, full_name").eq("id", userId).single(),
    supabase.from("applications").select("project_name").eq("id", applicationId).single(),
  ]);

  if (!user?.email) return;

  await sendEmail({
    to:       user.email,
    subject:  `You passed — your Orcred credential is live`,
    template: "score_passed",
    data: {
      student_name:   user.full_name ?? "there",
      project_name:   app?.project_name ?? "your project",
      score:          totalScore,
      credential_url: credential.credentialUrl,
    },
  });
}

/**
 * sequence → ID → hash → insert row → placement + email → return credential.
 * Idempotent per application_id.
 */
export async function issueCredential(
  applicationId: string,
  userId: string,
  options?: { totalScore?: number; skipEmail?: boolean }
): Promise<IssuedCredential> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("credentials")
    .select("id, credential_id, credential_url, issued_at, hash")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (existing) {
    return {
      credentialId: existing.credential_id,
      credentialUrl: existing.credential_url,
      issuedAt: existing.issued_at,
      hash: existing.hash,
    };
  }

  const { data: seqRow, error: seqError } = await supabase.rpc("next_credential_sequence");
  if (seqError) {
    throw new Error(`Failed to get credential sequence: ${seqError.message}`);
  }

  const year = new Date().getFullYear();
  const credentialId = `ORC-${year}-${String(seqRow).padStart(3, "0")}`;
  const credentialUrl = `${credentialBaseUrl()}/verify/${credentialId}`;
  const issuedAt = new Date().toISOString();
  const hash = generateCredentialHash(credentialId, userId, issuedAt);

  const { data: inserted, error: insertError } = await supabase
    .from("credentials")
    .insert({
      application_id: applicationId,
      user_id: userId,
      credential_id: credentialId,
      credential_url: credentialUrl,
      hash,
      issued_at: issuedAt,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to insert credential: ${insertError?.message ?? "unknown"}`);
  }

  const issued: IssuedCredential = { credentialId, credentialUrl, issuedAt, hash };

  await createPlacementTracking(userId, inserted.id, issuedAt);

  if (!options?.skipEmail) {
    let totalScore = options?.totalScore;
    if (totalScore == null) {
      const { data: score } = await supabase
        .from("scores")
        .select("final_score, total_score")
        .eq("application_id", applicationId)
        .maybeSingle();
      totalScore = score?.final_score ?? score?.total_score ?? 0;
    }
    try {
      await sendPassEmail(userId, applicationId, issued, totalScore ?? 0);
    } catch {
      /* email failure must not roll back credential */
    }
  }

  return issued;
}
