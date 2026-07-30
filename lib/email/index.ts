import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  if (!resend) resend = new Resend(key);
  return resend;
}

type EmailTemplate =
  | "magic_link"
  | "new_application"
  | "payment_confirmed"
  | "reviewer_assigned"
  | "reviewer_assigned_student"
  | "reviewer_assigned_notify"
  | "reviewer_accepted_student"
  | "session_proposed_admin"
  | "session_reschedule_admin"
  | "session_reschedule_parties"
  | "session_proposal_reminder_admin"
  | "score_pending_admin"
  | "score_revision_reviewer"
  | "under_review_student"
  | "session_scheduled_student"
  | "session_assigned_reviewer"
  | "score_passed"
  | "score_failed"
  | "borderline_alert"
  | "placement_followup_30"
  | "placement_followup_60"
  | "placement_followup_90"
  | "suspicious_login"
  | "waitlist_update"
  | "waitlist_launch_invite"
  | "waitlist_confirmation"
  | "waitlist_admin_notify";

interface SendEmailOptions {
  to:       string;
  subject:  string;
  template: EmailTemplate;
  data:     Record<string, unknown>;
}

export async function sendEmail({ to, subject, template, data }: SendEmailOptions) {
  const html = renderTemplate(template, data);
  const from = process.env.RESEND_FROM ?? "Orcred <noreply@orcred.com>";

  const { error } = await getResend().emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message ?? "Email delivery failed");
  }
}

