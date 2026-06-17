import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function sendMagicLink(email: string) {
  const supabase = createServiceClient();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[sendMagicLink] generateLink error:", error?.message);
    return;
  }

  const link = `${backendUrl}/api/v1/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`;

  try {
    await sendEmail({
      to: email,
      subject: "Your Orcred login link",
      template: "magic_link",
      data: { link },
    });
  } catch (err) {
    console.error("[sendMagicLink] email send error:", err);
  }
}
