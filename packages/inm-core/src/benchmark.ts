import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { compareFactoryBlueprints, type BlueprintMetricSnapshot, type BlueprintSemanticChange, type FactoryBlueprintComparison } from "./blueprint-comparison";
import type { JsonPatchOperation } from "./artifacts";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import type { ProjectHashes } from "./types";
import { atomicWriteJson, hashValue, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const projectHashesSchema = z.object({
  engineVersion: z.string().min(1), resourceCatalogHash: hash, processCatalogHash: hash, routeCatalogHash: hash, deviceCatalogHash: hash,
  worldHash: hash, blueprintHash: hash, scenarioHash: hash, objectiveHash: hash,
}).strict();

export const blueprintBenchmarkSchema = z.object({
  version: z.literal(1), id, name: z.string().min(1),
  baselineBlueprint: id, candidateBlueprint: id,
  cases: z.array(z.object({
    id, name: z.string().min(1), world: id, scenario: id, objective: id,
    seed: z.number().int().nonnegative(), weight: z.number().positive(),
  }).strict()).min(1),
  acceptance: z.object({
    minimumAggregateScoreDelta: z.number().positive().default(0.000001),
    maximumCaseScoreRegression: z.number().nonnegative().default(0),
    requireCandidateCapacityReady: z.boolean().default(false),
  }).strict().default({}),
  lock: z.object({ contractHash: hash, cases: z.record(projectHashesSchema) }).strict().optional(),
}).strict();

export type BlueprintBenchmarkManifest = z.infer<typeof blueprintBenchmarkSchema>;

export interface BlueprintBenchmarkCaseResult {
  id: string;
  name: string;
  weight: number;
  seed: number;
  durationTicks: number;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  baselineMetrics: BlueprintMetricSnapshot;
  candidateMetrics: BlueprintMetricSnapshot;
  baselineCapacityReady: boolean;
  candidateCapacityReady: boolean;
  candidateCapacityGaps: string[];
}

export interface BlueprintBenchmarkResult {
  benchmark: string;
  name: string;
  baselineBlueprint: string;
  candidateBlueprint: string;
  baselineBlueprintHash: string;
  candidateBlueprintHash: string;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  worstCaseBaselineScore: number;
  worstCaseCandidateScore: number;
  minimumCaseScoreDelta: number;
  verdict: "KEEP" | "DISCARD" | "UNCHANGED";
  accepted: boolean;
  reasons: string[];
  totalSimulationTicks: number;
  cases: BlueprintBenchmarkCaseResult[];
  patch: JsonPatchOperation[];
  changes: BlueprintSemanticChange[];
}

export interface BlueprintBenchmarkSummary {
  id: string;
  name: string;
  baselineBlueprint: string;
  candidateBlueprint: string;
  locked: boolean;
  contractHash: string | null;
  cases: BlueprintBenchmarkManifest["cases"];
  acceptance: BlueprintBenchmarkManifest["acceptance"];
}

function benchmarkPath(projectDir: string, benchmarkId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(benchmarkId)) throw new Error("Benchmark id must use lowercase kebab-case");
  return join(resolve(projectDir), "benchmarks", `${benchmarkId}.benchmark.json`);
}

function benchmarkContract(manifest: BlueprintBenchmarkManifest): unknown {
  return {
    version: manifest.version, id: manifest.id, name: manifest.name,
    baselineBlueprint: manifest.baselineBlueprint, candidateBlueprint: manifest.candidateBlueprint,
    cases: manifest.cases, acceptance: manifest.acceptance,
  };
}

async function openSelectedProject(projectDir: string, selection: ProjectSelection) {
  return compileFactoryProject(await loadFactoryProject(projectDir, selection));
}

