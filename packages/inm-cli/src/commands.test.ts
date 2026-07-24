import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashValue, listRuns, listWorkspaceProjects, lockBlueprintBenchmark, openFactoryProject, openProjectWorkbenchSnapshot, pathExists, planProductionCapacity, resolveProjectDirectory } from "@inm/core";
import { compareCommand, projectCreateCommand, projectDefaultCommand, synthesizeCommand, workspaceInitCommand } from "./commands";

const repository = resolve(import.meta.dir, "../../..");

async function runCli(args: string[]) {
  const child = Bun.spawn([process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), ...args], {
    cwd: repository, stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("one workspace creates, selects, and isolates multiple self-contained projects", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-workspace-")); const workspace = join(parent, "engine");
  await workspaceInitCommand(workspace, { name: "Test Engine", json: false });
  await projectCreateCommand(workspace, "alpha-works", { name: "Alpha Works", json: false });
  await projectCreateCommand(workspace, "beta-works", { name: "Beta Works", json: false });

  const projects = await listWorkspaceProjects(workspace);
  expect(projects.map((project) => project.id)).toEqual(["alpha-works", "beta-works"]);
  expect(projects.find((project) => project.id === "alpha-works")!.isDefault).toBeTrue();
  expect(await resolveProjectDirectory(workspace)).toBe(join(workspace, "projects", "alpha-works"));
  expect(await resolveProjectDirectory(workspace, "beta-works")).toBe(join(workspace, "projects", "beta-works"));

  const alphaDir = await resolveProjectDirectory(workspace, "alpha-works"); const betaDir = await resolveProjectDirectory(workspace, "beta-works");
  const alpha = await openFactoryProject(alphaDir); const beta = await openFactoryProject(betaDir);
  expect(alpha.manifest.id).toBe("alpha-works"); expect(beta.manifest.id).toBe("beta-works");
  expect(alpha.hashes.deviceCatalogHash).toBe(beta.hashes.deviceCatalogHash);
  expect(await readFile(join(alphaDir, "AUTORESEARCH.md"), "utf8")).toContain("blueprints/autoresearch.blueprint.json");
  expect(JSON.parse(await readFile(join(alphaDir, "benchmarks/autoresearch.benchmark.json"), "utf8")).candidateBlueprint).toBe("autoresearch");

  const alphaVisual = join(alphaDir, "assets", "devices", "smelter", "visual.json");
  const betaVisual = join(betaDir, "assets", "devices", "smelter", "visual.json");
  const originalBetaVisual = await readFile(betaVisual, "utf8");
  await writeFile(alphaVisual, (await readFile(alphaVisual, "utf8")).replace("#e26437", "#112233"));
  expect(await readFile(betaVisual, "utf8")).toBe(originalBetaVisual);
  expect((await openFactoryProject(alphaDir)).hashes.deviceCatalogHash).not.toBe((await openFactoryProject(betaDir)).hashes.deviceCatalogHash);

  await projectDefaultCommand(workspace, "beta-works", { json: false });
  expect(await resolveProjectDirectory(workspace)).toBe(betaDir);
  expect(await resolveProjectDirectory(betaDir)).toBe(betaDir);
});

test("synthesize command writes a new compileable blueprint and refuses overwrite", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-synthesize-")); const projectDir = join(parent, "ironworks");
  await cp(resolve(import.meta.dir, "../../../examples/ironworks"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") });
  await synthesizeCommand(projectDir, { blueprint: "blank", scenario: "cold-start" }, { output: "generated-test", json: false });
  const project = await openFactoryProject(projectDir, { blueprint: "generated-test", scenario: "cold-start" });
  expect(planProductionCapacity(project).ready).toBeTrue();
  expect(synthesizeCommand(projectDir, { blueprint: "blank", scenario: "cold-start" }, { output: "generated-test", json: false })).rejects.toThrow("Blueprint already exists");
});

test("synthesize command executes a project-local TypeScript strategy from a blank memory-fab site", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-memory-synthesize-")); const projectDir = join(parent, "memory-fab");
  await cp(resolve(import.meta.dir, "../../../examples/memory-fab"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") });
  await synthesizeCommand(projectDir, { blueprint: "greenfield", scenario: "production-window", objective: "dram-output" }, { output: "generated-test", json: false });
  const project = await openFactoryProject(projectDir, { blueprint: "generated-test", scenario: "production-window", objective: "dram-output" });
  expect(project.blueprint.devices).toHaveLength(56);
  expect(planProductionCapacity(project).ready).toBeTrue();
}, 10_000);

test("compare command evaluates two Blueprints without writing a run artifact", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-compare-")); const projectDir = join(parent, "ironworks");
  await cp(resolve(import.meta.dir, "../../../examples/ironworks"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") });
  const mainPath = join(projectDir, "blueprints", "main.blueprint.json"); const candidatePath = join(projectDir, "blueprints", "candidate.blueprint.json");
  const candidate = JSON.parse(await readFile(mainPath, "utf8"));
  candidate.devices.find((device: { id: string }) => device.id === "assembler-1").recipe.mode = "accelerated";
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  const mainBefore = await readFile(mainPath, "utf8"); const candidateBefore = await readFile(candidatePath, "utf8");

  await compareCommand(projectDir, {}, { fromBlueprint: "main", toBlueprint: "candidate", seed: 42, json: false });

  expect(await listRuns(projectDir)).toHaveLength(0);
  expect(await readFile(mainPath, "utf8")).toBe(mainBefore);
  expect(await readFile(candidatePath, "utf8")).toBe(candidateBefore);
});

test("CLI-only operator discovers, inspects, previews, applies, and verifies an outcome-guarded Candidate", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-candidate-cli-")); const projectDir = join(parent, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  for (const candidateId of [
    "commissioned-greenfield-dram-fab",
    "continuous-deep-metrology",
    "dedicated-etch-quality-cell",
    "furnace-flex-dual-service",
    "inspection-edd-resilience",
    "layer-two-lithography-capacity",
    "planned-lithography-maintenance",
    "portfolio-aware-dram-dispatch",
    "stable-furnace-sleep",
  ]) {
    await rm(join(projectDir, `candidates/${candidateId}.candidate.json`), { force: true });
    await rm(join(projectDir, `candidate-reviews/${candidateId}`), { recursive: true, force: true });
  }
  await rm(join(projectDir, "candidate-reviews/commissioned-release-control"), { recursive: true, force: true });
  const benchmarkPath = join(projectDir, "benchmarks/greenfield-dram-design.benchmark.json");
  const historicalBenchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
  historicalBenchmark.acceptance.outcomeGuardrails = historicalBenchmark.acceptance.outcomeGuardrails
    .filter((guardrail: { metric: string }) => guardrail.metric !== "onTimeLots");
  await writeFile(benchmarkPath, `${JSON.stringify(historicalBenchmark, null, 2)}\n`);
  await lockBlueprintBenchmark(projectDir, "greenfield-dram-design");
  const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
  const preReleaseControl = JSON.parse(await readFile(
    join(repository, "examples/memory-fab/runs/067-simulate/blueprint.json"),
    "utf8",
  ));
  preReleaseControl.policies.lotRelease.serviceLevelAfterTicks
    = preReleaseControl.policies.lotRelease.maximumReleaseDelayTicks;
  delete preReleaseControl.policies.lotRelease.maximumReleaseDelayTicks;
  await writeFile(blueprintPath, `${JSON.stringify(preReleaseControl, null, 2)}\n`);
  const candidatePath = join(projectDir, "candidates/commissioned-release-control.candidate.json");
  const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  candidate.baseCandidateHash = hashValue(preReleaseControl);
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  const before = await readFile(blueprintPath, "utf8");
  const discovery = await runCli(["help", "--json"]);
  expect({ exitCode: discovery.exitCode, stderr: discovery.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect((JSON.parse(discovery.stdout).data.commands as Array<{ id: string }>).map((command) => command.id)).toContain("candidate");
  const inspection = await runCli(["inspect", projectDir, "--section", "candidates", "--json"]);
  expect({ exitCode: inspection.exitCode, stderr: inspection.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(inspection.stdout).data.result).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "commissioned-release-control", benchmark: "greenfield-dram-design" }),
  ]));
  const runCandidate = async (apply = false) => {
    const child = Bun.spawn([
      process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), "candidate", projectDir,
      "--candidate", "commissioned-release-control", ...(apply ? ["--apply"] : []), "--json",
    ], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    return { stdout, stderr, exitCode };
  };
  const { stdout, stderr, exitCode } = await runCandidate();
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const result = JSON.parse(stdout);
  expect(result).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "candidate" }));
  expect(result.data).toEqual(expect.objectContaining({
    section: "summary",
    result: expect.objectContaining({
      action: "preview", candidate: "commissioned-release-control", verdict: "KEEP", scoreDelta: expect.any(Number),
      outcomeGuardrails: expect.objectContaining({ total: 6, passed: 6, failed: 0, evidence: expect.any(Array) }),
    }),
    operation: expect.objectContaining({
      operation: "candidate.preview", effect: "creates-artifact",
      writeSet: [expect.stringContaining("candidate-reviews/commissioned-release-control/")],
      artifacts: [expect.objectContaining({ kind: "candidate-review", immutable: true })],
    }),
  }));
  expect(result.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  expect(result.nextActions).toEqual([expect.objectContaining({ id: "candidate.apply", effect: "mutates-project" })]);
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
  const reviewedAction = await runCli(["inspect", projectDir, "--section", "next-action", "--json"]);
  const reviewedEnvelope = JSON.parse(reviewedAction.stdout);
  expect(reviewedEnvelope.data.result).toEqual(expect.objectContaining({ id: "candidate.apply:commissioned-release-control", requiresConfirmation: true }));
  expect(reviewedEnvelope.nextActions).toEqual([reviewedEnvelope.data.result]);

  const applied = await runCandidate(true);
  expect({ exitCode: applied.exitCode, stderr: applied.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(applied.stdout)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: true, command: "candidate",
    data: expect.objectContaining({
      section: "summary", result: expect.objectContaining({
        action: "apply", applied: true,
        outcomeGuardrails: expect.objectContaining({ total: 6, passed: 6, failed: 0 }),
      }),
      operation: expect.objectContaining({ operation: "candidate.apply", effect: "mutates-blueprint", writeSet: [blueprintPath] }),
    }),
  }));
  expect(await readFile(blueprintPath, "utf8")).not.toBe(before);
  const postApply = await runCli(["inspect", projectDir, "--section", "candidates", "--json"]);
  const postApplyEnvelope = JSON.parse(postApply.stdout);
  expect(postApplyEnvelope.data.result.find((candidate: { id: string }) => candidate.id === "commissioned-release-control").decision).toEqual(expect.objectContaining({ state: "verified", verdict: "KEEP" }));
  expect(postApplyEnvelope.nextActions[0].id.startsWith("candidate.")).toBeFalse();

  const verified = await runCli(["benchmark", projectDir, "--benchmark", "greenfield-dram-design", "--json"]);
  expect({ exitCode: verified.exitCode, stderr: verified.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(verified.stdout).data).toEqual(expect.objectContaining({
    result: expect.objectContaining({
      benchmark: "greenfield-dram-design", verdict: "KEEP",
      outcomeGuardrails: expect.objectContaining({ total: 6, passed: 6, failed: 0 }),
    }),
    operation: expect.objectContaining({ operation: "benchmark.evaluate", effect: "read-only" }),
  }));

  const replay = await runCandidate(true);
  expect({ exitCode: replay.exitCode, stdout: replay.stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(JSON.parse(replay.stderr)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: false, command: "candidate",
    error: expect.objectContaining({ code: "candidate.stale-base", retryable: false, hashes: expect.objectContaining({ expectedBaseHash: expect.any(String), currentCandidateHash: expect.any(String) }) }),
  }));
}, 90_000);

