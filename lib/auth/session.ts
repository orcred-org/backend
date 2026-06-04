import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function getSession() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getSessionWithRole(): Promise<{ id: string; email: string; role: UserRole } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email!,
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
