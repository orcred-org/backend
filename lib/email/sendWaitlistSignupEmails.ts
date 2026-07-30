import { sendEmail } from "@/lib/email";
import { firstName } from "@/lib/email/waitlistPersonalize";

interface WaitlistSignupPayload {
  id: string;
  full_name: string;
  email: string;
  domain: string;
  degree: string;
  referral_source: string;
  motivation: string;
  updated?: boolean;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function sendWaitlistSignupEmails(payload: WaitlistSignupPayload): Promise<void> {
  const fn = firstName(payload.full_name);
  const subjectSuffix = payload.updated ? " (updated)" : "";

  await sendEmail({
    to: payload.email,
    subject: `You're on the Orcred waitlist${subjectSuffix}`,
    template: "waitlist_confirmation",
    data: {
      first_name: fn,
      domain: payload.domain,
      degree: payload.degree,
    },
  });

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) return;

  await sendEmail({
    to: adminEmail,
    subject: `Waitlist signup${subjectSuffix}: ${payload.full_name} (${payload.domain})`,
    template: "waitlist_admin_notify",
    data: {
      full_name: payload.full_name,
      email: payload.email,
      domain: payload.domain,
      degree: payload.degree,
      referral_source: payload.referral_source,
      motivation: payload.motivation,
      admin_url: `${appUrl()}/dashboard/admin`,
    },
  });
}
