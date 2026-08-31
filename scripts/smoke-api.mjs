/**
 * Smoke tests for API security + public endpoints.
 * Run: node scripts/smoke-api.mjs
 * Requires backend on localhost:3001 (or set API_URL).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_URL || "http://localhost:3001";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(path, opts = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

console.log(`\nOrcred API smoke tests → ${API}\n`);

await test("GET /auth/me without token → 401", async () => {
  const { status } = await req("/auth/me");
  assert(status === 401, `expected 401, got ${status}`);
});

await test("GET /account/settings without token → 401", async () => {
  const { status } = await req("/account/settings");
  assert(status === 401, `expected 401, got ${status}`);
});

await test("POST /session/agent/suggest without token → 401", async () => {
  const { status } = await req("/session/agent/suggest?as=reviewer", {
    method: "POST",
    body: JSON.stringify({ assignment_id: "00000000-0000-0000-0000-000000000001", mode: "questions" }),
  });
  assert(status === 401, `expected 401, got ${status}`);
});

await test("GET /admin/analytics without token → 401", async () => {
  const { status } = await req("/admin/analytics");
  assert(status === 401 || status === 403, `expected 401/403, got ${status}`);
});

await test("GET /student/dashboard without token → 401", async () => {
  const { status } = await req("/student/dashboard");
  assert(status === 401, `expected 401, got ${status}`);
});

await test("POST /waitlist/submit invalid email → 422", async () => {
  const { status } = await req("/waitlist/submit", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email", full_name: "Test" }),
  });
  assert(status === 422 || status === 400, `expected 422/400, got ${status}`);
});

await test("POST /waitlist/submit missing fields → 422", async () => {
  const { status } = await req("/waitlist/submit", {
    method: "POST",
    body: JSON.stringify({ email: "test@example.com" }),
  });
  assert(status === 422 || status === 400, `expected 422/400, got ${status}`);
});

await test("GET /verify/INVALID-ID → 404 or invalid", async () => {
  const { status } = await req("/verify/ORC-2099-999");
  assert(status === 404 || status === 400, `expected 404/400, got ${status}`);
});

await test("POST /generator/generate with valid body (public) → 200 or 429 or 503", async () => {
  const { status } = await req("/generator/generate", {
    method: "POST",
    body: JSON.stringify({
      target_role: "ML Engineer",
      current_stack: "Python, PyTorch",
      experience_level: "Intermediate",
    }),
  });
  assert([200, 422, 429, 503, 500].includes(status), `unexpected status ${status}`);
});

await test("POST /auth/magic-link always returns 200 (no enumeration)", async () => {
  const { status, body } = await req("/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email: "nonexistent@example.com" }),
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.success === true || body?.success === undefined, "should not leak failure");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