test("current memory-fab Benchmark exposes the explicit on-time service contract", async () => {
  const result = await runCli([
    "benchmark",
    join(repository, "examples/memory-fab"),
    "--benchmark",
    "greenfield-dram-design",
    "--section",
    "all",
    "--json",
  ]);
  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const evaluation = JSON.parse(result.stdout).data.result;
  expect(evaluation).toEqual(expect.objectContaining({
    verdict: "KEEP",
    accepted: true,
    outcomeGuardrails: expect.arrayContaining([
      expect.objectContaining({ id: "preserve-on-time-service", passed: true }),
    ]),
  }));
  expect(evaluation.outcomeGuardrails).toHaveLength(7);
  expect(evaluation.outcomeGuardrails.every((guardrail: { passed: boolean }) => guardrail.passed)).toBe(true);
  expect(evaluation.outcomeGuardrails.find((guardrail: { id: string }) =>
    guardrail.id === "preserve-on-time-service")).toEqual({
    id: "preserve-on-time-service",
    metric: "onTimeLots",
    label: "On-time lots",
    operator: "minimum",
    passed: true,
    cases: [
      expect.objectContaining({ id: "steady-production", candidateValue: 12, threshold: 12, candidatePassed: true }),
      expect.objectContaining({ id: "mixed-quality", candidateValue: 11, threshold: 10, candidatePassed: true }),
      expect.objectContaining({ id: "quality-excursion", candidateValue: 12, threshold: 8, candidatePassed: true }),
      expect.objectContaining({ id: "lithography-interruption", candidateValue: 9, threshold: 7, candidatePassed: true }),
      expect.objectContaining({ id: "facility-interruption", candidateValue: 9, threshold: 9, candidatePassed: true }),
    ],
  });
  const interruption = evaluation.cases.find((item: { id: string }) => item.id === "lithography-interruption");
  expect(interruption).toEqual(expect.objectContaining({
    scoreBreakdownDelta: expect.objectContaining({ wip: expect.any(Number), cycleTime: expect.any(Number), tardiness: expect.any(Number) }),
    baselineMetrics: expect.objectContaining({ scoreBreakdown: expect.objectContaining({ deliveryValue: expect.any(Number), wip: expect.any(Number) }) }),
    candidateMetrics: expect.objectContaining({ scoreBreakdown: expect.objectContaining({ deliveryValue: expect.any(Number), wip: expect.any(Number) }) }),
  }));
  expect((Object.values(interruption.candidateMetrics.scoreBreakdown) as number[]).reduce((sum, value) =>
    sum + value, 0)).toBeCloseTo(interruption.candidateScore, 12);
}, 60_000);

