import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { corsJson, corsPreflight } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

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
      return corsJson(req, { error: "Not authenticated" }, 401);
    }

    const { data: userData, error: dbError } = await adminClient
      .from("users")
      .select("id, email, account_type, full_name")
      .eq("id", userId)
      .single();

    if (dbError || !userData) {
      return corsJson(req, { error: "User not found in database" }, 404);
    }

    return corsJson(req, userData);
  } catch (error) {
    console.error("Auth me error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("missing Supabase config")) {
      return corsJson(
        req,
        { error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set on the backend" },
        503,
      );
    }
    return corsJson(req, { error: "Internal server error" }, 500);
  }
}
