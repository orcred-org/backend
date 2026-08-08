import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { adminByIp } from "@/lib/ratelimit";
import { corsJson } from "@/lib/cors";
import { sendEmail } from "@/lib/email";
import {
  firstName,
  messageToHtml,
  personalizeWaitlistText,
} from "@/lib/email/waitlistPersonalize";
import { waitlistSendEmailSchema } from "@/lib/validators/waitlist";

interface WaitlistRow {
  id: string;
  email: string;
  full_name: string;
  domain: string;
  degree: string;
  status: string;
  emails_sent_count?: number;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success: rateLimitOk } = await adminByIp.limit(ip);
  if (!rateLimitOk) return corsJson(req, { success: false, error: "Too many requests" }, 429);

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = waitlistSendEmailSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const { entry_ids, status, template, subject, message, mark_invited, send_to_all } = parsed.data;
  const supabase = createServiceClient();

  let query = supabase
    .from("waitlist_entries")
    .select("id, email, full_name, domain, degree, status, emails_sent_count");

  if (entry_ids?.length) {
    query = query.in("id", entry_ids);
  } else if (status) {
    query = query.eq("status", status);
  } else if (send_to_all) {
    query = query.neq("status", "rejected");
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("[admin/waitlist/send-email]", error.message);
    return corsJson(req, { success: false, error: error.message }, 500);
  }

  const entries = (rows ?? []) as WaitlistRow[];
  if (entries.length === 0) {
    return corsJson(req, { success: false, error: "No matching waitlist entries" }, 404);
  }

  const applyUrl = `${appUrl()}/get-verified`;
  const defaultSubject =
    template === "launch" ? "Orcred is live — your spot is ready" : "Update from Orcred";
  const emailSubject = subject?.trim() || defaultSubject;
  const shouldMarkInvited = mark_invited ?? template === "launch";

  const sent: string[] = [];
  const failed: Array<{ id: string; email: string; error: string }> = [];

  for (const entry of entries) {
    if (entry.status === "rejected") {
      failed.push({ id: entry.id, email: entry.email, error: "Rejected entries are skipped" });
      continue;
    }

    const personalizedMessage =
      message != null
        ? personalizeWaitlistText(message, entry)
        : "";
    const bodyHtml = personalizedMessage ? messageToHtml(personalizedMessage) : "";
    const fn = firstName(entry.full_name);

    try {
      if (template === "launch") {
        await sendEmail({
          to: entry.email,
          subject: personalizeWaitlistText(emailSubject, entry),
          template: "waitlist_launch_invite",
          data: {
            first_name: fn,
            domain: entry.domain,
            apply_url: applyUrl,
            body_html: bodyHtml,
          },
        });
      } else {
        await sendEmail({
          to: entry.email,
          subject: personalizeWaitlistText(emailSubject, entry),
          template: "waitlist_update",
          data: {
            first_name: fn,
            domain: entry.domain,
            body_html: bodyHtml,
          },
        });
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        last_emailed_at: now,
        emails_sent_count: (entry.emails_sent_count ?? 0) + 1,
        updated_at: now,
      };

      if (shouldMarkInvited && entry.status === "pending") {
        updatePayload.status = "invited";
        updatePayload.invited_at = now;
      }

      const { error: updateError } = await supabase
        .from("waitlist_entries")
        .update(updatePayload)
        .eq("id", entry.id);

      if (updateError) {
        console.error("[admin/waitlist/send-email] tracking update:", updateError.message);
      }

      sent.push(entry.id);
    } catch (err) {
      failed.push({
        id: entry.id,
        email: entry.email,
        error: (err as Error).message,
      });
    }
  }

  return corsJson(req, {
    success: true,
    data: {
      sent_count: sent.length,
      failed_count: failed.length,
      sent_ids: sent,
      failed,
    },
  });
}
