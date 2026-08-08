import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

function walk(dir, files = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules") walk(p, files);
    else if (ent.isFile() && ent.name.endsWith(".ts")) files.push(p);
  }
  return files;
}

const replacements = [
  [/if \(session\.role !== "admin"\)/g, 'if (!allowsRole(session, "admin"))'],
  [/if \(session\.role !== "reviewer"\)/g, 'if (!allowsRole(session, "reviewer"))'],
  [/if \(session\.role !== "student"\)/g, 'if (!allowsRole(session, "student"))'],
];

for (const file of walk(join(process.cwd(), "app"))) {
  let src = readFileSync(file, "utf8");
  let changed = false;
  for (const [re, rep] of replacements) {
    if (re.test(src)) {
      src = src.replace(re, rep);
      changed = true;
    }
  }
  if (!changed) continue;
  if (!src.includes("allowsRole") && src.includes('from "@/lib/auth/session"')) {
    src = src.replace(
      /import \{([^}]+)\} from "@\/lib\/auth\/session";/,
      (_m, imports) => {
        const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
        if (!parts.includes("allowsRole")) parts.push("allowsRole");
        return `import { ${parts.join(", ")} } from "@/lib/auth/session";`;
      },
    );
  }
  writeFileSync(file, src);
  console.log("updated", file);
}
