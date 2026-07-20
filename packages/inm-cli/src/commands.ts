import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  InmValidationError, compileFactoryProject, findCachedRun, listRuns, loadFactoryProject, openFactoryProject,
  researchFactory, runUntil, stableStringify, writeRunArtifact, ExternalCommandResearchAgent,
  type FactoryEvent, type FactoryMetrics, type ProjectSelection,
} from "@inm/core";

export interface OutputOptions { json?: boolean }
const write = (value: unknown, json: boolean) => process.stdout.write(json ? `${stableStringify(value, 2)}\n` : String(value));

export async function initCommand(directory: string, options: { force: boolean; json: boolean }): Promise<void> {
  const target = resolve(directory);
  try {
    const entries = await readdir(target);
    if (entries.length && !options.force) throw new Error(`Target directory is not empty: ${target} (use --force to overwrite matching files)`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const template = resolve(import.meta.dir, "../../..", "examples/ironworks");
  await mkdir(target, { recursive: true });
  await cp(template, target, { recursive: true, force: options.force, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  if (options.json) write({ command: "init", projectDir: target }, true);
  else write(`Initialized INM factory project at ${target}\n`, false);
}

export async function validateCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const summary = {
    valid: true, project: project.manifest.name, blueprintHash: project.hashes.blueprintHash,
    devices: Object.keys(project.devices).length, connections: Object.keys(project.connections).length,
  };
  if (options.json) write(summary, true);
  else write(`✓ ${summary.project}: valid (${summary.devices} devices, ${summary.connections} connections)\nBlueprint ${summary.blueprintHash.slice(0, 12)}\n`, false);
}

export async function inspectCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const runs = await listRuns(project.rootDir);
  const behaviorCounts: Record<string, number> = {};
  for (const device of Object.values(project.devices)) behaviorCounts[device.assetDef.behavior.kind] = (behaviorCounts[device.assetDef.behavior.kind] ?? 0) + 1;
  const summary = {
    name: project.manifest.name, rootDir: project.rootDir, bounds: project.blueprint.bounds,
    materials: Object.keys(project.materials), recipes: Object.keys(project.recipes), deviceAssets: Object.keys(project.deviceAssets),
    deviceInstances: Object.keys(project.devices).length, behaviorCounts, connections: Object.keys(project.connections).length,
    scenario: { id: project.scenario.id, durationTicks: project.scenario.durationTicks }, objective: project.objective,
    hashes: project.hashes, runs: runs.map((run) => ({ name: run.name, score: run.score, decision: run.manifest.decision })),
  };
  if (options.json) write(summary, true);
  else write([
    `${summary.name}`, `Project: ${summary.rootDir}`, `Blueprint: ${summary.bounds.width}×${summary.bounds.height}, ${summary.deviceInstances} devices, ${summary.connections} connections`,
    `Materials: ${summary.materials.join(", ")}`, `Recipes: ${summary.recipes.join(", ")}`, `Scenario: ${summary.scenario.id} (${summary.scenario.durationTicks} ticks)`,
    `Objective: ${summary.objective.name} → ${summary.objective.targetMaterial}`, `Runs: ${summary.runs.length}`, "",
  ].join("\n"), false);
}

export async function simulateCommand(projectDir: string, selection: ProjectSelection, options: { seed: number; untilTick?: number; maxEvents?: number; json: boolean }): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const result = runUntil(project, undefined, { seed: options.seed, ...(options.untilTick ? { untilTick: options.untilTick } : {}), ...(options.maxEvents ? { maxEvents: options.maxEvents } : {}) });
  const cached = await findCachedRun(project.rootDir, result.runKey);
  const run = cached ?? await writeRunArtifact(project, result, { label: "simulate", seed: options.seed, decision: "BASELINE" });
  const summary = { command: "simulate", cached: Boolean(cached), run: run.path, resultHash: result.resultHash, runKey: result.runKey, metrics: result.metrics };
  if (options.json) write(summary, true);
  else write([
    `Simulation ${cached ? "reproduced (cached artifact)" : "completed"}`, `Run: ${run.path}`, `Score: ${result.metrics.finalScore.toFixed(3)}`,
    `Throughput: ${result.metrics.throughputPerMinute.toFixed(3)} ${project.objective.targetMaterial}/min`, `Bottleneck: ${result.metrics.bottleneckEntity ?? "none"}`,
    `Result hash: ${result.resultHash}`, "",
  ].join("\n"), false);
}

interface MetricAssertion { kind: "metric"; path: string; min?: number; max?: number; equals?: unknown }
interface EventAssertion { kind: "event"; type: FactoryEvent["type"]; present: boolean }
interface Fixture { name: string; blueprint?: string; scenario?: string; objective?: string; seed?: number; untilTick?: number; assertions: Array<MetricAssertion | EventAssertion> }
function getPath(value: unknown, path: string): unknown { return path.split(".").reduce((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value); }
function assertFixture(fixture: Fixture, metrics: FactoryMetrics, events: FactoryEvent[]): string[] {
  const failures: string[] = [];
  for (const assertion of fixture.assertions) {
    if (assertion.kind === "event") {
      const present = events.some((event) => event.type === assertion.type);
      if (present !== assertion.present) failures.push(`event ${assertion.type} present=${present}, expected ${assertion.present}`);
    } else {
      const actual = getPath(metrics, assertion.path);
      if (typeof assertion.min === "number" && (!(typeof actual === "number") || actual < assertion.min)) failures.push(`${assertion.path}=${String(actual)}, expected >= ${assertion.min}`);
      if (typeof assertion.max === "number" && (!(typeof actual === "number") || actual > assertion.max)) failures.push(`${assertion.path}=${String(actual)}, expected <= ${assertion.max}`);
      if ("equals" in assertion && actual !== assertion.equals) failures.push(`${assertion.path}=${String(actual)}, expected ${String(assertion.equals)}`);
    }
  }
  return failures;
}

export async function testCommand(projectDir: string, options: OutputOptions): Promise<void> {
  const root = resolve(projectDir); const testDir = join(root, "tests");
  const files = (await readdir(testDir)).filter((file) => file.endsWith(".fixture.json") || file.endsWith(".fixture.yaml") || file.endsWith(".fixture.yml")).sort();
  if (!files.length) throw new Error(`No fixtures found in ${testDir}`);
  const results: Array<{ name: string; passed: boolean; failures: string[]; resultHash: string }> = [];
  for (const file of files) {
    const contents = await readFile(join(testDir, file), "utf8");
    const fixture = (file.endsWith(".json") ? JSON.parse(contents) : parseYaml(contents)) as Fixture;
    const project = await openFactoryProject(root, { blueprint: fixture.blueprint, scenario: fixture.scenario, objective: fixture.objective });
    const first = runUntil(project, undefined, { seed: fixture.seed ?? 0, ...(fixture.untilTick ? { untilTick: fixture.untilTick } : {}) });
    const second = runUntil(project, undefined, { seed: fixture.seed ?? 0, ...(fixture.untilTick ? { untilTick: fixture.untilTick } : {}) });
    const failures = assertFixture(fixture, first.metrics, first.events);
    if (first.resultHash !== second.resultHash) failures.push("determinism check failed: identical inputs produced different hashes");
    results.push({ name: fixture.name, passed: failures.length === 0, failures, resultHash: first.resultHash });
  }
  const passed = results.filter((result) => result.passed).length;
  if (options.json) write({ passed, total: results.length, results }, true);
  else for (const result of results) write(`${result.passed ? "✓" : "✗"} ${result.name}${result.failures.length ? `\n  ${result.failures.join("\n  ")}` : ""}\n`, false);
  if (passed !== results.length) throw new Error(`${results.length - passed} fixture(s) failed`);
}

export async function runsCommand(projectDir: string, options: OutputOptions): Promise<void> {
  const runs = await listRuns(resolve(projectDir));
  if (options.json) write(runs.map((run) => ({ name: run.name, path: run.path, score: run.score, decision: run.manifest.decision, resultHash: run.manifest.resultHash })), true);
  else if (!runs.length) write("No completed runs.\n", false);
  else write(`${runs.map((run) => `${run.name.padEnd(52)} ${run.manifest.decision.padEnd(8)} score ${run.score.toFixed(3)}`).join("\n")}\n`, false);
}

export async function researchCommand(projectDir: string, selection: ProjectSelection, options: { iterations: number; seed: number; json: boolean; agentCommand?: string }): Promise<void> {
  const result = await researchFactory(projectDir, { ...selection, iterations: options.iterations, seed: options.seed, ...(options.agentCommand ? { agent: new ExternalCommandResearchAgent(options.agentCommand) } : {}) });
  const summary = {
    baseline: { run: result.baseline.path, score: result.baseline.score }, bestScore: result.bestScore,
    iterations: result.iterations.map((item) => ({ iteration: item.iteration, decision: item.decision, previousScore: item.previousScore, score: item.score, run: item.run.path, hypothesis: item.proposal.hypothesis })),
  };
  if (options.json) write(summary, true);
  else write([
    `000 baseline  score ${summary.baseline.score.toFixed(3)}`,
    ...summary.iterations.map((item) => `${String(item.iteration).padStart(3, "0")} ${item.hypothesis.slice(0, 45).padEnd(45)} score ${item.score.toFixed(3)} ${item.decision}`),
    `Best score: ${summary.bestScore.toFixed(3)}`, "",
  ].join("\n"), false);
}

export function formatCliError(error: unknown, json: boolean): string {
  if (error instanceof InmValidationError) return json ? `${stableStringify({ error: "validation", issues: error.issues }, 2)}\n` : `Validation failed:\n${error.issues.map((issue) => `  ${issue.path} [${issue.code}] ${issue.message}`).join("\n")}\n`;
  const message = error instanceof Error ? error.message : String(error);
  return json ? `${stableStringify({ error: "runtime", message }, 2)}\n` : `Error: ${message}\n`;
}
