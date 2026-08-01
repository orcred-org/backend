import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    // Accept Bearer token from Authorization header (frontend uses direct Supabase auth)
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let userId: string | null = null;
    const adminClient = createServiceClient();

    if (bearerToken) {
      const { data, error } = await adminClient.auth.getUser(bearerToken);
      if (!error && data.user) userId = data.user.id;
    } else {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) userId = data.user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: userData, error: dbError } = await adminClient
      .from("users")
      .select("id, email, account_type, full_name")
      .eq("id", userId)
      .single();

    if (dbError || !userData) {
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    return NextResponse.json(userData);
  } catch (error) {
    console.error("Auth me error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("missing Supabase config")) {
      return NextResponse.json(
        { error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set on the backend" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
