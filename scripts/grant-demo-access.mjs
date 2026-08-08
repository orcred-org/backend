/**
 * Grant demo access for meeting: one email can use student, reviewer, and admin UIs locally.
 *
 * Usage (from backend/):
 *   node scripts/grant-demo-access.mjs [email]
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const email = (process.argv[2] ?? "anshika.sswal@gmail.com").toLowerCase();

function stripQuotes(value) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"'))
    || (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function loadEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = stripQuotes(m[2]);
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env. Run: npm run db:env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error(listError.message);
  process.exit(1);
}

const authUser = listed.users.find((u) => u.email?.toLowerCase() === email);
if (!authUser) {
  console.error(`No auth user for ${email}. Sign in once via magic link first.`);
  process.exit(1);
}

const row = {
  id: authUser.id,
  email,
  full_name: authUser.user_metadata?.full_name ?? "Anshika",
  account_type: "admin",
  consent_given: true,
  consent_at: new Date().toISOString(),
  current_company: "Orcred",
  current_role: "Demo Reviewer",
  years_experience: 5,
  expertise: "Product, engineering",
  timezone: "Asia/Kolkata",
  reviewer_onboarding_complete: true,
};

const { error } = await supabase.from("users").upsert(row, { onConflict: "id" });
if (error) {
  console.error(error.message);
  process.exit(1);
}

// Reassign any reviewer work to this demo account so one login sees student apps in reviewer UI
const { data: assignments } = await supabase
  .from("reviewer_assignments")
  .select("id, reviewer_id");

if (assignments?.length) {
  const otherReviewerIds = [...new Set(assignments.map((a) => a.reviewer_id).filter((id) => id !== authUser.id))];
  if (otherReviewerIds.length) {
    await supabase
      .from("reviewer_assignments")
      .update({ reviewer_id: authUser.id })
      .in("reviewer_id", otherReviewerIds);

    await supabase
      .from("reviewer_tasks")
      .update({ reviewer_id: authUser.id })
      .in("reviewer_id", otherReviewerIds);

    await supabase
      .from("scores")
      .update({ reviewer_id: authUser.id })
      .in("reviewer_id", otherReviewerIds);

    console.log(`✓ Reassigned ${assignments.length} assignment(s) to ${email}`);
  }
}

console.log(`✓ ${email} → admin + reviewer profile (local dev full-access via DEV_FULL_ACCESS_EMAILS)`);
console.log("  Student:  http://localhost:3000/dashboard/student");
console.log("  Reviewer: http://localhost:3000/dashboard/reviewer");
console.log("  Admin:    http://localhost:3000/dashboard/admin");
console.log("  Login:    http://localhost:3000/dashboard/auth");
