import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listRuns, listWorkspaceProjects, openFactoryProject, openProjectWorkbenchSnapshot, pathExists, planProductionCapacity, resolveProjectDirectory } from "@inm/core";
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
});

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

test("CLI-only operator discovers, inspects, previews, applies, and verifies a Candidate", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-candidate-cli-")); const projectDir = join(parent, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  const blueprintPath = join(projectDir, "blueprints/equipment-energy-sleep.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  const discovery = await runCli(["help", "--json"]);
  expect({ exitCode: discovery.exitCode, stderr: discovery.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect((JSON.parse(discovery.stdout).data.commands as Array<{ id: string }>).map((command) => command.id)).toContain("candidate");
  const inspection = await runCli(["inspect", projectDir, "--section", "candidates", "--json"]);
  expect({ exitCode: inspection.exitCode, stderr: inspection.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(inspection.stdout).data.result).toEqual(expect.arrayContaining([expect.objectContaining({ id: "stable-furnace-sleep", benchmark: "equipment-energy-research" })]));
  const runCandidate = async (apply = false) => {
    const child = Bun.spawn([
      process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), "candidate", projectDir,
      "--candidate", "stable-furnace-sleep", ...(apply ? ["--apply"] : []), "--json",
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
    result: expect.objectContaining({ action: "preview", candidate: "stable-furnace-sleep", verdict: "KEEP", scoreDelta: expect.any(Number) }),
    operation: expect.objectContaining({
      operation: "candidate.preview", effect: "creates-artifact",
      writeSet: [expect.stringContaining("candidate-reviews/stable-furnace-sleep/")],
      artifacts: [expect.objectContaining({ kind: "candidate-review", immutable: true })],
    }),
  }));
  expect(result.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  expect(result.nextActions).toEqual([expect.objectContaining({ id: "candidate.apply", effect: "mutates-project" })]);
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
  const reviewedAction = await runCli(["inspect", projectDir, "--section", "next-action", "--json"]);
  const reviewedEnvelope = JSON.parse(reviewedAction.stdout);
  expect(reviewedEnvelope.data.result).toEqual(expect.objectContaining({ id: "candidate.apply:stable-furnace-sleep", requiresConfirmation: true }));
  expect(reviewedEnvelope.nextActions).toEqual([reviewedEnvelope.data.result]);

  const applied = await runCandidate(true);
  expect({ exitCode: applied.exitCode, stderr: applied.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(applied.stdout)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: true, command: "candidate",
    data: expect.objectContaining({
      section: "summary", result: expect.objectContaining({ action: "apply", applied: true }),
      operation: expect.objectContaining({ operation: "candidate.apply", effect: "mutates-blueprint", writeSet: [blueprintPath] }),
    }),
  }));
  expect(await readFile(blueprintPath, "utf8")).not.toBe(before);
  const postApply = await runCli(["inspect", projectDir, "--section", "candidates", "--json"]);
  const postApplyEnvelope = JSON.parse(postApply.stdout);
  expect(postApplyEnvelope.data.result[0].decision).toEqual(expect.objectContaining({ state: "verified", verdict: "KEEP" }));
  expect(postApplyEnvelope.nextActions[0].id.startsWith("candidate.")).toBeFalse();

  const verified = await runCli(["benchmark", projectDir, "--benchmark", "equipment-energy-research", "--json"]);
  expect({ exitCode: verified.exitCode, stderr: verified.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(verified.stdout).data).toEqual(expect.objectContaining({
    result: expect.objectContaining({ benchmark: "equipment-energy-research", verdict: "KEEP" }),
    operation: expect.objectContaining({ operation: "benchmark.evaluate", effect: "read-only" }),
  }));

  const replay = await runCandidate(true);
  expect({ exitCode: replay.exitCode, stdout: replay.stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(JSON.parse(replay.stderr)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: false, command: "candidate",
    error: expect.objectContaining({ code: "candidate.stale-base", retryable: false, hashes: expect.objectContaining({ expectedBaseHash: expect.any(String), currentCandidateHash: expect.any(String) }) }),
  }));
}, 30_000);

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
  const seedPath = join(projectDir, "blueprints", "experiment.blueprint.json");
  const seedBefore = await readFile(seedPath, "utf8");

  const listed = await runCli(["design", projectDir, "--json"]);
  expect({ exitCode: listed.exitCode, stderr: listed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(listed.stdout)).toEqual(expect.objectContaining({
    command: "design",
    data: {
      action: "list",
      programs: [
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
    result: expect.objectContaining({ program: expect.objectContaining({ id: "integrated-dram-fab", currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }), benchmark: expect.objectContaining({ cases: 5 }) }),
  }));
  expect(inspection.nextActions).toEqual([expect.objectContaining({ id: "design.run:integrated-dram-fab", effect: "creates-artifact" })]);
  expect(await pathExists(join(projectDir, "design-runs"))).toBeFalse();
  const humanInspection = await runCli(["design", projectDir, "--program", "integrated-dram-fab"]);
  expect(humanInspection.stdout).toContain("Current-best guardrail: uniform · max 0.000000 regression/case");
  expect(humanInspection.stdout).toContain("Frontier: 1 leader + up to 1 alternative branch");

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
    driverEvidence: expect.objectContaining({ metricsHash: expect.any(String), fabLoss: expect.objectContaining({ primary: expect.objectContaining({ id: "queue-starvation" }) }) }),
  }) }));
  expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "proposal-completed", addressedLoss: "queue-starvation",
  }) }));
  expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "candidate-completed",
    frontierEvidence: expect.objectContaining({ parent: { nodeId: "seed", role: "leader", depth: 0 }, leaderAfter: expect.any(String), selectionOrderAfter: expect.any(Array) }),
    decisionEvidence: expect.objectContaining({
      basis: expect.stringMatching(/current-best-improvement|benchmark-gate|no-current-best-improvement|current-best-case-guardrail/),
      aggregate: expect.objectContaining({ scoreDelta: expect.any(Number) }),
      cases: expect.arrayContaining([expect.objectContaining({ id: "mixed-quality", previousBestScore: expect.any(Number), candidateScore: expect.any(Number), scoreDelta: expect.any(Number), maximumScoreRegression: 0, guardrailPassed: expect.any(Boolean) })]),
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
      addressedLoss: "queue-starvation",
      driverEvidence: expect.objectContaining({ metricsHash: expect.any(String), fabLoss: expect.objectContaining({ chain: expect.arrayContaining(["queue-starvation"]) }) }),
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

  const humanRun = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash]);
  expect({ exitCode: humanRun.exitCode, stderr: humanRun.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(humanRun.stdout).toContain("addresses queue-starvation");
  expect(humanRun.stdout).toContain("observed queue-starvation →");
  expect(humanRun.stdout).toContain("limiting ");
  expect(humanRun.stdout).toContain("Frontier: leader ");

  const frontier = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--section", "frontier", "--json"]);
  expect({ exitCode: frontier.exitCode, stderr: frontier.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(frontier.stdout).data).toEqual({
    section: "frontier",
    result: expect.objectContaining({ leader: expect.any(String), alternatives: expect.any(Array), selectionOrder: expect.any(Array), nodes: expect.any(Array) }),
  });

  const runs = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--section", "runs", "--json"]);
  expect({ exitCode: runs.exitCode, stderr: runs.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(runs.stdout).data).toEqual({
    section: "runs",
    result: [expect.objectContaining({ id: resultHash, program: "integrated-dram-fab", benchmark: "dispatch-research" })],
  });

  const guardedExecuted = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run", "--max-candidates", "3", "--json"]);
  expect(guardedExecuted.exitCode).toBe(0);
  const guardedRunHash = JSON.parse(guardedExecuted.stdout).data.result.resultHash as string;
  const guardedJson = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash, "--section", "iterations", "--json"]);
  const guardedIteration = JSON.parse(guardedJson.stdout).data.result[2];
  expect(guardedIteration).toMatchObject({
    iteration: 3,
    decision: "BRANCH",
    decisionEvidence: {
      basis: "current-best-case-guardrail",
      aggregate: { scoreDelta: expect.any(Number) },
      guardrail: { kind: "uniform", passed: false, violations: ["facility-interruption"] },
      cases: expect.arrayContaining([expect.objectContaining({ id: "facility-interruption", maximumScoreRegression: 0, guardrailPassed: false })]),
      limitingCase: "facility-interruption",
    },
    frontierEvidence: {
      parent: { nodeId: "candidate-2", role: "leader", depth: 2 },
      candidateNodeId: "candidate-3",
      outcome: "branch-retained",
      reason: "pareto-frontier",
      leaderAfter: "candidate-2",
      alternativesAfter: ["candidate-3"],
      selectionOrderAfter: ["candidate-3", "candidate-2"],
    },
  });
  const guardedHuman = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash]);
  expect(guardedHuman.stdout).toContain("fails current-best case guardrail · facility-interruption -3.915879 · allowed regression 0.000000");
  expect(guardedHuman.stdout).toContain("candidate-2 → candidate-3 · branch-retained");

  if (run.data.result.best.promotionPatchOperations === 0) {
    const refused = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--run-id", resultHash, "--promote", "no-leading-design", "--json"]);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stderr).error).toEqual(expect.objectContaining({ code: "design.no-leading-candidate" }));
    expect(await pathExists(join(projectDir, "candidates", "no-leading-design.candidate.json"))).toBeFalse();
  }
}, 90_000);

