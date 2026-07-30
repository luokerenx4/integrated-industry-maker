import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { openFactoryProject, researchFactory, runUntil, writeRunArtifact, type ProjectSelection } from "../packages/inm-core/src/index";

const projectDir = resolve(process.argv[2] ?? join(import.meta.dir, "..", "examples", "ironworks"));
const iterations = Number.parseInt(process.argv[3] ?? "3", 10);
const seed = Number.parseInt(process.argv[4] ?? "42", 10);
if (!Number.isInteger(iterations) || iterations < 0 || !Number.isInteger(seed)) throw new Error("Usage: regenerate-example-runs.ts [project-dir] [iterations] [seed]");

const temporaryRoot = await mkdtemp(join(tmpdir(), "inm-example-runs-"));
const temporaryProject = join(temporaryRoot, basename(projectDir));
const targetRuns = join(projectDir, "runs");
const publicationRoot = await mkdtemp(join(projectDir, ".inm-runs-regenerate-"));

try {
  await cp(projectDir, temporaryProject, {
    recursive: true,
    filter: (source) => {
      const local = relative(projectDir, source);
      return local !== "runs" && !local.startsWith(`runs/`) && local !== ".inm" && !local.startsWith(`.inm/`);
    },
  });
  const result = await researchFactory(temporaryProject, { iterations, seed });
  const demonstrations: Array<{ blueprint: string; selection: ProjectSelection }> = [
    { blueprint: "synthesized", selection: { world: "main", blueprint: "synthesized", scenario: "cold-start", objective: "default" } },
    { blueprint: "stacked-cargo", selection: { world: "main", blueprint: "stacked-cargo", scenario: "stacked-cargo", objective: "stacked-cargo" } },
    { blueprint: "scaled-factory", selection: { world: "scaled", blueprint: "scaled-factory", scenario: "cold-start", objective: "scaled-production" } },
    { blueprint: "chemical-factory", selection: { world: "chemical", blueprint: "chemical-factory", scenario: "chemical-cold-start", objective: "plastic-production" } },
    { blueprint: "xray-cracking-factory", selection: { world: "chemical", blueprint: "xray-cracking-factory", scenario: "chemical-cold-start", objective: "hydrogen-production" } },
  ];
  for (const demonstration of demonstrations) {
    const project = await openFactoryProject(temporaryProject, demonstration.selection);
    const simulation = runUntil(project, undefined, { seed });
    await writeRunArtifact(project, simulation, { label: "simulate", seed, decision: "BASELINE" });
  }
  const generatedRuns = join(temporaryProject, "runs");
  await mkdir(targetRuns, { recursive: true });
  const existingNames = (await readdir(targetRuns, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  let nextNumber = existingNames.reduce(
    (maximum, name) => Math.max(maximum, Number.parseInt(name.slice(0, 3), 10) || 0),
    -1,
  ) + 1;
  const existingResultHashes = new Set<string>();
  for (const name of existingNames) {
    try {
      const manifest = JSON.parse(await readFile(join(targetRuns, name, "manifest.json"), "utf8")) as { resultHash?: unknown };
      if (typeof manifest.resultHash === "string") existingResultHashes.add(manifest.resultHash);
    } catch {
      // Interrupted or non-run directories are not evidence and do not block publication.
    }
  }
  let added = 0;
  let reused = 0;
  for (const name of (await readdir(generatedRuns)).sort()) {
    const source = join(generatedRuns, name);
    const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8")) as { resultHash: string };
    if (existingResultHashes.has(manifest.resultHash)) {
      reused += 1;
      continue;
    }
    const suffix = name.replace(/^\d+-/, "");
    const targetName = `${String(nextNumber).padStart(3, "0")}-${suffix}`;
    nextNumber += 1;
    const staged = join(publicationRoot, targetName);
    await cp(source, staged, { recursive: true, errorOnExist: true });
    await rename(staged, join(targetRuns, targetName));
    existingResultHashes.add(manifest.resultHash);
    added += 1;
  }
  process.stdout.write(`Published ${added} new immutable runs and reused ${reused} exact results in ${targetRuns}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  await rm(publicationRoot, { recursive: true, force: true });
}
