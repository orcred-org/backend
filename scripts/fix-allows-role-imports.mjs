import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

function walk(dir, files = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".ts")) files.push(p);
  }
  return files;
}

for (const file of walk(join(process.cwd(), "app"))) {
  let src = readFileSync(file, "utf8");
  if (!src.includes("allowsRole(")) continue;
  if (src.includes("allowsRole }") || src.includes("allowsRole,")) continue;

  const before = src;
  src = src.replace(
    'import { getSessionWithRole, isAllowedAdminIp } from "@/lib/auth/session";',
    'import { getSessionWithRole, isAllowedAdminIp, allowsRole } from "@/lib/auth/session";',
  );
  src = src.replace(
    'import { getSessionWithRole } from "@/lib/auth/session";',
    'import { getSessionWithRole, allowsRole } from "@/lib/auth/session";',
  );

  if (src !== before) {
    writeFileSync(file, src);
    console.log("fixed", file);
  }
}
