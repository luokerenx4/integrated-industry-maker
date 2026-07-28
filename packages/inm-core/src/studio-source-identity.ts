import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const repository = resolve(import.meta.dir, "../../..");
const sourceDirectories = [
  join(repository, "packages/inm-core/src"),
  join(repository, "packages/inm-cli/src"),
  join(repository, "packages/inm-studio/src"),
];
const sourceFiles = [
  join(repository, "package.json"),
  join(repository, "bun.lock"),
];

function runtimeSourceFile(name: string): boolean {
  return /\.(?:css|json|ts|tsx)$/.test(name)
    && !name.includes(".test.")
    && !name.endsWith(".snap");
}

async function collectRuntimeSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectRuntimeSourceFiles(path));
    else if (entry.isFile() && runtimeSourceFile(entry.name)) files.push(path);
  }
  return files;
}

export async function studioSourceHash(): Promise<string> {
  const override = process.env.INM_STUDIO_SOURCE_HASH_OVERRIDE;
  if (override !== undefined) {
    if (!/^[0-9a-f]{64}$/.test(override)) throw new Error("INM_STUDIO_SOURCE_HASH_OVERRIDE must be a lowercase SHA-256 value");
    return override;
  }

  const files = [
    ...sourceFiles,
    ...(await Promise.all(sourceDirectories.map(collectRuntimeSourceFiles))).flat(),
  ].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(repository, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