test("public inspect exposes compatible-run memory-fab loss attribution without prose parsing", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const result = await runCli([
    "inspect", projectDir, "--world", "cleanroom", "--blueprint", "equipment-energy-sleep",
    "--scenario", "equipment-energy-window", "--objective", "dram-energy", "--section", "losses", "--json",
  ]);
  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(result.stdout).data).toEqual({
    section: "losses",
    result: expect.objectContaining({
      run: { id: "052-simulate", resultHash: expect.any(String) },
      family: "dram-wafer",
      primary: expect.objectContaining({ id: "queue-starvation" }),
      chain: expect.arrayContaining(["maintenance-qualification", "setup-campaign"]),
    }),
  });
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

test("public CLI emits stable JSON errors for invalid section, section mode, schema kind, and usage", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const cases = [
    { args: ["inspect", projectDir, "--section", "nope", "--json"], exitCode: 1, command: "inspect", code: "cli.invalid-section" },
    { args: ["schema", "nope", "--json"], exitCode: 1, command: "schema", code: "schema.unknown-kind" },
    { args: ["validate", "--json"], exitCode: 2, command: "validate", code: "cli.usage" },
    { args: ["unknown", "--json"], exitCode: 2, command: "unknown", code: "cli.usage" },
    { args: ["inspect", projectDir, "--unknown", "--json"], exitCode: 2, command: "inspect", code: "cli.usage" },
    { args: ["design", projectDir, "--program", "missing", "--progress", "binary", "--json"], exitCode: 1, command: "design", code: "design.invalid-progress" },
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
