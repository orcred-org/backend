import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type EmailTemplate =
  | "magic_link"
  | "new_application"
  | "payment_confirmed"
  | "reviewer_assigned"
  | "session_scheduled_student"
  | "session_assigned_reviewer"
  | "score_passed"
  | "score_failed"
  | "borderline_alert"
  | "placement_followup_30"
  | "placement_followup_60"
  | "placement_followup_90"
  | "suspicious_login";

interface SendEmailOptions {
  to:       string;
  subject:  string;
  template: EmailTemplate;
  data:     Record<string, unknown>;
}

export async function sendEmail({ to, subject, template, data }: SendEmailOptions) {
  const html = renderTemplate(template, data);

  await resend.emails.send({
    from: "Orcred <noreply@orcred.com>",
    to,
    subject,
    html,
  });
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
      <p style="font-size: 15px; line-height: 1.7;"><strong>New application received.</strong></p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5); width: 140px;">Name</td><td style="padding: 8px 0;"><strong>${data.name}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Email</td><td style="padding: 8px 0;">${data.email}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Project</td><td style="padding: 8px 0;">${data.project}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Stack</td><td style="padding: 8px 0;">${data.stack || "—"}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">LinkedIn</td><td style="padding: 8px 0;">${data.linkedin || "—"}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Loom</td><td style="padding: 8px 0;"><a href="${data.loom}" style="color: #eb4511;">${data.loom}</a></td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Timezone</td><td style="padding: 8px 0;">${data.timezone}</td></tr>
        <tr><td style="padding: 8px 0; color: rgba(15,13,12,0.5);">Availability</td><td style="padding: 8px 0;">${data.availability}</td></tr>
      </table>
      <a href="https://dashboard.orcred.com/dashboard/admin" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #eb4511; color: #ffffff; border-radius: 50px; font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; text-decoration: none;">View in Admin Dashboard</a>
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

    session_scheduled_student: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.student_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">Your Orcred review session is confirmed for <strong>${data.session_date}</strong>.</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">The session link activates 15 minutes before start. Have your GitHub open, your Loom ready to replay, and be prepared to explain every decision you made.</p>
    `),

    session_assigned_reviewer: base(`
      <p style="font-size: 15px; line-height: 1.7;">Hi ${data.reviewer_name},</p>
      <p style="font-size: 15px; line-height: 1.7;">You have been assigned a new review session on <strong>${data.session_date}</strong>.</p>
      <p style="font-size: 14px; line-height: 1.7;">Project: <strong>${data.project_name}</strong> &middot; Stack: ${data.tech_stack}</p>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(15,13,12,0.6);">Log in to your dashboard to review the submission details.</p>
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
  };

  return templates[template] ?? base(`<p>${JSON.stringify(data)}</p>`);
}