function parseBlueprintBenchmark(value: unknown, benchmarkId: string): BlueprintBenchmarkManifest {
  const parsed = blueprintBenchmarkSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Blueprint benchmark '${benchmarkId}': ${parsed.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`);
  if (parsed.data.id !== benchmarkId) throw new Error(`Benchmark id '${parsed.data.id}' must match filename '${benchmarkId}'`);
  if (parsed.data.baselineBlueprint === parsed.data.candidateBlueprint) throw new Error(`Blueprint benchmark '${benchmarkId}' must keep baseline and candidate files separate`);
  const ids = new Set<string>();
  for (const item of parsed.data.cases) {
    if (ids.has(item.id)) throw new Error(`Blueprint benchmark '${benchmarkId}' repeats case id '${item.id}'`);
    ids.add(item.id);
  }
  return parsed.data;
}

export async function loadBlueprintBenchmark(projectDir: string, benchmarkId: string): Promise<BlueprintBenchmarkManifest> {
  return parseBlueprintBenchmark(await readJson(benchmarkPath(projectDir, benchmarkId)), benchmarkId);
}

export async function listBlueprintBenchmarks(projectDir: string): Promise<BlueprintBenchmarkSummary[]> {
  const directory = join(resolve(projectDir), "benchmarks");
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const ids = files.filter((file) => file.endsWith(".benchmark.json"))
    .map((file) => file.slice(0, -".benchmark.json".length)).sort();
  return Promise.all(ids.map(async (benchmarkId) => {
    const manifest = await loadBlueprintBenchmark(projectDir, benchmarkId);
    return {
      id: manifest.id,
      name: manifest.name,
      baselineBlueprint: manifest.baselineBlueprint,
      candidateBlueprint: manifest.candidateBlueprint,
      locked: Boolean(manifest.lock),
      contractHash: manifest.lock?.contractHash ?? null,
      cases: manifest.cases.map((item) => ({ ...item })),
      acceptance: { ...manifest.acceptance },
    };
  }));
}

export async function lockBlueprintBenchmark(projectDir: string, benchmarkId: string): Promise<BlueprintBenchmarkManifest> {
  const source = await readJson(benchmarkPath(projectDir, benchmarkId)) as Record<string, unknown>;
  const manifest = parseBlueprintBenchmark(Object.fromEntries(Object.entries(source).filter(([key]) => key !== "lock")), benchmarkId);
  const cases: Record<string, ProjectHashes> = {};
  for (const item of manifest.cases) {
    const baseline = await openSelectedProject(projectDir, {
      world: item.world, blueprint: manifest.baselineBlueprint, scenario: item.scenario, objective: item.objective,
    });
    cases[item.id] = baseline.hashes;
  }
  const locked: BlueprintBenchmarkManifest = {
    ...manifest,
    lock: { contractHash: hashValue(benchmarkContract(manifest)), cases },
  };
  await atomicWriteJson(benchmarkPath(projectDir, benchmarkId), locked);
  return locked;
}

function assertBenchmarkLock(manifest: BlueprintBenchmarkManifest, benchmarkId: string): asserts manifest is BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> } {
  if (!manifest.lock) throw new Error(`Blueprint benchmark '${benchmarkId}' is unlocked; run inm benchmark <path> --benchmark ${benchmarkId} --lock`);
  const contractHash = hashValue(benchmarkContract(manifest));
  if (manifest.lock.contractHash !== contractHash) throw new Error(`Blueprint benchmark '${benchmarkId}' contract changed after locking; review it and run --lock explicitly`);
  const expectedCaseIds = [...manifest.cases.map((item) => item.id)].sort();
  const lockedCaseIds = Object.keys(manifest.lock.cases).sort();
  if (hashValue(expectedCaseIds) !== hashValue(lockedCaseIds)) throw new Error(`Blueprint benchmark '${benchmarkId}' case set differs from its lock`);
}

function assertLockedHashes(benchmarkId: string, caseId: string, expected: ProjectHashes, actual: ProjectHashes): void {
  for (const key of Object.keys(expected) as Array<keyof ProjectHashes>) if (expected[key] !== actual[key]) {
    throw new Error(`Blueprint benchmark '${benchmarkId}' fixed input drifted in case '${caseId}': ${key} ${expected[key]} → ${actual[key]}`);
  }
}

export async function evaluateBlueprintBenchmark(projectDir: string, benchmarkId: string): Promise<BlueprintBenchmarkResult> {
  const manifest = await loadBlueprintBenchmark(projectDir, benchmarkId);
  assertBenchmarkLock(manifest, benchmarkId);
  const comparisons: FactoryBlueprintComparison[] = [];
  const cases: BlueprintBenchmarkCaseResult[] = [];
  let weightedBaseline = 0; let weightedCandidate = 0; let totalWeight = 0; let totalSimulationTicks = 0;
  for (const item of manifest.cases) {
    const selection = { world: item.world, scenario: item.scenario, objective: item.objective };
    const baseline = await openSelectedProject(projectDir, { ...selection, blueprint: manifest.baselineBlueprint });
    assertLockedHashes(benchmarkId, item.id, manifest.lock.cases[item.id]!, baseline.hashes);
    const candidate = await openSelectedProject(projectDir, { ...selection, blueprint: manifest.candidateBlueprint });
    const comparison = compareFactoryBlueprints(baseline, candidate, {
      seed: item.seed, fromLabel: manifest.baselineBlueprint, toLabel: manifest.candidateBlueprint,
    });
    comparisons.push(comparison);
    weightedBaseline += comparison.from.metrics.score * item.weight;
    weightedCandidate += comparison.to.metrics.score * item.weight;
    totalWeight += item.weight;
    totalSimulationTicks += baseline.scenario.durationTicks * 2;
    cases.push({
      id: item.id, name: item.name, weight: item.weight, seed: item.seed, durationTicks: baseline.scenario.durationTicks,
      baselineScore: comparison.from.metrics.score, candidateScore: comparison.to.metrics.score, scoreDelta: comparison.delta.score,
      baselineMetrics: comparison.from.metrics, candidateMetrics: comparison.to.metrics,
      baselineCapacityReady: comparison.from.capacityPlan.ready, candidateCapacityReady: comparison.to.capacityPlan.ready,
      candidateCapacityGaps: comparison.to.capacityPlan.gaps.map((gap) => `[${gap.kind}] ${gap.message}`),
    });
  }
  const baselineScore = weightedBaseline / totalWeight; const candidateScore = weightedCandidate / totalWeight;
  const scoreDelta = candidateScore - baselineScore; const reasons: string[] = [];
  const worstCaseBaselineScore = Math.min(...cases.map((item) => item.baselineScore));
  const worstCaseCandidateScore = Math.min(...cases.map((item) => item.candidateScore));
  const minimumCaseScoreDelta = Math.min(...cases.map((item) => item.scoreDelta));
  if (scoreDelta + 1e-12 < manifest.acceptance.minimumAggregateScoreDelta) reasons.push(
    `aggregate score delta ${scoreDelta.toFixed(6)} is below required ${manifest.acceptance.minimumAggregateScoreDelta.toFixed(6)}`,
  );
  for (const item of cases) if (item.scoreDelta < -manifest.acceptance.maximumCaseScoreRegression - 1e-9) reasons.push(
    `case '${item.id}' regressed by ${(-item.scoreDelta).toFixed(6)}, above allowed ${manifest.acceptance.maximumCaseScoreRegression.toFixed(6)}`,
  );
  if (manifest.acceptance.requireCandidateCapacityReady) for (const item of cases) if (!item.candidateCapacityReady) reasons.push(
    `case '${item.id}' has ${item.candidateCapacityGaps.length} target-rate capacity gap(s)`,
  );
  const accepted = reasons.length === 0;
  return {
    benchmark: manifest.id, name: manifest.name,
    baselineBlueprint: manifest.baselineBlueprint, candidateBlueprint: manifest.candidateBlueprint,
    baselineBlueprintHash: comparisons[0]!.from.blueprintHash, candidateBlueprintHash: comparisons[0]!.to.blueprintHash,
    baselineScore, candidateScore, scoreDelta, worstCaseBaselineScore, worstCaseCandidateScore, minimumCaseScoreDelta,
    verdict: Math.abs(scoreDelta) <= 1e-9 ? "UNCHANGED" : accepted ? "KEEP" : "DISCARD",
    accepted, reasons, totalSimulationTicks, cases,
    patch: comparisons[0]!.patch, changes: comparisons[0]!.changes,
  };
}
