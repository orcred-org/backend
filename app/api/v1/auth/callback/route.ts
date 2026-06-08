import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    // Log all params for debugging
    console.log("[callback] No code. All params:", Object.fromEntries(searchParams.entries()));
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=no_code`);
  }

  console.log("[callback] Got code, exchanging...");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.log("[callback] Exchange failed:", error?.message);
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=invalid_code`);
  }

  console.log("[callback] Session established for:", data.user.email);

  // Fetch role and redirect to correct dashboard
  const { data: profile } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    // User authenticated but no profile yet — send to dashboard home to handle
    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  const redirectMap: Record<string, string> = {
    student:  "/dashboard/student",
    reviewer: "/dashboard/reviewer",
    admin:    "/dashboard/admin",
  };

  const redirectTo = redirectMap[profile.account_type] || "/dashboard";
  return NextResponse.redirect(`${appUrl}${redirectTo}`);
}
