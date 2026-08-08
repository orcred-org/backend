import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.log("FAIL: .env.local not found");
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i <= 0) continue;
  const key = trimmed.slice(0, i).trim();
  let val = trimmed.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (key === "DAILY_API_KEY") process.env.DAILY_API_KEY = val;
}

if (!process.env.DAILY_API_KEY) {
  console.log("FAIL: DAILY_API_KEY not set in .env.local");
  process.exit(1);
}

const res = await fetch("https://api.daily.co/v1/", {
  headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
});
const body = await res.json().catch(() => ({}));

if (res.ok) {
  const domain = body.domain ?? body.name ?? "(unknown domain)";
  console.log(`OK: Daily API key valid — subdomain ${domain}`);
  process.exit(0);
}

console.log(`FAIL: Daily API returned HTTP ${res.status}`);
if (body.error) console.log(String(body.error));
process.exit(1);
