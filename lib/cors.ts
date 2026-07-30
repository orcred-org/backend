import { NextRequest, NextResponse } from "next/server";

export const ALLOWED_ORIGINS = [
  "https://dashboard.orcred.com",
  "https://orcred.com",
  "https://www.orcred.com",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://127.0.0.1:3000"]
    : []),
];

export function applyCorsHeaders(res: NextResponse, origin: string) {
  if (!ALLOWED_ORIGINS.includes(origin)) return res;
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

export function corsJson(req: NextRequest, body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  return applyCorsHeaders(res, req.headers.get("origin") ?? "");
}
