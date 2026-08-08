import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { applicationByUser } from "@/lib/ratelimit";
import { submitApplicationSchema } from "@/lib/validators/student";
import { isStudentApplyEnabled } from "@/lib/platformGates";

function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function normaliseApplicationBody(body: Record<string, unknown>) {
  return {
    ...body,
    github_url: typeof body.github_url === "string" ? normaliseUrl(body.github_url) : body.github_url,
    loom_url: typeof body.loom_url === "string" ? normaliseUrl(body.loom_url) : body.loom_url,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("applications")
    .select(`
      id, project_name, tech_stack, status, submitted_at, payment_at,
      utr_number, payment_amount,
      reviewer_assignments (
        session_date, status, daily_room_url
      ),
      scores (
        total_score, final_score, passed, technical_depth, communication,
        reproducibility, problem_solving, feedback_td, feedback_comm, feedback_repro, feedback_ps
      )
    `)
    .eq("user_id", session.id)
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole(req);
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!allowsRole(session, "student")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  if (!isStudentApplyEnabled()) {
    return NextResponse.json(
      { success: false, error: "Applications are not open yet. Join the waitlist instead." },
      { status: 403 },
    );
  }

  // Rate limit — 3 applications per 60 days
  const { success: rateLimitOk } = await applicationByUser.limit(session.id);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, error: "Application limit reached. You can apply again in 60 days." },
      { status: 429 }
    );
  }

  // Check profile is 100% complete
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, college, graduation_year, linkedin_url")
    .eq("id", session.id)
    .single();

  if (!profile?.full_name || !profile?.college || !profile?.graduation_year || !profile?.linkedin_url) {
    return NextResponse.json(
      { success: false, error: "Profile must be 100% complete before applying." },
      { status: 422 }
    );
  }

  // Check no active application already in progress
  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", session.id)
    .not("status", "eq", "completed")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: false, error: "You already have an active application." },
      { status: 409 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = submitApplicationSchema.safeParse(
    typeof body === "object" && body !== null
      ? normaliseApplicationBody(body as Record<string, unknown>)
      : body,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id:         session.id,
      ...parsed.data,
      status:          "submitted",
      payment_amount:  199900,
      submitted_at:    new Date().toISOString(),
    })
    .select("id, status, submitted_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Submission failed" }, { status: 500 });

  return NextResponse.json({ success: true, data }, { status: 201 });
}
