import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

export async function sendLoginLink(
  supabase: SupabaseClient,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[send-login-link] generateLink error:", error?.message, "email:", normalizedEmail);
    return { ok: false, error: error?.message ?? "Could not generate login link" };
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
  const link = `${backendUrl}/api/v1/auth/callback?token_hash=${data.properties.hashed_token}&type=email`;

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Orcred login link",
      template: "magic_link",
      data: { link },
    });
    return { ok: true };
  } catch (err) {
    console.error("[send-login-link] email send error:", err);
    return { ok: false, error: "Could not send email" };
  }
}
