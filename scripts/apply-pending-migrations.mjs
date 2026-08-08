/**
 * Apply pending Supabase migrations (005 + 006) via direct Postgres connection.
 *
 * Usage:
 *   1. Supabase Dashboard → Project Settings → Database → Connection string (URI)
 *   2. Add to backend/.env:  DATABASE_URL=postgresql://postgres.[ref]:[password]@...
 *   3. Run:  node scripts/apply-pending-migrations.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL in backend/.env\n" +
      "Get it from Supabase → Project Settings → Database → Connection string (URI)\n" +
      "Or paste migrations manually in Supabase SQL Editor:\n" +
      "  supabase/migrations/005_reviewer_profile.sql\n" +
      "  supabase/migrations/006_workflow.sql",
  );
  process.exit(1);
}

const files = [
  "supabase/migrations/005_reviewer_profile.sql",
  "supabase/migrations/006_workflow.sql",
];

let pg;
try {
  pg = await import("pg");
} catch {
  console.error("Install pg first:  npm install pg --save-dev");
  process.exit(1);
}

const client = new pg.default.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const rel of files) {
  const sql = readFileSync(join(root, rel), "utf8");
  console.log(`Applying ${rel}…`);
  await client.query(sql);
  console.log(`  ✓ ${rel}`);
}

await client.end();
console.log("\nDone. Restart the backend dev server and refresh the admin dashboard.");
