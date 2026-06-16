import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    console.log("[callback] No code. Params:", Object.fromEntries(searchParams.entries()));
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    console.log("[callback] Exchange failed:", error?.message);
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=invalid_code`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", data.user.id)
    .single();

  // Pass session tokens to the frontend callback page so it can set the
  // session on the dashboard domain (cookies can't cross api.orcred.com → dashboard.orcred.com)
  const callbackUrl = new URL(`${appUrl}/dashboard/auth/callback`);
  callbackUrl.searchParams.set("access_token", data.session.access_token);
  callbackUrl.searchParams.set("refresh_token", data.session.refresh_token);
  callbackUrl.searchParams.set("account_type", profile?.account_type ?? "");

  return NextResponse.redirect(callbackUrl.toString());
}