test("public inspect JSON and next action are the shared Core workbench snapshot", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const [{ stdout, stderr, exitCode }, nextAction, expected] = await Promise.all([
    runCli(["inspect", projectDir, "--section", "all", "--json"]),
    runCli(["inspect", projectDir, "--section", "next-action", "--json"]),
    openProjectWorkbenchSnapshot(projectDir),
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(stdout);
  expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "inspect" }));
  expect(envelope.context).toEqual(expect.objectContaining({ scope: "project", selection: expected.selection && {
    world: expected.selection.world.id, blueprint: expected.selection.blueprint.id,
    scenario: expected.selection.scenario.id, objective: expected.selection.objective.id,
  }, hashes: expected.hashes }));
  expect(envelope.data).toEqual({ section: "all", result: expected });
  const nextEnvelope = JSON.parse(nextAction.stdout);
  expect(nextEnvelope.data).toEqual({ section: "next-action", result: expected.nextAction });
  expect(nextEnvelope.nextActions).toEqual([expected.nextAction]);
});

test("public inspect summary exposes bounded current Design evidence to Agents and humans", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-cli-design-evidence-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("design-runs") && !source.split("/").includes(".inm"),
  });
  const [machine, human] = await Promise.all([
    runCli(["inspect", projectDir, "--json"]),
    runCli(["inspect", projectDir]),
  ]);
  expect({ machine: machine.exitCode, human: human.exitCode, machineStderr: machine.stderr, humanStderr: human.stderr })
    .toEqual({ machine: 0, human: 0, machineStderr: "", humanStderr: "" });
  const programs = JSON.parse(machine.stdout).data.result.designPrograms;
  expect(programs).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "commissioned-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: { state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
    expect.objectContaining({
      id: "greenfield-dram-fab",
      evidence: { state: "not-applicable", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
  ]));
  expect(programs[0].evidence.runs).toBeUndefined();
  expect(human.stdout).toContain("Design handoff: commissioned-dram-fab · MISSING");
});

test("public inspect rejects an invalid explicit selection", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const { stdout, stderr, exitCode } = await runCli(["inspect", projectDir, "--blueprint", "missing-blueprint", "--json"]);
  expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(JSON.parse(stderr)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: false, command: "inspect",
    error: expect.objectContaining({ code: "runtime.failed", message: expect.stringContaining("missing-blueprint.blueprint.json"), retryable: false, issues: [] }),
  }));
});

test("public machine help discovers commands, effects, arguments, defaults, and output sections", async () => {
  const { stdout, stderr, exitCode } = await runCli(["help", "--json"]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(stdout);
  expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "help", context: { scope: "global" } }));
  const commands = envelope.data.commands as Array<{ id: string; effect: string; exitCodes: { success: number; failure: number[]; usage: number }; arguments: Array<{ name: string; default?: unknown }>; outputSections: string[] }>;
  expect(commands.map((command) => command.id)).toContain("candidate");
  expect(commands.map((command) => command.id)).toContain("design");
  expect(commands.find((command) => command.id === "design")!.outputSections).toEqual(["summary", "static", "iterations", "frontier", "best", "runs", "all"]);
  expect(commands.find((command) => command.id === "inspect")!.outputSections).toEqual(["summary", "next-action", "diagnostics", "losses", "catalog", "runs", "experiments", "candidates", "operations", "all"]);
  expect(commands.find((command) => command.id === "simulate")!.effect).toBe("creates-artifact");
  expect(commands.find((command) => command.id === "compare")!.arguments.find((argument) => argument.name === "seed")!.default).toBe(42);
  expect(commands.find((command) => command.id === "inspect")!.exitCodes).toEqual({ success: 0, failure: [1], usage: 2 });
});

test("public schema discovery lists and emits every project artifact JSON Schema", async () => {
  const listed = await runCli(["schema", "--json"]);
  expect({ exitCode: listed.exitCode, stderr: listed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const kinds = JSON.parse(listed.stdout).data.kinds as string[];
  for (const kind of ["manifest", "world", "blueprint", "scenario", "objective", "resource-asset", "device-asset", "process", "benchmark", "candidate", "design-program"]) expect(kinds).toContain(kind);
  for (const kind of kinds) {
    const emitted = await runCli(["schema", kind, "--json"]);
    expect({ kind, exitCode: emitted.exitCode, stderr: emitted.stderr }).toEqual({ kind, exitCode: 0, stderr: "" });
    const envelope = JSON.parse(emitted.stdout);
    expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "schema" }));
    expect(envelope.data.kind).toBe(kind);
    expect(envelope.data.schema).toEqual(expect.objectContaining({ $schema: "http://json-schema.org/draft-07/schema#" }));
    expect(Object.keys(envelope.data.schema).length).toBeGreaterThan(2);
  }
});

