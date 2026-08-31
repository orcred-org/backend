import { sendEmail } from "@/lib/email";
import { firstName } from "@/lib/email/waitlistPersonalize";
import { notifyAdmins } from "@/lib/email/adminNotify";

export interface WaitlistSignupPayload {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  domain: string;
  degree: string;
  referral_source: string;
  motivation: string;
  updated?: boolean;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Notify admins that someone new joined the waitlist (every new DB row). */
export async function sendWaitlistAdminNotify(payload: WaitlistSignupPayload): Promise<void> {
  await notifyAdmins({
    subject: `${payload.full_name} just signed up for the Orcred waitlist`,
    template: "waitlist_admin_notify",
    data: {
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      domain: payload.domain,
      degree: payload.degree,
      referral_source: payload.referral_source,
      motivation: payload.motivation,
      admin_url: `${appUrl()}/dashboard/admin`,
    },
  });
}

export async function sendWaitlistConfirmationEmail(payload: WaitlistSignupPayload): Promise<void> {
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
}

/** Student confirmation + admin notify on brand-new signups only. */
export async function sendWaitlistSignupEmails(payload: WaitlistSignupPayload): Promise<void> {
  await sendWaitlistConfirmationEmail(payload);

  if (!payload.updated) {
    await sendWaitlistAdminNotify(payload);
  }
}
