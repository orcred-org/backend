import { NextRequest } from "next/server";
import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";
import { resetApplicationSchema } from "@/lib/validators/admin";
import { resetApplicationStep } from "@/lib/admin/reset-application";
import { corsJson } from "@/lib/cors";

/** Flat reset route — avoids nested [id]/reset routing issues on some Next builds. */
export async function POST(req: NextRequest) {
  if (!isAllowedAdminIp(req)) {
    return corsJson(req, { success: false, error: "Forbidden" }, 403);
  }

  const session = await getSessionWithRole(req);
  if (!session) return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  if (!allowsRole(session, "admin")) {
    return corsJson(req, { success: false, error: "Admin access required" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = resetApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const applicationId =
    typeof body === "object" && body !== null && "application_id" in body
      ? String((body as { application_id: string }).application_id)
      : null;

  if (!applicationId) {
    return corsJson(req, { success: false, error: "application_id required" }, 422);
  }

  const result = await resetApplicationStep(applicationId, parsed.data.step);
  if (!result.ok) {
    return corsJson(req, { success: false, error: result.error }, result.status);
  }

  return corsJson(req, { success: true, data: result.data });
}
