/**
 * Create local dev accounts after `supabase db reset` or first `supabase start`.
 *
 * Usage (from backend/):
 *   npm run db:seed
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 * (run `npm run db:env` after `supabase start` to generate them).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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
  console.error(
    "Missing Supabase env. Run:\n" +
      "  npm run db:start\n" +
      "  npm run db:env\n" +
      "  npm run db:seed",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEV_PASSWORD = "localdev123";

const USERS = [
  {
    email: "admin@orcred.local",
    full_name: "Local Admin",
    account_type: "admin",
  },
  {
    email: "reviewer@orcred.local",
    full_name: "Local Reviewer",
    account_type: "reviewer",
    current_company: "Orcred Dev",
    current_role: "Staff Engineer",
    years_experience: 8,
    expertise: "Full-stack, system design",
    timezone: "Asia/Kolkata",
    reviewer_onboarding_complete: true,
  },
  {
    email: "student@orcred.local",
    full_name: "Local Student",
    account_type: "student",
    college: "Dev College",
    graduation_year: 2026,
  },
];

async function upsertAuthUser(user) {
  const { data: listed } = await supabase.auth.admin.listUsers();
  const existing = listed?.users?.find((u) => u.email === user.email);

  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: user.full_name },
  });

  if (error) throw new Error(`${user.email}: ${error.message}`);
  return data.user.id;
}

async function upsertPublicUser(id, user) {
  const row = {
    id,
    email: user.email,
    full_name: user.full_name,
    account_type: user.account_type,
    consent_given: true,
    consent_at: new Date().toISOString(),
  };

  if (user.college) row.college = user.college;
  if (user.graduation_year) row.graduation_year = user.graduation_year;
  if (user.current_company) row.current_company = user.current_company;
  if (user.current_role) row.current_role = user.current_role;
  if (user.years_experience) row.years_experience = user.years_experience;
  if (user.expertise) row.expertise = user.expertise;
  if (user.timezone) row.timezone = user.timezone;
  if (user.reviewer_onboarding_complete) {
    row.reviewer_onboarding_complete = true;
  }

  const { error } = await supabase.from("users").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`${user.email} public.users: ${error.message}`);
}

console.log("Seeding local dev users…\n");

for (const user of USERS) {
  const id = await upsertAuthUser(user);
  await upsertPublicUser(id, user);
  console.log(`  ✓ ${user.account_type.padEnd(8)} ${user.email}  (password: ${DEV_PASSWORD})`);
}

console.log("\nMagic links: http://127.0.0.1:54324 (Inbucket)");
console.log("Login page:  http://localhost:3000/dashboard/auth");
