import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { applyCorsHeaders, corsJson } from "@/lib/cors";

export async function proxy(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const { pathname } = req.nextUrl;

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(res, origin);
  }

  const res = NextResponse.next();
  applyCorsHeaders(res, origin);

  const publicRoutes = [
    "/api/v1/auth/magic-link",
    "/api/v1/auth/callback",
    "/api/v1/auth/signup",
    "/api/v1/auth/me",
    "/api/v1/verify",
    "/api/v1/applications/submit",
    "/api/v1/generator/generate",
  ];

  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    return res;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken) {
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await adminClient.auth.getUser(bearerToken);
    if (!error && data.user) {
      return res;
    }
    if (pathname.startsWith("/api/")) {
      return corsJson(req, { success: false, error: "Unauthorized" }, 401);
    }
    return NextResponse.redirect(new URL("/dashboard/auth", req.url));
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && (pathname.startsWith("/api/v1/") || pathname.startsWith("/dashboard/"))) {
    if (pathname.startsWith("/api/")) {
      return corsJson(req, { success: false, error: "Unauthorized" }, 401);
    }
    return NextResponse.redirect(new URL("/dashboard/auth", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/api/v1/:path*", "/dashboard/:path*"],
};
