import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { magicLinkByEmail, magicLinkByIp } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const schema = z.object({
  name:              z.string().min(2).max(100),
  email:             z.string().email(),
  linkedin:          z.string().optional().default(""),
  project:           z.string().min(1).max(200),
  stack:             z.string().optional().default(""),
  desc:              z.string().min(1),
  loom:              z.string().min(1), // accept any format — reviewers verify manually
  ai_tools:          z.string().optional().default(""),
  decision:          z.string().min(1),
  broke:             z.string().min(1),
  timezone:          z.string().min(1),
  availability:      z.string().min(1),
  consent_id:        z.literal(true),
  consent_recording: z.literal(true),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { success: ipOk } = await magicLinkByIp.limit(ip);
  if (!ipOk) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const d = parsed.data;

  // Normalise URLs — add https:// if no protocol given
  const normaliseUrl = (s: string) =>
    s && !s.startsWith("http") ? `https://${s}` : s;

  const loomUrl     = normaliseUrl(d.loom);
  const linkedinUrl = normaliseUrl(d.linkedin || "");

  const supabase = createServiceClient();

  // Rate limit by email
  const { success: emailOk } = await magicLinkByEmail.limit(d.email.toLowerCase());
  if (!emailOk) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  // ------------------------------------------------------------------
  // 1. Get or create auth user
  // ------------------------------------------------------------------
  let userId: string;

  // Check if user already exists in our users table
  const { data: existingProfile } = await supabase
    .from("users")
    .select("id")
    .eq("email", d.email)
    .maybeSingle();

  if (existingProfile) {
    userId = existingProfile.id;
    // Update profile fields
    await supabase.from("users").update({
      full_name:    d.name,
      linkedin_url: linkedinUrl || null,
    }).eq("id", userId);
  } else {
    // Create new auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         d.email,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      // Return success anyway — prevents email enumeration
      console.error("[applications/submit] auth.admin.createUser error:", authError?.message);
      return NextResponse.json({ success: true });
    }

    userId = authData.user.id;

    await supabase.from("users").insert({
      id:            userId,
      email:         d.email,
      account_type:  "student",
      full_name:     d.name,
      linkedin_url:  linkedinUrl || null,
      consent_given: true,
      consent_at:    new Date().toISOString(),
    });
  }

  // ------------------------------------------------------------------
  // 2. Create application (skip if one already active)
  // ------------------------------------------------------------------
  const { data: activeApp } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .not("status", "eq", "completed")
    .maybeSingle();

  if (!activeApp) {
    const { error: appError } = await supabase.from("applications").insert({
      user_id:          userId,
      project_name:     d.project,
      tech_stack:       d.stack || "Not specified",
      // "GitHub / LinkedIn" field — store as-is
      github_url:       linkedinUrl || "https://github.com",
      loom_url:         loomUrl,
      // Map form fields to the three decision columns
      build_decision_1: d.decision,
      build_decision_2: d.desc,
      build_decision_3: d.ai_tools
        ? `AI tools used: ${d.ai_tools}`
        : "No AI tools declared.",
      what_broke:       d.broke,
      ai_tools_used:    d.ai_tools || "None declared",
      availability:     [{ description: d.availability, timezone: d.timezone }],
      recording_consent: true,
      status:           "submitted",
      payment_amount:   199900,
      submitted_at:     new Date().toISOString(),
    });

    if (appError) {
      console.error("[applications/submit] insert error:", appError.message);
    } else {
      const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
      if (adminEmail) {
        try {
          await sendEmail({
            to: adminEmail,
            subject: `New application — ${d.name} (${d.project})`,
            template: "new_application",
            data: {
              name:         d.name,
              email:        d.email,
              project:      d.project,
              stack:        d.stack,
              linkedin:     linkedinUrl,
              loom:         loomUrl,
              timezone:     d.timezone,
              availability: d.availability,
            },
          });
        } catch (err) {
          console.error("[applications/submit] admin notify error:", err);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
