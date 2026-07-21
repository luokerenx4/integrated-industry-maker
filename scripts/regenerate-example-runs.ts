import { cp, mkdtemp, rename, rm } from "node:fs/promises";
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
const backupRuns = join(temporaryRoot, "previous-runs");

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
  await rename(targetRuns, backupRuns);
  try {
    await cp(generatedRuns, targetRuns, { recursive: true, errorOnExist: true });
  } catch (error) {
    await rm(targetRuns, { recursive: true, force: true });
    await rename(backupRuns, targetRuns);
    throw error;
  }
  process.stdout.write(`Regenerated ${result.iterations.length + 1 + demonstrations.length} immutable runs in ${targetRuns}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
