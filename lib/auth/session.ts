import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { UserRole } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

async function getUserFromRequest(): Promise<{ id: string; email: string } | null> {
  // Try Bearer token first (frontend direct Supabase auth)
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken) {
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await adminClient.auth.getUser(bearerToken);
    if (!error && data.user) {
      return { id: data.user.id, email: data.user.email! };
    }
  }

  // Fall back to cookie-based session
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email! };
}

export async function getSession() {
  return getUserFromRequest();
}

export async function getSessionWithRole(): Promise<{ id: string; email: string; role: UserRole } | null> {
  const user = await getUserFromRequest();
  if (!user) return null;

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await adminClient
    .from("users")
    .select("account_type")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email,
    role: profile.account_type as UserRole,
  };
}

export function requireRole(allowedRoles: UserRole[]) {
  return async function guard(
    req: NextRequest,
    handler: (req: NextRequest, context: { userId: string; role: UserRole }) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const session = await getSessionWithRole();

    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    return handler(req, { userId: session.id, role: session.role });
  };
}

// Admin IP allowlist check
export function isAllowedAdminIp(req: NextRequest): boolean {
  const allowlist = (process.env.ADMIN_IP_ALLOWLIST || "").split(",").map(ip => ip.trim()).filter(Boolean);
  if (allowlist.length === 0) return true; // dev mode — no restriction

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  return allowlist.includes(ip);
}