test("public Design Program workflow discovers, inspects, and executes without mutating its seed Blueprint", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-design-cli-")); const projectDir = join(parent, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes("design-runs") });
  const benchmarkPath = join(projectDir, "benchmarks/greenfield-dram-design.benchmark.json");
  const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
  delete benchmark.acceptance.outcomeGuardrails;
  await writeFile(benchmarkPath, `${JSON.stringify(benchmark, null, 2)}\n`);
  await lockBlueprintBenchmark(projectDir, "greenfield-dram-design");
  const invalidRunId = "a".repeat(64);
  const invalidRunPath = join(projectDir, "design-runs", "integrated-dram-fab", invalidRunId);
  await mkdir(invalidRunPath, { recursive: true });
  await writeFile(join(invalidRunPath, "manifest.json"), "{}\n");
  await writeFile(join(invalidRunPath, "best.blueprint.json"), "{}\n");
  const commissioningTargetPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
  const commissioningTarget = JSON.parse(await readFile(join(projectDir, "blueprints/greenfield.blueprint.json"), "utf8"));
  commissioningTarget.revision = "memory-fab-generated-target-v1";
  await writeFile(commissioningTargetPath, `${JSON.stringify(commissioningTarget, null, 2)}\n`);
  const seedPath = join(projectDir, "blueprints", "experiment.blueprint.json");
  const seedBefore = await readFile(seedPath, "utf8");

  const listed = await runCli(["design", projectDir, "--json"]);
  expect({ exitCode: listed.exitCode, stderr: listed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(listed.stdout)).toEqual(expect.objectContaining({
    command: "design",
    data: {
      action: "list",
      programs: [
        expect.objectContaining({ id: "commissioned-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
        expect.objectContaining({ id: "greenfield-dram-fab", locked: true, seed: { kind: "synthesis", inputBlueprint: "greenfield" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
        expect.objectContaining({ id: "integrated-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "experiment" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
      ],
    },
    artifacts: [],
  }));

  const inspected = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--json"]);
  expect({ exitCode: inspected.exitCode, stderr: inspected.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const inspection = JSON.parse(inspected.stdout);
  expect(inspection.data).toEqual(expect.objectContaining({
    section: "summary",
    result: expect.objectContaining({
      program: expect.objectContaining({ id: "integrated-dram-fab", currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
      benchmark: expect.objectContaining({ cases: 5 }),
      evidence: { validRuns: 0, invalidRuns: 1 },
    }),
  }));
  expect(inspection.nextActions).toEqual([expect.objectContaining({ id: "design.run:integrated-dram-fab", effect: "creates-artifact" })]);
  expect(await pathExists(join(projectDir, "design-runs"))).toBeTrue();
  const humanInspection = await runCli(["design", projectDir, "--program", "integrated-dram-fab"]);
  expect(humanInspection.stdout).toContain("Current-best guardrail: uniform · max 0.000000 regression/case");
  expect(humanInspection.stdout).toContain("Frontier: 1 leader + up to 1 alternative branch");
  expect(humanInspection.stdout).toContain("Evidence: 0 valid immutable runs · 1 invalid run excluded");
  expect(humanInspection.stdout).toContain(`excluded ${invalidRunId.slice(0, 12)} · design.invalid-run`);

  const generated = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--json"]);
  expect({ exitCode: generated.exitCode, stderr: generated.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(generated.stdout).data.result).toEqual(expect.objectContaining({
    program: expect.objectContaining({ seed: { kind: "synthesis", inputBlueprint: "greenfield" } }),
    seed: expect.objectContaining({ synthesis: expect.objectContaining({ method: "project-strategy", entry: "strategies/reentrant-dram-fab.ts" }) }),
    promotionBase: expect.objectContaining({ blueprint: "generated-dram-fab" }),
    driver: expect.objectContaining({ selection: expect.objectContaining({ blueprint: "generated-dram-fab" }) }),
  }));

  const executed = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run", "--max-candidates", "1", "--progress", "ndjson", "--json"]);
  expect(executed.exitCode).toBe(0);
  const progress = executed.stderr.trim().split("\n").map((line) => JSON.parse(line));
  expect(progress[0]).toEqual(expect.objectContaining({ schemaVersion: 1, type: "progress", command: "design", progress: expect.objectContaining({ phase: "run-started", sequence: 1 }) }));
  expect(progress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "baseline")).toHaveLength(5);
  expect(progress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "seed")).toHaveLength(5);
  expect(progress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "candidate")).toHaveLength(5);
  expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "proposal-started",
    branch: { nodeId: "seed", role: "leader", depth: 0, leaderNodeId: "seed" },
    promotionBoundary: expect.objectContaining({
      leaderNodeId: "seed",
      selectedNodeId: "seed",
      promotable: true,
      limitingCase: null,
      guardrail: expect.objectContaining({ passed: true, violations: [] }),
      cases: expect.arrayContaining([expect.objectContaining({
        leaderScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
        selectedScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
        scoreBreakdownDelta: expect.objectContaining({ wip: expect.any(Number) }),
      })]),
    }),
    driverEvidence: expect.objectContaining({ metricsHash: expect.any(String), fabLoss: expect.objectContaining({ primary: expect.objectContaining({ id: "yield-quality" }) }) }),
  }) }));
  expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "proposal-completed", addressedLoss: "yield-quality",
  }) }));
  expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "candidate-completed",
    frontierEvidence: expect.objectContaining({ parent: { nodeId: "seed", role: "leader", depth: 0 }, leaderAfter: expect.any(String), searchOrderAfter: expect.any(Array), exhaustedAfter: expect.any(Array) }),
    decisionEvidence: expect.objectContaining({
      basis: expect.stringMatching(/current-best-improvement|benchmark-gate|no-current-best-improvement|current-best-case-guardrail/),
      aggregate: expect.objectContaining({ scoreDelta: expect.any(Number) }),
      cases: expect.arrayContaining([expect.objectContaining({
        id: "mixed-quality",
        previousBestScore: expect.any(Number),
        candidateScore: expect.any(Number),
        scoreDelta: expect.any(Number),
        previousBestScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
        candidateScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
        scoreBreakdownDelta: expect.objectContaining({ wip: expect.any(Number) }),
        maximumScoreRegression: 0,
        guardrailPassed: expect.any(Boolean),
      })]),
      guardrail: expect.objectContaining({ kind: "uniform", passed: expect.any(Boolean), violations: expect.any(Array) }),
      limitingCase: expect.any(String),
    }),
  }) }));
  expect(progress.at(-1)).toEqual(expect.objectContaining({ progress: expect.objectContaining({ phase: "run-completed", work: { completedSimulations: 15, plannedSimulations: 15 } }) }));
  const run = JSON.parse(executed.stdout);
  expect(run).toEqual(expect.objectContaining({
    command: "design",
    data: expect.objectContaining({ section: "summary", result: expect.objectContaining({ action: "run", budget: { maximum: 1, evaluated: 1 }, resultHash: expect.any(String) }) }),
    artifacts: [expect.objectContaining({ kind: "design-run", immutable: true })],
  }));
  expect(await pathExists(run.artifacts[0].path)).toBeTrue();
  expect(await readFile(seedPath, "utf8")).toBe(seedBefore);

  const resultHash = run.data.result.resultHash as string;
  const reopened = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--section", "iterations", "--json"]);
  expect({ exitCode: reopened.exitCode, stderr: reopened.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(reopened.stdout)).toEqual(expect.objectContaining({
    command: "design",
    data: { section: "iterations", result: [expect.objectContaining({
      iteration: 1,
      decision: expect.stringMatching(/KEEP|BRANCH|REJECT/),
      addressedLoss: "yield-quality",
      promotionBoundary: expect.objectContaining({ leaderNodeId: "seed", selectedNodeId: "seed", promotable: true, limitingCase: null }),
      driverEvidence: expect.objectContaining({ metricsHash: expect.any(String), fabLoss: expect.objectContaining({ chain: expect.arrayContaining(["yield-quality"]) }) }),
      decisionEvidence: expect.objectContaining({
        aggregate: expect.objectContaining({ previousBestScore: expect.any(Number), candidateScore: expect.any(Number), scoreDelta: expect.any(Number) }),
        cases: expect.arrayContaining([expect.objectContaining({ id: "mixed-quality", scoreDelta: expect.any(Number), maximumScoreRegression: 0, guardrailPassed: expect.any(Boolean) })]),
        guardrail: expect.objectContaining({ kind: "uniform", passed: expect.any(Boolean), violations: expect.any(Array) }),
        limitingCase: expect.any(String),
      }),
      frontierEvidence: expect.objectContaining({ parent: { nodeId: "seed", role: "leader", depth: 0 }, candidateNodeId: "candidate-1" }),
    })] },
    artifacts: [expect.objectContaining({ kind: "design-run", id: resultHash, immutable: true })],
  }));

  const sourceSummary = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--json"]);
  expect(JSON.parse(sourceSummary.stdout).nextActions).toContainEqual(expect.objectContaining({
    id: `design.continue:${resultHash}`,
    argv: expect.arrayContaining(["--run-id", resultHash, "--continue"]),
    effect: "creates-artifact",
  }));

  const continued = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--continue", "--max-candidates", "1", "--progress", "ndjson", "--json"]);
  expect(continued.exitCode).toBe(0);
  const continuationProgress = continued.stderr.trim().split("\n").map((line) => JSON.parse(line));
  expect(continuationProgress[0]).toEqual(expect.objectContaining({ progress: expect.objectContaining({
    version: 2,
    phase: "run-started",
    continuation: { sourceResultHash: resultHash, reusedIterations: 1 },
    budget: { maximum: 2, previousEvaluated: 1, additional: 1 },
  }) }));
  expect(continuationProgress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "baseline")).toHaveLength(5);
  expect(continuationProgress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "seed")).toHaveLength(0);
  expect(continuationProgress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "candidate")).toHaveLength(5);
  const continuedEnvelope = JSON.parse(continued.stdout);
  expect(continuedEnvelope.data).toEqual(expect.objectContaining({
    section: "summary",
    result: expect.objectContaining({
      action: "continue",
      continuation: { sourceResultHash: resultHash, reusedIterations: 1, reusedExhaustions: 0, additionalCandidateBudget: 1 },
      budget: { maximum: 2, evaluated: 2 },
      resultHash: expect.any(String),
    }),
  }));
  const continuedHash = continuedEnvelope.data.result.resultHash as string;
  expect(continuedHash).not.toBe(resultHash);
  const continuedHuman = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", continuedHash]);
  expect(continuedHuman.stdout).toContain(`Continued from: ${resultHash}`);
  expect(continuedHuman.stdout).toContain("reused 1 iterations · +1 candidate budget");

  const humanRun = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash]);
  expect({ exitCode: humanRun.exitCode, stderr: humanRun.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(humanRun.stdout).toContain("addresses yield-quality");
  expect(humanRun.stdout).toContain("observed yield-quality →");
  expect(humanRun.stdout).toContain("before promotion-ready leader");
  expect(humanRun.stdout).toContain("limiting ");
  expect(humanRun.stdout).toContain("Frontier: leader ");

  const frontier = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--section", "frontier", "--json"]);
  expect({ exitCode: frontier.exitCode, stderr: frontier.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(frontier.stdout).data).toEqual({
    section: "frontier",
    result: expect.objectContaining({ leader: expect.any(String), alternatives: expect.any(Array), scheduler: { searchOrder: expect.any(Array), exhausted: expect.any(Array) }, nodes: expect.any(Array), exhaustions: expect.any(Array) }),
  });

  const runs = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--section", "runs", "--json"]);
  expect({ exitCode: runs.exitCode, stderr: runs.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(runs.stdout).data).toEqual({
    section: "runs",
    result: {
      runs: expect.arrayContaining([
        expect.objectContaining({ id: resultHash, program: "integrated-dram-fab", benchmark: "dispatch-research", continuation: null }),
        expect.objectContaining({ id: continuedHash, continuation: expect.objectContaining({ sourceResultHash: resultHash }), budget: { maximum: 2, evaluated: 2 } }),
      ]),
      invalidRuns: [{
        id: invalidRunId,
        path: invalidRunPath,
        program: "integrated-dram-fab",
        code: "design.invalid-run",
        message: `Design run '${invalidRunId}' manifest identity or completion state is invalid`,
      }],
    },
  });
  expect(JSON.parse(runs.stdout).data.result.runs).toHaveLength(2);

  const guardedExecuted = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run", "--max-candidates", "7", "--progress", "ndjson", "--json"]);
  expect(guardedExecuted.exitCode).toBe(0);
  const guardedProgress = guardedExecuted.stderr.trim().split("\n").map((line) => JSON.parse(line));
  expect(guardedProgress.filter((record) => record.progress.phase === "node-exhausted")).toHaveLength(0);
  const guardedRunHash = JSON.parse(guardedExecuted.stdout).data.result.resultHash as string;
  const guardedJson = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash, "--section", "iterations", "--json"]);
  const guardedIterations = JSON.parse(guardedJson.stdout).data.result;
  expect(guardedIterations.map((iteration: {
    iteration: number;
    strategy: string;
    decision: string;
    frontierEvidence: { parent: { nodeId: string }; outcome: string };
  }) => ({
    iteration: iteration.iteration,
    strategy: iteration.strategy,
    decision: iteration.decision,
    parent: iteration.frontierEvidence.parent.nodeId,
    outcome: iteration.frontierEvidence.outcome,
  }))).toEqual([
    { iteration: 1, strategy: "dispatch:conwip-9-6-edd", decision: "KEEP", parent: "seed", outcome: "leader-promoted" },
    { iteration: 2, strategy: "dispatch:probe-highest-priority", decision: "REJECT", parent: "candidate-1", outcome: "rejected" },
    { iteration: 3, strategy: "maintenance:lithography-jobs-6", decision: "REJECT", parent: "candidate-1", outcome: "rejected" },
    { iteration: 4, strategy: "dispatch:conwip-8-5-edd", decision: "KEEP", parent: "candidate-1", outcome: "leader-promoted" },
    { iteration: 5, strategy: "dispatch:conwip-10-7-edd", decision: "REJECT", parent: "candidate-4", outcome: "rejected" },
    { iteration: 6, strategy: "batch-formation:furnace-flex-30000", decision: "REJECT", parent: "candidate-4", outcome: "rejected" },
    { iteration: 7, strategy: "dispatch:inspection-earliest-due-date", decision: "KEEP", parent: "candidate-4", outcome: "leader-promoted" },
  ]);
  expect(guardedIterations.filter((iteration: { decision: string }) => iteration.decision === "KEEP")
    .every((iteration: { decisionEvidence: { guardrail: { passed: boolean } } }) => iteration.decisionEvidence.guardrail.passed)).toBeTrue();
  expect(guardedProgress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "proposal-completed",
    iteration: 7,
    strategy: "dispatch:inspection-earliest-due-date",
    addressedLoss: "queue-congestion",
  }) }));
  expect(guardedProgress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "candidate-completed",
    iteration: 7,
    strategy: "dispatch:inspection-earliest-due-date",
    decision: "KEEP",
  }) }));
  const guardedHuman = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash]);
  expect(guardedHuman.stdout).toContain("007 KEEP   dispatch:inspection-earliest-due-date");
  expect(guardedHuman.stdout).toContain("Frontier: leader candidate-7");
  const guardedFrontier = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash, "--section", "frontier", "--json"]);
  expect(JSON.parse(guardedFrontier.stdout).data.result).toMatchObject({
    leader: "candidate-7",
    alternatives: [],
    scheduler: { searchOrder: ["candidate-7"], exhausted: [] },
    nodes: [
      expect.objectContaining({ nodeId: "candidate-7", role: "leader", searchStatus: "searchable" }),
    ],
    exhaustions: [],
  });

  const commissionedCandidate = "cli-commissioned-greenfield-fab";
  const promoted = await runCli([
    "design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash,
    "--promote", commissionedCandidate, "--json",
  ]);
  expect({ exitCode: promoted.exitCode, stderr: promoted.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const promotedEnvelope = JSON.parse(promoted.stdout);
  expect(promotedEnvelope.artifacts).toEqual([expect.objectContaining({ kind: "candidate", id: commissionedCandidate, immutable: true })]);
  expect(promotedEnvelope.nextActions).toEqual([expect.objectContaining({
    id: `candidate.preview:${commissionedCandidate}`,
    effect: "creates-artifact",
  })]);

  const reviewed = await runCli(["candidate", projectDir, "--candidate", commissionedCandidate, "--json"]);
  expect({ exitCode: reviewed.exitCode, stderr: reviewed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const reviewedEnvelope = JSON.parse(reviewed.stdout);
  expect(reviewedEnvelope.data).toEqual(expect.objectContaining({
    result: expect.objectContaining({
      action: "preview",
      candidate: commissionedCandidate,
      verdict: "KEEP",
      proposedCandidateHash: expect.any(String),
    }),
    operation: expect.objectContaining({
      operation: "candidate.preview",
      effect: "creates-artifact",
      context: expect.objectContaining({ selection: expect.objectContaining({ blueprint: "generated-dram-fab" }) }),
    }),
  }));
  const proposedHash = reviewedEnvelope.data.result.proposedCandidateHash as string;
  expect(reviewedEnvelope.data.operation.context.hashes.blueprintHash).toBe(proposedHash);

  const applied = await runCli(["candidate", projectDir, "--candidate", commissionedCandidate, "--apply", "--json"]);
  expect({ exitCode: applied.exitCode, stderr: applied.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(applied.stdout).data).toEqual(expect.objectContaining({
    result: expect.objectContaining({ action: "apply", applied: true, proposedCandidateHash: proposedHash }),
    operation: expect.objectContaining({ operation: "candidate.apply", effect: "mutates-blueprint" }),
  }));

  if (run.data.result.best.promotionPatchOperations === 0) {
    const refused = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--promote", "no-leading-design", "--json"]);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stderr).error).toEqual(expect.objectContaining({ code: "design.no-leading-candidate" }));
    expect(await pathExists(join(projectDir, "candidates", "no-leading-design.candidate.json"))).toBeFalse();
  }
}, 180_000);

test("public inspect withholds loss authority from a stale Device-catalog run", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const result = await runCli([
    "inspect", projectDir, "--world", "cleanroom", "--blueprint", "equipment-energy-sleep",
    "--scenario", "equipment-energy-window", "--objective", "dram-energy", "--section", "losses", "--json",
  ]);
  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(result.stdout).data).toEqual({ section: "losses", result: null });
});

test("public inspect gives Agents and humans the same current loss contributors", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const machine = await runCli(["inspect", projectDir, "--section", "losses", "--json"]);
  expect({ exitCode: machine.exitCode, stderr: machine.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const lossProfile = JSON.parse(machine.stdout).data.result;
  const qTime = lossProfile.buckets
    .find((bucket: { id: string }) => bucket.id === "q-time");
  const inputStarvation = lossProfile.buckets
    .find((bucket: { id: string }) => bucket.id === "input-starvation");
  const yieldQuality = lossProfile.buckets
    .find((bucket: { id: string }) => bucket.id === "yield-quality");
  const transportBlocking = lossProfile.buckets
    .find((bucket: { id: string }) => bucket.id === "transport-blocking");
  expect(lossProfile.version).toBe(5);
  expect(yieldQuality).toMatchObject({
    subjects: [
      { kind: "device", id: "etch-l2" },
      { kind: "route", id: "dram-front-end" },
      { kind: "project", id: "dram-wafer" },
    ],
    evidence: {
      originContributors: 1,
      authoredDefectInstances: 3,
      preventedDefectInstances: 1,
      appliedDefectInstances: 2,
      preventedLots: 1,
      subjectIntroducedLots: 2,
      subjectPersistentLots: 0,
      subjectScrappedLots: 0,
    },
  });
  expect(yieldQuality.contributors[0]).toMatchObject({
    label: "etch-cell-layer-2",
    mechanism: "quality-excursion",
    defects: ["critical-dimension", "particle-contamination"],
    lots: ["dram-lot-03", "dram-lot-08"],
    evidence: { introducedLots: 2, repairedLots: 2, persistentLots: 0, scrappedLots: 0 },
  });
  expect(inputStarvation).toMatchObject({
    subjects: [{ kind: "device", id: "furnace-1" }],
    evidence: {
      rawWaitingInputTicks: 1_669_016,
      boundaryWaitingInputTicks: 1_179_140,
      exceptionWaitingInputTicks: 232_000,
      starvationTicks: 257_876,
    },
  });
  expect(inputStarvation.contributors[0]).toMatchObject({
    label: "furnace-1",
    mechanism: "inter-job-input-gap",
    evidence: { starvationTicks: 42_456, opportunityWindowTicks: 114_456 },
  });
  expect(qTime).toBeUndefined();
  expect(transportBlocking).toMatchObject({
    evidence: { blockedConnections: 1, blockedItemTicks: 100, connections: 17 },
    subjects: [{ kind: "connection", id: "etch-to-inspection" }],
  });

  const human = await runCli(["inspect", projectDir]);
  expect({ exitCode: human.exitCode, stderr: human.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(human.stdout).toContain("Quality-origin contributors:");
  expect(human.stdout).toContain("etch-cell-layer-2 · quality-excursion · 2 lots / 2 defect instances · 2 rework / 2 repaired / 0 persistent · 0 scrap / 0 escape");
  expect(human.stdout).toContain("Input-starvation contributors:");
  expect(human.stdout).toContain("furnace-1 · inter-job-input-gap · 42.5s input gap / 114.5s opportunity · 12 jobs");
  expect(human.stdout).not.toContain("fab-loss.transport-blocking");
  expect(human.stdout).toContain("Transport-blocking contributors:");
  expect(human.stdout).toContain("etch-to-inspection · 0.1 blocked item-s · 0.9% in-flight blocking · 3.0/240.0 items/min · dram-wafer-lot");
  expect(human.stdout).not.toContain("Q-time contributors:");
});

test("public inspect gives Agents and humans the same exhausted current Design authority", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const [machine, human] = await Promise.all([
    runCli(["inspect", projectDir, "--json"]),
    runCli(["inspect", projectDir]),
  ]);
  expect({ machine: machine.exitCode, human: human.exitCode, machineStderr: machine.stderr, humanStderr: human.stderr })
    .toEqual({ machine: 0, human: 0, machineStderr: "", humanStderr: "" });

  const result = JSON.parse(machine.stdout).data.result;
  const program = result.designPrograms.find((item: { id: string }) => item.id === "commissioned-dram-fab");
  expect(program).toEqual(expect.objectContaining({
    alignment: { state: "aligned", reasons: [] },
    evidence: expect.objectContaining({
      state: "exhausted",
      authorityRunId: "5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9",
      currentRuns: 1,
      historicalRuns: 2,
      invalidRuns: expect.any(Number),
    }),
  }));
  expect(program.evidence.invalidRuns).toBeGreaterThan(0);
  expect(result.nextAction).toEqual(expect.objectContaining({
    title: "Expand Commissioned DRAM Fab Optimization's intervention portfolio",
    actionLabel: "REVIEW EXHAUSTED DESIGN",
    effect: "read-only",
    studioRoute: "/memory-fab/designs/commissioned-dram-fab/runs/5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9",
    target: {
      kind: "design-run",
      programId: "commissioned-dram-fab",
      runId: "5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9",
      phase: "exhausted",
      diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
    },
  }));
  expect(human.stdout).toContain("Design handoff: commissioned-dram-fab · EXHAUSTED · 5942a72740b9");
  const brief = await runCli(["design", projectDir, "--program", "commissioned-dram-fab"]);
  expect({ exitCode: brief.exitCode, stderr: brief.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(brief.stdout).toContain("Evidence: 3 valid immutable runs · 23 invalid runs excluded");
  expect(brief.stdout).toContain("Run: inm design <path> --program commissioned-dram-fab --run");
});

test("dense public JSON defaults to compact summary and selects one explicit section", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const [summaryResult, catalogResult, allResult] = await Promise.all([
    runCli(["inspect", projectDir, "--json"]),
    runCli(["inspect", projectDir, "--section", "catalog", "--json"]),
    runCli(["inspect", projectDir, "--section", "all", "--json"]),
  ]);
  for (const result of [summaryResult, catalogResult, allResult]) expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const summary = JSON.parse(summaryResult.stdout); const catalog = JSON.parse(catalogResult.stdout); const all = JSON.parse(allResult.stdout);
  expect(summary.data.section).toBe("summary");
  expect(summary.data.result.catalog).toBeUndefined();
  expect(catalog.data).toEqual(expect.objectContaining({ section: "catalog", result: expect.objectContaining({ resources: expect.any(Array), devices: expect.any(Array) }) }));
  expect(catalog.data.result.runs).toBeUndefined();
  expect(all.data.section).toBe("all");
  expect(all.data.result).toEqual(expect.objectContaining({ catalog: expect.any(Object), runs: expect.any(Array), operations: expect.any(Array) }));
  expect(summaryResult.stdout.length).toBeLessThan(allResult.stdout.length);
});

test("public industrial commands project shared Core operation metadata", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-cli-operation-"));
  const projectDir = join(parent, "ironworks");
  await cp(join(repository, "examples/ironworks"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") });
  const invocations = [
    { id: "validate", args: ["validate", projectDir, "--json"], effect: "read-only" },
    { id: "analyze", args: ["analyze", projectDir, "--json"], effect: "read-only" },
    { id: "plan", args: ["plan", projectDir, "--json"], effect: "read-only" },
    { id: "simulate", args: ["simulate", projectDir, "--seed", "9", "--until-tick", "1000", "--json"], effect: "creates-artifact" },
  ];
  for (const invocation of invocations) {
    const emitted = await runCli(invocation.args);
    expect({ id: invocation.id, exitCode: emitted.exitCode, stderr: emitted.stderr }).toEqual({ id: invocation.id, exitCode: 0, stderr: "" });
    const envelope = JSON.parse(emitted.stdout);
    expect(envelope.data.operation).toEqual(expect.objectContaining({
      version: 1, operation: invocation.id, effect: invocation.effect, status: "completed",
      context: expect.objectContaining({ project: expect.objectContaining({ id: "ironworks" }), hashes: expect.any(Object) }),
      writeSet: expect.any(Array), verification: expect.any(Array),
    }));
  }
});

test("simulate exposes adaptive cadence policy use equally in human and Agent output", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-cadence-cli-"));
  const projectDir = join(parent, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const sourcePath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
  const blueprint = JSON.parse(await readFile(sourcePath, "utf8"));
  const deposition = blueprint.devices.find((device: { id: string }) => device.id === "deposition-1");
  const normal = structuredClone(deposition.recipe
    ?? deposition.recipes?.find((recipe: { process: string; mode: string }) =>
      recipe.process === "deposit-dielectric-stack" && recipe.mode === "qualified"));
  if (!normal) throw new Error("Missing qualified deposition recipe");
  delete deposition.recipe;
  deposition.recipes = [normal, { ...structuredClone(normal), mode: "agile-pulse" }];
  deposition.policy.cadenceControl = {
    kind: "downstream-starvation-recovery",
    process: "deposit-dielectric-stack",
    normalMode: "qualified",
    recoveryMode: "agile-pulse",
    downstreamConnection: "deposition-to-batch-furnace",
    recoverBelowItems: 1,
    minimumStarvationTicks: 1,
  };
  const cadencePath = join(projectDir, "blueprints/cadence.blueprint.json");
  await writeFile(cadencePath, `${JSON.stringify(blueprint, null, 2)}\n`);

  const machine = await runCli(["simulate", projectDir, "--blueprint", "cadence", "--json"]);
  const human = await runCli(["simulate", projectDir, "--blueprint", "cadence"]);
  expect({ machine: machine.exitCode, human: human.exitCode, machineStderr: machine.stderr, humanStderr: human.stderr })
    .toEqual({ machine: 0, human: 0, machineStderr: "", humanStderr: "" });
  const control = JSON.parse(machine.stdout).data.result.metrics.cadenceControl.devices["deposition-1"];
  expect(control).toEqual(expect.objectContaining({
    normalMode: "qualified",
    recoveryMode: "agile-pulse",
    downstreamConnection: "deposition-to-batch-furnace",
    recoverBelowItems: 1,
    minimumStarvationTicks: 1,
  }));
  expect(control.normalJobs).toBeGreaterThan(0);
  expect(control.recoveryJobs).toBeGreaterThan(0);
  expect(human.stdout).toContain(`Cadence control deposition-1: deposit-dielectric-stack · ${control.normalJobs} qualified / ${control.recoveryJobs} agile-pulse jobs · ${control.recoveryActivations} recovery activations · recover after 0.0s below 1 items on deposition-to-batch-furnace`);

  await writeFile(join(projectDir, "blueprints/experiment.blueprint.json"), `${JSON.stringify(blueprint, null, 2)}\n`);
  const benchmarkMachine = await runCli([
    "benchmark", projectDir, "--benchmark", "dispatch-research", "--section", "cases", "--json",
  ]);
  const benchmarkHuman = await runCli(["benchmark", projectDir, "--benchmark", "dispatch-research"]);
  expect({
    machine: benchmarkMachine.exitCode,
    human: benchmarkHuman.exitCode,
    machineStderr: benchmarkMachine.stderr,
    humanStderr: benchmarkHuman.stderr,
  }).toEqual({ machine: 0, human: 0, machineStderr: "", humanStderr: "" });
  const benchmarkCases = JSON.parse(benchmarkMachine.stdout).data.result as Array<{
    baselineMetrics: { cadenceControl: { devices: Record<string, unknown> } };
    candidateMetrics: { cadenceControl: { devices: Record<string, { normalJobs: number; recoveryJobs: number }> } };
  }>;
  expect(benchmarkCases.every((item) => Object.keys(item.baselineMetrics.cadenceControl.devices).length === 0)).toBeTrue();
  expect(benchmarkCases.every((item) => item.candidateMetrics.cadenceControl.devices["deposition-1"] !== undefined)).toBeTrue();
  expect(benchmarkCases.some((item) => item.candidateMetrics.cadenceControl.devices["deposition-1"]!.recoveryJobs > 0)).toBeTrue();
  expect(benchmarkHuman.stdout).toContain("cadence control:");
  expect(benchmarkHuman.stdout).toContain("deposition-1: OFF →");
  expect(benchmarkHuman.stdout).toContain("recover after 0.0s below 1 items on deposition-to-batch-furnace");
}, 60_000);

test("public CLI emits stable JSON errors for invalid section, section mode, schema kind, and usage", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const cases = [
    { args: ["inspect", projectDir, "--section", "nope", "--json"], exitCode: 1, command: "inspect", code: "cli.invalid-section" },
    { args: ["schema", "nope", "--json"], exitCode: 1, command: "schema", code: "schema.unknown-kind" },
    { args: ["validate", "--json"], exitCode: 2, command: "validate", code: "cli.usage" },
    { args: ["unknown", "--json"], exitCode: 2, command: "unknown", code: "cli.usage" },
    { args: ["inspect", projectDir, "--unknown", "--json"], exitCode: 2, command: "inspect", code: "cli.usage" },
    { args: ["design", projectDir, "--program", "missing", "--progress", "binary", "--json"], exitCode: 1, command: "design", code: "design.invalid-progress" },
    { args: ["design", projectDir, "--program", "integrated-dram-fab", "--continue", "--json"], exitCode: 1, command: "design", code: "design.run-id-required" },
    { args: ["design", projectDir, "--program", "integrated-dram-fab", "--run", "--run-id", "deadbeef", "--continue", "--json"], exitCode: 1, command: "design", code: "design.mode-conflict" },
  ];
  for (const item of cases) {
    const result = await runCli(item.args);
    expect({ stdout: result.stdout, exitCode: result.exitCode }).toEqual({ stdout: "", exitCode: item.exitCode });
    const envelope = JSON.parse(result.stderr);
    expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: false, command: item.command, error: expect.objectContaining({ code: item.code, retryable: false, issues: expect.any(Array), hashes: expect.any(Object) }) }));
  }
  const humanOnly = await runCli(["inspect", projectDir, "--section", "catalog"]);
  expect({ stdout: humanOnly.stdout, exitCode: humanOnly.exitCode }).toEqual({ stdout: "", exitCode: 1 });
  expect(humanOnly.stderr).toContain("[cli.section-requires-json]");
});
