import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  // Fetch role and redirect to correct dashboard
  const { data: profile } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  const redirectMap: Record<string, string> = {
    student:  "/dashboard/student",
    reviewer: "/dashboard/reviewer",
    admin:    "/dashboard/admin",
  };

  const redirectTo = redirectMap[profile.account_type] || "/auth/error";
  return NextResponse.redirect(`${origin}${redirectTo}`);
}
