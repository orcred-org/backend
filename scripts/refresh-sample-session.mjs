/**
 * Create / refresh a sandbox live-review session you can test anytime.
 *
 * Sets session start to NOW → join window open for 40 minutes (re-run to extend).
 *
 * Usage (from backend/):
 *   npm run dev:sample-session
 *
 * Requires Supabase service role in .env.local or .env.
 * Local dev: run `npm run db:seed` first (reviewer@orcred.local + student@orcred.local).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Stable IDs — same every refresh so bookmarks work */
export const SAMPLE_APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
export const SAMPLE_ASSIGNMENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";

const REVIEWER_EMAIL = process.env.SAMPLE_REVIEWER_EMAIL || "reviewer@orcred.local";
const STUDENT_EMAIL = process.env.SAMPLE_STUDENT_EMAIL || "student@orcred.local";
const FRONTEND = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function stripQuotes(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Local: npm run db:env   Hosted: add keys to backend/.env");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function userIdByEmail(email) {
  const { data, error } = await sb.from("users").select("id, email, account_type").ilike("email", email).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data;
}

async function ensureUser({ email, full_name, account_type, extra = {} }) {
  let row = await userIdByEmail(email);
  if (row) return row;

  console.log(`  Creating ${account_type} ${email}…`);

  const { data: listed } = await sb.auth.admin.listUsers();
  let authId = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

  if (!authId) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: "localdev123",
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) throw new Error(`auth create ${email}: ${error.message}`);
    authId = data.user.id;
  }

  const publicRow = {
    id: authId,
    email,
    full_name,
    account_type,
    consent_given: true,
    consent_at: new Date().toISOString(),
    ...extra,
  };

  const { error: upsertErr } = await sb.from("users").upsert(publicRow, { onConflict: "id" });
  if (upsertErr?.message?.includes("Could not find") || upsertErr?.message?.includes("does not exist")) {
    const minimal = { id: authId, email, full_name, account_type, consent_given: true, consent_at: publicRow.consent_at };
    const retry = await sb.from("users").upsert(minimal, { onConflict: "id" });
    if (retry.error) throw new Error(`users upsert ${email}: ${retry.error.message}`);
  } else if (upsertErr) {
    throw new Error(`users upsert ${email}: ${upsertErr.message}`);
  }

  return { id: authId, email, account_type };
}

const SAMPLE_SUBMISSION = {
  project_name: "Campus Queue RAG Assistant",
  tech_stack: "Python, FastAPI, PostgreSQL + pgvector, React, OpenAI embeddings",
  github_url: "https://github.com/example/campus-queue-rag",
  loom_url: "https://www.loom.com/share/sample-demo",
  build_decision_1: "Used pgvector instead of Pinecone to keep infra on one Postgres instance and avoid sync lag between OLTP and vector store.",
  build_decision_2: "Chunked documents at 512 tokens with 64-token overlap after ablation showed smaller chunks improved recall on FAQ-style questions.",
  build_decision_3: "Chose hybrid search (BM25 + cosine) because pure embedding search missed exact policy numbers students query.",
  what_broke: "OpenAI rate limits during batch embedding crashed the ingest job; added exponential backoff and a resumable checkpoint table.",
  ai_tools_used: "ChatGPT for boilerplate React components; Copilot for pytest stubs; all architecture decisions documented in README.",
};

const SAMPLE_NOTES = `Student opened strong on hybrid search rationale.
Probe: why 512-token chunks vs 256? Can they explain pgvector index choice (IVFFlat vs HNSW)?
Check if they can walk through the rate-limit fix without reading slides.
Red flag to watch: generic "AI helped with everything" — ask what they actually debugged.`;

