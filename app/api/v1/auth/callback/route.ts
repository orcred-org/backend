import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!token_hash || !type) {
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=no_token`);
  }

  // verifyOtp must use the anon key (not service role). PKCE token_hash links use type "email".
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "pkce", persistSession: false, autoRefreshToken: false } }
  );

  const verifyTypes =
    type === "signup" ? (["signup"] as const) : (["email", "magiclink"] as const);

  let data: Awaited<ReturnType<typeof authClient.auth.verifyOtp>>["data"] | null = null;
  let lastError: string | undefined;

  for (const otpType of verifyTypes) {
    const result = await authClient.auth.verifyOtp({ type: otpType, token_hash });
    if (!result.error && result.data.session && result.data.user) {
      data = result.data;
      break;
    }
    lastError = result.error?.message;
  }

  const supabase = createServiceClient();

  if (!data?.session || !data.user) {
    console.error("[callback] verifyOtp failed:", lastError);
    return NextResponse.redirect(`${appUrl}/dashboard/auth?error=invalid_link`);
  }

  // Ensure public.users row exists; preserve existing role (e.g. admin set in Studio)
  let { data: profile } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", data.user!.id)
    .maybeSingle();

  if (!profile) {
    const { data: created, error: insertErr } = await supabase
      .from("users")
      .insert({
        id:           data.user!.id,
        email:        data.user!.email!,
        account_type: "student",
      })
      .select("account_type")
      .single();

    if (insertErr?.code === "23505") {
      // Row exists for this id (race) — re-fetch
      ({ data: profile } = await supabase
        .from("users")
        .select("account_type")
        .eq("id", data.user!.id)
        .maybeSingle());
    } else {
      profile = created;
    }
  }

  const callbackUrl = new URL(`${appUrl}/dashboard/auth/callback`);
  callbackUrl.searchParams.set("access_token", data.session.access_token);
  callbackUrl.searchParams.set("refresh_token", data.session.refresh_token);
  callbackUrl.searchParams.set("account_type", profile?.account_type ?? "");

  return NextResponse.redirect(callbackUrl.toString());
}
