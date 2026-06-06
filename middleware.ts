import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Admin IP allowlist
  if (pathname.startsWith("/api/v1/admin") || pathname.startsWith("/dashboard/admin")) {
    const allowlist = (process.env.ADMIN_IP_ALLOWLIST || "").split(",").map(ip => ip.trim()).filter(Boolean);
    if (allowlist.length > 0) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
      if (!allowlist.includes(ip)) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // Public routes — no auth needed
  const publicRoutes = [
    "/api/v1/auth/magic-link",
    "/api/v1/auth/callback",
    "/api/v1/auth/signup",
    "/api/v1/auth/me",
    "/api/v1/verify",
    "/api/v1/generator/generate", // public generator (rate limited separately)
  ];

  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return res;
  }

  // Validate session for all other routes
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
            });
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && (pathname.startsWith("/api/v1/") || pathname.startsWith("/dashboard/"))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/dashboard/:path*",
  ],
};
