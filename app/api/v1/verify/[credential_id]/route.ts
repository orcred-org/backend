import crypto from "crypto";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateCredentialHash } from "@/lib/credentials";
import { corsJson } from "@/lib/cors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ credential_id: string }> }
) {
  const { credential_id } = await params;
  const supabase = createServiceClient();

  const { data: credential, error } = await supabase
    .from("credentials")
    .select("id, credential_id, user_id, application_id, issued_at, hash")
    .eq("credential_id", credential_id)
    .single();

  if (error || !credential) {
    return corsJson(req, { success: false, error: "Credential not found" }, 404);
  }

  const expectedHash = generateCredentialHash(
    credential.credential_id,
    credential.user_id,
    credential.issued_at
  );

  const stored = Buffer.from(credential.hash);
  const expected = Buffer.from(expectedHash);
  if (stored.length !== expected.length || !crypto.timingSafeEqual(stored, expected)) {
    return corsJson(req, { success: false, error: "Credential integrity check failed" }, 404);
  }

  const [{ data: user }, { data: app }, { data: score }] = await Promise.all([
    supabase.from("users").select("full_name").eq("id", credential.user_id).single(),
    supabase.from("applications").select("project_name, tech_stack").eq("id", credential.application_id).single(),
    supabase.from("scores").select("final_score, total_score, technical_depth, communication, reproducibility, problem_solving, passed")
      .eq("application_id", credential.application_id).maybeSingle(),
  ]);

  return corsJson(req, {
    success: true,
    data: {
      credential_id: credential.credential_id,
      issued_at:     credential.issued_at,
      student_name:  user?.full_name ?? "Verified Engineer",
      project_name:  app?.project_name ?? null,
      tech_stack:    app?.tech_stack ?? null,
      score: score ? {
        total:           score.final_score ?? score.total_score,
        technical_depth: score.technical_depth,
        communication:   score.communication,
        reproducibility: score.reproducibility,
        problem_solving:     score.problem_solving,
        passed:          score.passed,
      } : null,
      verified: true,
    },
  });
}
