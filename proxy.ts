import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = [
  "https://dashboard.orcred.com",
  "https://orcred.com",
  "https://www.orcred.com",
];

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Dynamic CORS — reflect origin back if it's on the allowlist
  const origin = req.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

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
    "/api/v1/applications/submit", // public get-verified form submission
    "/api/v1/generator/generate",  // public generator (rate limited separately)
  ];

  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return res;
  }

  // ------------------------------------------------------------------
  // Validate session — accept either Bearer token OR Supabase cookies
  // ------------------------------------------------------------------

  // 1. Check Bearer token first (frontend sends this after PKCE auth)
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken) {
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await adminClient.auth.getUser(bearerToken);
    if (!error && data.user) {
      // Valid Bearer token — let through
      return res;
    }
    // Invalid token — fall through to return 401 below
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/dashboard/auth", req.url));
  }

  // 2. Fall back to cookie-based session
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
              sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
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
    return NextResponse.redirect(new URL("/dashboard/auth", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/dashboard/:path*",
  ],
};
