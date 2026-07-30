import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function stripQuotes(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = stripQuotes(m[2]);
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const id = "805512e9-b7de-42ca-b2be-b082b3f046e7";
const step = process.argv[2] ?? "payment";

const appRes = await sb.from("applications").select("id, status").eq("id", id).single();
console.log("fetch app:", appRes.error?.message ?? appRes.data);

if (!appRes.data) process.exit(1);

if (step === "full" || step === "credential") {
  const cred = await sb.from("credentials").select("id").eq("application_id", id).maybeSingle();
  if (cred.data) {
    await sb.from("placement_tracking").delete().eq("credential_id", cred.data.id);
    await sb.from("credentials").delete().eq("id", cred.data.id);
  }
  console.log("credential cleared");
}

if (step === "full" || step === "score") {
  const del = await sb.from("scores").delete().eq("application_id", id);
  console.log("scores delete:", del.error?.message ?? "ok");
}

if (step === "full" || step === "assignment") {
  const t = await sb.from("reviewer_tasks").delete().eq("application_id", id);
  console.log("tasks delete:", t.error?.message ?? "ok");
  const a = await sb.from("reviewer_assignments").delete().eq("application_id", id);
  console.log("assign delete:", a.error?.message ?? "ok");
  await sb.from("applications").update({ workflow_stage: null }).eq("id", id);
}

if (step === "full" || step === "payment") {
  const u = await sb.from("applications").update({
    status: "submitted",
    payment_at: null,
    utr_number: null,
    payment_screenshot_url: null,
    recording_url: null,
    recording_delete_at: null,
  }).eq("id", id);
  console.log("payment reset:", u.error?.message ?? "ok");
}

const after = await sb.from("applications").select("id, status, payment_at").eq("id", id).single();
console.log("after:", after.data);
