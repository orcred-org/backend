import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getSessionWithRole } from "@/lib/auth/session";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const applicationId = formData.get("application_id") as string | null;

  if (!file || !applicationId) {
    return NextResponse.json({ success: false, error: "Missing file or application_id" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, error: "Only JPEG, PNG, or WebP allowed" }, { status: 422 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ success: false, error: "File too large — max 5MB" }, { status: 422 });
  }

  // Verify application belongs to student
  const supabase = await createClient();
  const { data: application } = await supabase
    .from("applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .eq("user_id", session.id)
    .single();

  if (!application) {
    return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
  }

  const serviceClient = createServiceClient();
  const ext = file.type.split("/")[1];
  const path = `payment-screenshots/${session.id}/${applicationId}.${ext}`;

  const { error: uploadError } = await serviceClient.storage
    .from("private")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }

  await supabase
    .from("applications")
    .update({ payment_screenshot_url: path })
    .eq("id", applicationId)
    .eq("user_id", session.id);

  return NextResponse.json({ success: true });
}