function renderTemplate(template: EmailTemplate, data: Record<string, unknown>): string {
  const base = (content: string) => `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #0f0d0c; padding: 40px 24px;">
      <div style="margin-bottom: 32px;">
        <span style="display: inline-flex; align-items: center; gap: 7px;">
          <span style="display: inline-block; width: 13px; height: 13px; border-radius: 50%; background: #eb4511;"></span>
          <span style="font-weight: 700; font-size: 15px; letter-spacing: -0.01em;">Orcred</span>
        </span>
      </div>
      ${content}
      <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(15,13,12,0.1); font-size: 11px; color: rgba(15,13,12,0.45); letter-spacing: 0.05em;">
        © 2026 Orcred · <a href="https://orcred.com/privacy" style="color: rgba(15,13,12,0.45);">Privacy</a>
      </div>
    </div>
  `;

  const templates: Record<EmailTemplate, string> = {
    new_application: base(`
      <div style="background: #eb4511; border-radius: 4px; padding: 28px 28px 24px; margin-bottom: 32px;">
        <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin: 0 0 8px;">New Application</p>
        <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.3;">${data.name} just applied.</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 0 0 24px;">
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5); width: 140px;">Email</td><td style="padding: 8px 0;">${data.email}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Project</td><td style="padding: 8px 0;"><strong>${data.project}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Stack</td><td style="padding: 8px 0;">${data.stack || "—"}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">LinkedIn</td><td style="padding: 8px 0;">${data.linkedin || "—"}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Loom</td><td style="padding: 8px 0;"><a href="${data.loom}" style="color: #eb4511;">${data.loom}</a></td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Timezone</td><td style="padding: 8px 0;">${data.timezone}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Availability</td><td style="padding: 8px 0;">${data.availability}</td></tr>
      </table>
      <a href="https://dashboard.orcred.com/dashboard/admin" style="display: inline-block; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-decoration: none;">View in Admin Dashboard</a>
    `),

    magic_link: base(`
      <div style="background: #eb4511; border-radius: 4px; padding: 28px 28px 24px; margin-bottom: 32px;">
        <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin: 0 0 8px;">Orcred</p>
        <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.3;">Your login link is ready.</p>
      </div>
      <p style="font-size: 15px; line-height: 1.7; margin: 0 0 24px;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
      <a href="${data.link}" style="display: inline-block; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-decoration: none;">Log in to Orcred</a>
      <p style="font-size: 12px; color: rgba(15,13,12,0.4); margin-top: 32px;">If you did not request this, you can safely ignore it.</p>
    `),

    payment_confirmed: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Your payment for <strong>${data.project_name}</strong> has been confirmed. We will assign a reviewer within 3–5 business days.</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">While you wait — re-read your Loom, revisit your build decisions, and make sure your GitHub is clean.</p>
    `),

    reviewer_assigned: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">A Senior AI/ML Engineer has been assigned to review your project <strong>${data.project_name}</strong>. Your session will be scheduled within 48 hours.</p>
    `),

    reviewer_assigned_student: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">You have a reviewer assigned for <strong>${data.project_name}</strong>!</p>
      <p style="font-size: 14px; line-height: 1.7;">View your dashboard for updates. Your reviewer will review your application and propose a session time from your preferred availability.</p>
      <a href="${data.dashboard_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">View Dashboard</a>
    `),

    reviewer_assigned_notify: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.reviewer_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">You have been assigned <strong>${data.project_name}</strong> (${data.student_code}).</p>
      <p style="font-size: 14px; line-height: 1.7;">Stack: ${data.tech_stack}</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">Review the full application, accept the candidate, then propose a session from their availability windows.</p>
      <a href="${data.dashboard_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">Open Reviewer Dashboard</a>
    `),

    reviewer_accepted_student: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Great news — your reviewer has accepted <strong>${data.project_name}</strong> and will propose a session time shortly.</p>
      <a href="${data.dashboard_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">View Dashboard</a>
    `),

    session_proposed_admin: base(`
      <p style="font-size: 15px; line-height: 1.7;">A reviewer proposed a session for <strong>${data.project_name}</strong> (${data.student_code}).</p>
      <p style="font-size: 14px; line-height: 1.7;">Student: ${data.student_name}<br/>Proposed: <strong>${data.session_date}</strong></p>
      ${data.notes ? `<p style="font-size: 14px;">Notes: ${data.notes}</p>` : ""}
      <a href="${data.admin_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">Approve in Admin</a>
    `),

    session_reschedule_admin: base(`
      <p style="font-size: 15px; line-height: 1.7;"><strong>Reschedule requested</strong> for <strong>${data.project_name}</strong> (${data.student_code}).</p>
      <p style="font-size: 14px; line-height: 1.7;">Requested by: <strong>${data.requested_by}</strong><br/>Student: ${data.student_name}<br/>Previous time: <strong>${data.previous_time}</strong></p>
      <p style="font-size: 14px; line-height: 1.7;">Preferred new time: <strong>${data.preferred_time}</strong></p>
      <p style="font-size: 14px; line-height: 1.7;">Reason: ${data.reason}</p>
      <a href="${data.admin_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">Review in Admin</a>
    `),

    session_reschedule_parties: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.recipient_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">The session for <strong>${data.project_name}</strong>${data.student_code ? ` (${data.student_code})` : ""} needs to be rescheduled.</p>
      <p style="font-size: 14px; line-height: 1.7;">Previous time: <strong>${data.previous_time}</strong></p>
      <p style="font-size: 14px; line-height: 1.7;">Message: ${data.message}</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">${data.action}</p>
      <a href="${data.dashboard_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">Open Dashboard</a>
    `),

    session_proposal_reminder_admin: base(`
      <p style="font-size: 15px; line-height: 1.7;"><strong>Reminder:</strong> session proposal still awaiting approval for <strong>${data.project_name}</strong> (${data.student_code}).</p>
      <p style="font-size: 14px; line-height: 1.7;">Waiting ${data.hours_waiting}+ hours since submission.<br/>Student: ${data.student_name}<br/>Tentative: <strong>${data.session_date}</strong></p>
      ${data.notes ? `<pre style="font-size: 13px; white-space: pre-wrap; background: rgba(15,13,12,0.04); padding: 12px; border-radius: 4px;">${data.notes}</pre>` : ""}
      <a href="${data.admin_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">Approve in Admin</a>
    `),

    score_pending_admin: base(`
      <p style="font-size: 15px; line-height: 1.7;">Score submitted for <strong>${data.project_name}</strong>: ${data.score}/100 (${data.passed ? "PASS" : "FAIL"}).</p>
      <p style="font-size: 14px; line-height: 1.7;">Review and approve to send results to the student, request revision, or mark under review.</p>
    `),

    score_revision_reviewer: base(`
      <p style="font-size: 15px; line-height: 1.7;">Admin requested a score revision for <strong>${data.project_name}</strong>.</p>
      ${data.notes ? `<p style="font-size: 14px;">Notes: ${data.notes}</p>` : ""}
      <p style="font-size: 14px; color: rgba(15,13,12,0.6);">Please re-submit scores from your dashboard.</p>
    `),

    under_review_student: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Your project <strong>${data.project_name}</strong> is under extended review. Thanks for your patience — we'll email you when a decision is ready.</p>
      <a href="${data.dashboard_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">View Dashboard</a>
    `),

    session_scheduled_student: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Your Orcred review session is confirmed for <strong>${data.session_date}</strong>.</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">The session link activates 24 hours before start. Have your GitHub open, your Loom ready to replay, and be prepared to explain every decision you made.</p>
      ${data.session_url ? `<a href="${data.session_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">View session page</a>` : ""}
    `),

    session_assigned_reviewer: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.reviewer_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">You have been assigned a new review session on <strong>${data.session_date}</strong>.</p>
      <p style="font-size: 14px; line-height: 1.7;">Project: <strong>${data.project_name}</strong> &middot; Stack: ${data.tech_stack}</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">Log in to your dashboard to review the submission details.</p>
      ${data.session_url ? `<a href="${data.session_url}" style="display: inline-block; margin-top: 16px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none;">Join session page</a>` : ""}
    `),

    score_passed: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">You passed your Orcred review with a score of <strong>${data.score}/100</strong>.</p>
      <p style="font-size: 14px; line-height: 1.7;">Your credential is available at: <a href="${data.credential_url}" style="color: #eb4511;">${data.credential_url}</a></p>
    `),

    score_failed: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Your Orcred score was <strong>${data.score}/100</strong>. The pass threshold is 60.</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">Full feedback from your reviewer is available in your dashboard. You are eligible to reapply from <strong>${data.resubmission_date}</strong>.</p>
    `),

    borderline_alert: base(`
      <p style="font-size: 15px; line-height: 1.7;">Borderline score flagged for review.</p>
      <p>Application ID: ${data.application_id}<br/>Score: ${data.score}/100</p>
    `),

    placement_followup_30: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">It has been 30 days since you received your Orcred credential. Have you had any interviews or opportunities come from it?</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">Reply to this email — we read every response.</p>
    `),

    placement_followup_60: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Checking in again at the 60-day mark. Any placements or offers to share?</p>
    `),

    placement_followup_90: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Final check-in at 90 days. Whatever happened — we would love to know. Your response helps us improve Orcred for future engineers.</p>
    `),

    suspicious_login: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.name},</p>
      <p style="font-size: 15px; line-height: 1.7;">We noticed a login to your Orcred account from an unusual location. If this was you, no action is needed.</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">If this was not you, contact us immediately at security@orcred.com.</p>
    `),

    waitlist_update: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.first_name},</p>
      <div style="font-size: 15px; line-height: 1.7; margin: 0 0 24px;">${data.body_html}</div>
      <p style="font-size: 13px; line-height: 1.6; color: rgba(15,13,12,0.5);">You joined the Orcred waitlist for ${data.domain}. Reply to this email if you have questions.</p>
    `),

    waitlist_launch_invite: base(`
      <div style="background: #eb4511; border-radius: 4px; padding: 28px 28px 24px; margin-bottom: 32px;">
        <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin: 0 0 8px;">You're invited</p>
        <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.3;">Orcred is live, ${data.first_name}.</p>
      </div>
      <p style="font-size: 15px; line-height: 1.7;">Thanks for waiting. Your spot on the Orcred waitlist (${data.domain}) is now open — you can submit your full application and book your live review session.</p>
      ${data.body_html ? `<div style="font-size: 15px; line-height: 1.7; margin: 0 0 24px;">${data.body_html}</div>` : ""}
      <a href="${data.apply_url}" style="display: inline-block; margin-top: 8px; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-decoration: none;">Start your application</a>
      <p style="font-size: 12px; color: rgba(15,13,12,0.4); margin-top: 32px;">If the button doesn't work, copy this link: ${data.apply_url}</p>
    `),

    waitlist_confirmation: base(`
      <div style="background: #eb4511; border-radius: 4px; padding: 28px 28px 24px; margin-bottom: 32px;">
        <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin: 0 0 8px;">Waitlist confirmed</p>
        <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.3;">You're on the list, ${data.first_name}.</p>
      </div>
      <p style="font-size: 15px; line-height: 1.7;">Thanks for joining the Orcred waitlist. We review every signup — early applicants who show up ready get priority when we launch.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 0 0 24px;">
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5); width: 140px;">Domains</td><td style="padding: 8px 0;"><strong>${data.domain}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Background</td><td style="padding: 8px 0;">${data.degree}</td></tr>
      </table>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.65); margin: 0 0 8px;"><strong>While you wait, prepare:</strong></p>
      <ul style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.65); margin: 0 0 24px; padding-left: 20px;">
        <li>A GitHub repo with a real AI/ML project you built</li>
        <li>A 3–5 minute Loom walkthrough of your build</li>
      </ul>
      <p style="font-size: 13px; line-height: 1.6; color: rgba(15,13,12,0.5);">We'll email you before launch with a get-ready note, then again when applications open. Reply anytime if you have questions.</p>
    `),

    waitlist_admin_notify: base(`
      <div style="background: #eb4511; border-radius: 4px; padding: 28px 28px 24px; margin-bottom: 32px;">
        <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin: 0 0 8px;">Waitlist signup</p>
        <p style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.3;">${data.full_name}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 0 0 24px;">
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5); width: 140px;">Email</td><td style="padding: 8px 0;">${data.email}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Domains</td><td style="padding: 8px 0;"><strong>${data.domain}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Degree</td><td style="padding: 8px 0;">${data.degree}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Found us via</td><td style="padding: 8px 0;">${data.referral_source ?? "—"}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5); vertical-align: top;">Motivation</td><td style="padding: 8px 0; white-space: pre-wrap;">${data.motivation}</td></tr>
      </table>
      <a href="${data.admin_url}" style="display: inline-block; padding: 12px 28px; background: #eb4511; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-decoration: none;">View in admin</a>
    `),
  };

  return templates[template] ?? base(`<p>${JSON.stringify(data)}</p>`);
}
