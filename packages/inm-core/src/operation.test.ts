import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, test } from "bun:test";
import {
  applyCandidateOperation,
  analyzeProjectOperation,
  evaluateBenchmarkOperation,
  planProjectOperation,
  simulateProjectOperation,
  validateProjectOperation,
} from "./operation";
import { previewCandidateChangeSet } from "./candidate-change-set";

const repository = resolve(import.meta.dir, "../../..");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryProject(example: "ironworks" | "memory-fab"): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), `inm-operation-${example}-`));
  temporaryDirectories.push(parent);
  const projectDir = join(parent, example);
  await cp(join(repository, "examples", example), projectDir, { recursive: true });
  await rm(join(projectDir, "runs"), { recursive: true, force: true });
  return projectDir;
}

test("named read-only operations share one serializable result contract", async () => {
  const projectDir = await temporaryProject("ironworks");
  const [validation, analysis, plan] = await Promise.all([
    validateProjectOperation(projectDir),
    analyzeProjectOperation(projectDir),
    planProjectOperation(projectDir),
  ]);

  for (const result of [validation, analysis, plan]) {
    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: "completed",
      effect: "read-only",
      durationMs: expect.any(Number),
      context: expect.objectContaining({ project: expect.objectContaining({ id: "ironworks", rootDir: projectDir }), hashes: expect.any(Object) }),
      artifacts: [],
      writeSet: [],
      verification: expect.any(Array),
    }));
  }
  expect(validation.data.valid).toBeTrue();
  expect(analysis.data.productionGraph.targetResource).toBe("gear");
  expect(plan.data.targetResource).toBe("gear");
});

test("simulation declares and reuses one immutable run artifact", async () => {
  const projectDir = await temporaryProject("ironworks");
  const first = await simulateProjectOperation(projectDir, {}, { seed: 17, untilTick: 5_000 });
  const second = await simulateProjectOperation(projectDir, {}, { seed: 17, untilTick: 5_000 });

  expect(first).toEqual(expect.objectContaining({
    operation: "simulate",
    effect: "creates-artifact",
    artifacts: [expect.objectContaining({ kind: "run", immutable: true })],
    writeSet: [`runs/${first.data.run.id}/`],
  }));
  expect(first.data.cached).toBeFalse();
  expect(second.data.cached).toBeTrue();
  expect(second.data.resultHash).toBe(first.data.resultHash);
  expect(second.data.run).toEqual(first.data.run);
  expect(second.writeSet).toEqual([]);
});

test("Benchmark evaluation uses the same operation result model without writes", async () => {
  const projectDir = await temporaryProject("ironworks");
  const candidatePath = join(projectDir, "blueprints", "power-priority-candidate.blueprint.json");
  const before = await readFile(candidatePath, "utf8");
  const benchmark = await evaluateBenchmarkOperation(projectDir, "power-priority");

  expect(benchmark).toEqual(expect.objectContaining({ operation: "benchmark.evaluate", effect: "read-only", writeSet: [], artifacts: [] }));
  expect(benchmark.data.benchmark).toBe("power-priority");
  expect(await readFile(candidatePath, "utf8")).toBe(before);
});

test("Candidate apply requires project-local immutable review evidence", async () => {
  const projectDir = await temporaryProject("memory-fab");
  const blueprintPath = join(projectDir, "blueprints/equipment-energy-sleep.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  const unrecorded = await previewCandidateChangeSet(projectDir, "stable-furnace-sleep");
  await expect(applyCandidateOperation(projectDir, "stable-furnace-sleep", unrecorded)).rejects.toMatchObject({ code: "candidate.review-required" });
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
});
