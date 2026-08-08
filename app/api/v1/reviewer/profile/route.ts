import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

import { getSessionWithRole, allowsRole } from "@/lib/auth/session";

import { updateReviewerProfileSchema } from "@/lib/validators/reviewer";



const PROFILE_FIELDS = `

  id, email, full_name, linkedin_url, created_at,

  current_company, current_role, years_experience, expertise, timezone,

  reviewer_onboarding_complete

`;



export async function GET(req: NextRequest) {

  const session = await getSessionWithRole(req);

  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });



  const supabase = createServiceClient();

  const { data, error } = await supabase

    .from("users")

    .select(PROFILE_FIELDS)

    .eq("id", session.id)

    .single();



  if (error) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, data });

}



export async function PUT(req: NextRequest) {

  const session = await getSessionWithRole(req);

  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  if (!allowsRole(session, "reviewer")) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });



  let body: unknown;

  try { body = await req.json(); }

  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }



  const parsed = updateReviewerProfileSchema.safeParse(body);

  if (!parsed.success) {

    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });

  }



  const supabase = createServiceClient();

  const { error } = await supabase

    .from("users")

    .update({ ...parsed.data, reviewer_onboarding_complete: true })

    .eq("id", session.id);



  if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });



  return NextResponse.json({ success: true });

}

