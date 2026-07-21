import { stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const markdown = new Bun.Glob("**/*.md");
const failures: string[] = [];
let checked = 0;

for await (const path of markdown.scan({ cwd: root, onlyFiles: true })) {
  if (path.startsWith("node_modules/") || path.startsWith(".git/") || path.includes("/.inm/")) continue;
  const source = await Bun.file(resolve(root, path)).text();
  for (const match of source.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
    const rawTarget = match[1]!.trim();
    const base = rawTarget.startsWith(".") ? dirname(resolve(root, path)) : root;
    const unresolved = resolve(base, rawTarget);
    const candidates = extname(unresolved) ? [unresolved] : [`${unresolved}.md`, resolve(unresolved, "README.md")];
    const confined = candidates.filter((candidate) => !relative(root, candidate).startsWith(".."));
    let found = false;
    for (const candidate of confined) {
      try { if ((await stat(candidate)).isFile()) { found = true; break; } } catch { /* try the next canonical Markdown target */ }
    }
    checked++;
    if (!found) failures.push(`${path}: unresolved [[${rawTarget}]]`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`✓ ${checked} documentation double-links resolve`);
