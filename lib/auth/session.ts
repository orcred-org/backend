import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { UserRole } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export { allowsRole, isDevFullAccess } from "./devAccess";

async function getUserFromRequest(req?: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader =
    req?.headers.get("authorization") ??
    (await headers()).get("authorization");
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

export async function getSession(req?: NextRequest) {
  return getUserFromRequest(req);
}

export async function getSessionWithRole(req?: NextRequest): Promise<{ id: string; email: string; role: UserRole } | null> {
  const user = await getUserFromRequest(req);
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
    const session = await getSessionWithRole(req);

    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    return handler(req, { userId: session.id, role: session.role });
  };
}

// Admin IP allowlist check — production only. Browser → localhost API has no
// x-forwarded-for, so allowlist would block all local admin dashboard calls.
export function isAllowedAdminIp(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const allowlist = (process.env.ADMIN_IP_ALLOWLIST || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return true;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  return allowlist.includes(ip);
}
