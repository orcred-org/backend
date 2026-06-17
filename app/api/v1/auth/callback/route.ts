import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!token_hash || !type) {
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=no_token`);
  }

  const supabase = createServiceClient();

  const otpType = type === "signup" ? "signup" : "magiclink";

  const { data, error } = await supabase.auth.verifyOtp({
    type: otpType,
    token_hash,
  });

  if (error || !data.session || !data.user) {
    console.error("[callback] verifyOtp failed:", error?.message);
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=invalid_link`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", data.user.id)
    .single();

  const callbackUrl = new URL(`${appUrl}/dashboard/auth/callback`);
  callbackUrl.searchParams.set("access_token", data.session.access_token);
  callbackUrl.searchParams.set("refresh_token", data.session.refresh_token);
  callbackUrl.searchParams.set("account_type", profile?.account_type ?? "");

  return NextResponse.redirect(callbackUrl.toString());
}
