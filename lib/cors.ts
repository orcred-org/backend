import { NextRequest, NextResponse } from "next/server";

export const ALLOWED_ORIGINS = [
  "https://dashboard.orcred.com",
  "https://orcred.com",
  "https://www.orcred.com",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://127.0.0.1:3000"]
    : []),
];

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const VERCEL_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/;

function extraAllowedOrigins(): string[] {
  return (process.env.CORS_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (extraAllowedOrigins().includes(origin)) return true;
  if (VERCEL_ORIGIN_RE.test(origin)) return true;
  if (process.env.NODE_ENV !== "production" && LOCALHOST_ORIGIN_RE.test(origin)) {
    return true;
  }
  return false;
}

export function applyCorsHeaders(res: NextResponse, origin: string) {
  if (!isAllowedOrigin(origin)) return res;
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

export function corsJson(req: NextRequest, body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  return applyCorsHeaders(res, req.headers.get("origin") ?? "");
}