async function main() {
  console.log("\n🔄 Refreshing sample live-review session…\n");

  const reviewer = await ensureUser({
    email: REVIEWER_EMAIL,
    full_name: "Sample Reviewer",
    account_type: "reviewer",
    extra: {
      current_company: "Orcred",
      current_role: "Staff Engineer",
      years_experience: 8,
      reviewer_onboarding_complete: true,
      timezone: "Asia/Kolkata",
    },
  });

  const student = await ensureUser({
    email: STUDENT_EMAIL,
    full_name: "Sample Student",
    account_type: "student",
    extra: { college: "Test College", graduation_year: 2026 },
  });

  if (reviewer.account_type !== "reviewer") {
    await sb.from("users").update({ account_type: "reviewer" }).eq("id", reviewer.id);
  }
  if (student.account_type !== "student") {
    await sb.from("users").update({ account_type: "student" }).eq("id", student.id);
  }

  const sessionStart = new Date();
  const sessionIso = sessionStart.toISOString();
  const endsAt = new Date(sessionStart.getTime() + 40 * 60 * 1000);

  // Clean prior scores/credentials on this sandbox app
  await sb.from("scores").delete().eq("application_id", SAMPLE_APP_ID);
  await sb.from("credentials").delete().eq("application_id", SAMPLE_APP_ID);
  await sb.from("reviewer_tasks").delete().eq("application_id", SAMPLE_APP_ID);

  const appRow = {
    id: SAMPLE_APP_ID,
    user_id: student.id,
    ...SAMPLE_SUBMISSION,
    availability: [{ day: "Saturday", slot: "10:00-14:00 IST" }],
    status: "scheduled",
    payment_at: new Date().toISOString(),
    payment_amount: 199900,
    submitted_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    recording_consent: true,
    workflow_stage: "session_approved",
  };

  let { error: appErr } = await sb.from("applications").upsert(appRow, { onConflict: "id" });
  if (appErr?.message?.includes("workflow_stage")) {
    const { workflow_stage: _w, ...withoutWf } = appRow;
    ({ error: appErr } = await sb.from("applications").upsert(withoutWf, { onConflict: "id" }));
  }
  if (appErr) {
    console.error("applications upsert failed:", appErr.message);
    if (appErr.message.includes("workflow_stage")) {
      console.error("Run apply-pending-columns-idempotent.sql on hosted Supabase.");
    }
    process.exit(1);
  }

  const assignmentMinimal = {
    id: SAMPLE_ASSIGNMENT_ID,
    application_id: SAMPLE_APP_ID,
    reviewer_id: reviewer.id,
    assigned_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    session_date: sessionIso,
    status: "scheduled",
    daily_room_url: null,
    daily_room_name: null,
  };

  const { error: assignErr } = await sb.from("reviewer_assignments").upsert(assignmentMinimal, { onConflict: "id" });

  if (!assignErr) {
    // Best-effort extras for newer schemas (notes for AI agent testing)
    await sb.from("reviewer_assignments").update({
      reviewer_session_notes: SAMPLE_NOTES,
      session_completed_at: null,
      workflow_stage: "session_approved",
    }).eq("id", SAMPLE_ASSIGNMENT_ID);
  }

  if (assignErr) {
    console.error("reviewer_assignments upsert failed:", assignErr.message);
    process.exit(1);
  }

  const base = `${FRONTEND}/dashboard/session/${SAMPLE_ASSIGNMENT_ID}`;

  console.log("✓ Sample session ready\n");
  console.log("  Project:   Campus Queue RAG Assistant");
  console.log(`  Starts:    ${sessionStart.toLocaleString("en-IN")} (now)`);
  console.log(`  Window:    open until ~${endsAt.toLocaleTimeString("en-IN")} (40 min) — re-run script to reset\n`);
  console.log("  Log in first, then open:\n");
  console.log(`  Reviewer (+ AI agent):  ${base}?as=reviewer`);
  console.log(`  Student:                ${base}?as=student`);
  console.log(`  Admin observer:       ${base}?as=admin\n`);
  console.log("  Local login (password localdev123):");
  console.log(`    Reviewer → ${REVIEWER_EMAIL}`);
  console.log(`    Student  → ${STUDENT_EMAIL}`);
  console.log(`    Admin    → admin@orcred.local\n`);
  console.log("  Re-run anytime:  npm run dev:sample-session\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
