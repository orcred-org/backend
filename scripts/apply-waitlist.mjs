/**
 * Apply waitlist schema (table + phone column) via direct Postgres connection.
 *
 * Usage:
 *   1. Supabase Dashboard → Project Settings → Database → Connection string (URI)
 *   2. Add to backend/.env:  DATABASE_URL=postgresql://postgres.[ref]:[password]@...
 *   3. Run:  npm run db:apply-waitlist
 *
 * Or paste backend/supabase/apply-waitlist-idempotent.sql in Supabase SQL Editor.
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
    "Missing DATABASE_URL in backend/.env\n\n" +
      "Get it from Supabase → Project Settings → Database → Connection string (URI)\n" +
      "Or paste this file in Supabase SQL Editor:\n" +
      "  supabase/apply-waitlist-idempotent.sql",
  );
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error("Install pg first:  npm install pg --save-dev");
  process.exit(1);
}

const sql = readFileSync(join(root, "supabase/apply-waitlist-idempotent.sql"), "utf8");
const client = new pg.default.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

await client.connect();
console.log("Applying apply-waitlist-idempotent.sql…");
await client.query(sql);
await client.end();
console.log("Done. Retry the waitlist form — no backend restart needed.");
