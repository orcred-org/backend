import { sendEmail } from "@/lib/email";

type AdminNotifyPayload = {
  subject: string;
  template: Parameters<typeof sendEmail>[0]["template"];
  data: Record<string, unknown>;
};

export function getAdminNotifyEmails(): string[] {
  return (process.env.ADMIN_NOTIFY_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Send the same admin notification to every address in ADMIN_NOTIFY_EMAIL (comma-separated). */
export async function notifyAdmins(opts: AdminNotifyPayload): Promise<void> {
  const recipients = getAdminNotifyEmails();
  if (!recipients.length) {
    console.warn(
      "[admin-notify] ADMIN_NOTIFY_EMAIL is not set — admin notification skipped:",
      opts.subject,
    );
    return;
  }

  const failures: string[] = [];
  for (const to of recipients) {
    try {
      await sendEmail({ to, ...opts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[admin-notify] failed for", to, msg);
      failures.push(to);
    }
  }

  if (failures.length === recipients.length) {
    throw new Error(`Admin notification failed for all recipients (${opts.subject})`);
  }
}
