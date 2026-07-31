import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashValue, listRuns, listWorkspaceProjects, lockBlueprintBenchmark, openFactoryProject, openProjectWorkbenchSnapshot, pathExists, planProductionCapacity, resolveProjectDirectory, simulateProjectOperation } from "@inm/core";
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

async function restorePreCompactMemoryFabBlueprint(projectDir: string) {
  await writeFile(
    join(projectDir, "blueprints/generated-dram-fab.blueprint.json"),
    await readFile(join(projectDir, "runs/098-simulate/blueprint.json"), "utf8"),
  );
  await rm(join(projectDir, "candidates/compact-finished-goods-shipping.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/compact-inspection-rework-cell.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/compact-inspection-rework-cell-east-port.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/vacuum-lithography-etch-handoff.candidate.json"), { force: true });
  await rm(join(projectDir, "candidate-reviews/compact-finished-goods-shipping"), { recursive: true, force: true });
  await rm(join(projectDir, "candidate-reviews/compact-inspection-rework-cell-east-port"), { recursive: true, force: true });
  await rm(join(projectDir, "candidate-reviews/vacuum-lithography-etch-handoff"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/099-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/100-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/101-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/102-simulate"), { recursive: true, force: true });
  for (const entry of [
    "0016-compact-inspection-rework-cell.entry.json",
    "0017-revise-compact-cell-east-port.entry.json",
    "0018-compact-inspection-rework-cell-east-port.entry.json",
    "0019-keep-compact-inspection-rework-cell-east-port.entry.json",
    "0020-compact-inspection-rework-cell-current-factory.entry.json",
    "0021-compact-cell-run-comparison-retained.entry.json",
  ]) {
    await rm(join(projectDir, "investigations/inspection-starvation-next-step/entries", entry), { force: true });
  }
}

async function currentCompactRunPair(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes(".inm"),
  });
  const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
  await writeFile(blueprintPath, await readFile(join(projectDir, "runs/100-simulate/blueprint.json"), "utf8"));
  const from = await simulateProjectOperation(projectDir, {}, { seed: 42 });
  await writeFile(blueprintPath, await readFile(join(projectDir, "runs/101-simulate/blueprint.json"), "utf8"));
  const to = await simulateProjectOperation(projectDir, {}, { seed: 42 });
  return { root, projectDir, fromRunId: from.data.run.id, toRunId: to.data.run.id };
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
}, 15_000);

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

test("compare command explains two exact immutable memory-fab Runs for humans and Agents", async () => {
  const { root, projectDir, fromRunId, toRunId } = await currentCompactRunPair("inm-cli-run-comparison-");
  try {
  const args = ["compare", projectDir, "--from-run", fromRunId, "--to-run", toRunId];

  const human = await runCli(args);
  expect({ exitCode: human.exitCode, stderr: human.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(human.stdout).toContain(`FROM ${fromRunId}`);
  expect(human.stdout).toContain(`→ TO ${toRunId}`);
  expect(human.stdout).toContain("score                 -0.306590 →     0.198410  Δ +0.505000");
  expect(human.stdout).toContain("build cost               229940 →       229840  Δ -100");
  expect(human.stdout).toContain("occupied area               269 →          259  Δ -10");
  expect(human.stdout).toContain("completed / ontime        12/12 →        12/12");
  expect(human.stdout).toContain("good / FP yield    100.0%/83.3% → 100.0%/83.3%");
  expect(human.stdout).toContain("leader etch-1 → probe-1");
  expect(human.stdout).toContain("This is observed evidence, not an automatic next-intervention decision.");

  const agent = await runCli([...args, "--json", "--section", "summary"]);
  expect({ exitCode: agent.exitCode, stderr: agent.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(agent.stdout);
  expect(envelope).toEqual(expect.objectContaining({
    schemaVersion: 3,
    ok: true,
    command: "compare",
    data: expect.objectContaining({
      section: "summary",
      result: expect.objectContaining({
        kind: "immutable-runs",
        semanticChanges: 6,
        patchOperations: 32,
        verdict: "IMPROVED",
        from: expect.objectContaining({
          run: expect.objectContaining({
            id: fromRunId,
          }),
        }),
        to: expect.objectContaining({
          run: expect.objectContaining({
            id: toRunId,
          }),
        }),
        delta: expect.objectContaining({
          score: 0.5049999999999955,
          totalBuildCost: -100,
          occupiedArea: -10,
          meanTransportTimeTicks: -166.66666666666788,
          completedLots: 0,
          onTimeLots: 0,
          goodYield: 0,
          firstPassYield: 0,
        }),
        navigation: expect.objectContaining({
          studioRoute: `/memory-fab/runs?from=${fromRunId}&to=${toRunId}`,
        }),
      }),
    }),
    nextActions: [expect.objectContaining({
      studioRoute: `/memory-fab/runs?from=${fromRunId}&to=${toRunId}`,
    })],
  }));

  const invalid = await runCli(["compare", projectDir, "--from-run", fromRunId, "--to-run", fromRunId, "--json"]);
  expect(invalid.exitCode).toBe(1);
  expect(invalid.stdout).toBe("");
  expect(JSON.parse(invalid.stderr).error).toEqual(expect.objectContaining({
    code: "run-comparison.same-run",
    retryable: false,
  }));

  const help = await runCli(["help", "--json"]);
  const compareCapability = JSON.parse(help.stdout).data.commands.find((command: { id: string }) => command.id === "compare");
  expect(compareCapability.usage).toContain("--from-run ID --to-run ID");
  expect(compareCapability.outputSections).toEqual(["summary", "changes", "evaluation", "losses", "all"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("investigate captures one exact immutable Run comparison for later human or Agent reasoning", async () => {
  const { root, projectDir, fromRunId, toRunId } = await currentCompactRunPair("inm-cli-run-comparison-investigation-");
  try {
    const create = await runCli([
      "investigate",
      projectDir,
      "--investigation",
      "compact-cell-evidence",
      "--create",
      "--name",
      "Compact cell evidence",
      "--question",
      "What did the compact inspection and rework cell change?",
      "--json",
    ]);
    expect({ exitCode: create.exitCode, stderr: create.stderr })
      .toEqual({ exitCode: 0, stderr: "" });

    const captured = await runCli([
      "investigate",
      projectDir,
      "--investigation",
      "compact-cell-evidence",
      "--entry",
      "compact-cell-compared",
      "--kind",
      "observation",
      "--author",
      "agent",
      "--statement",
      `${toRunId} preserves delivery and quality while reducing the compact-cell footprint and inspection starvation.`,
      "--evidence",
      "operating-run,diagnostic",
      "--capture-comparison",
      "compact-cell-comparison",
      "--from-run",
      fromRunId,
      "--to-run",
      toRunId,
      "--json",
    ]);
    expect({ exitCode: captured.exitCode, stderr: captured.stderr })
      .toEqual({ exitCode: 0, stderr: "" });
    expect(JSON.parse(captured.stdout).data.result).toEqual(expect.objectContaining({
      action: "appended",
      state: "current",
      lastEntry: expect.objectContaining({
        id: "compact-cell-compared",
        evidence: ["operating-run", "diagnostic", "compact-cell-comparison"],
        introducedAnchors: [
          expect.objectContaining({
            id: "compact-cell-comparison",
            kind: "run-comparison",
            from: expect.objectContaining({ runId: fromRunId }),
            to: expect.objectContaining({ runId: toRunId }),
            comparisonHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        ],
      }),
      anchors: expect.arrayContaining([
        expect.objectContaining({
          id: "compact-cell-comparison",
          kind: "run-comparison",
          state: "current",
        }),
      ]),
    }));

    const [human, anchors] = await Promise.all([runCli([
      "investigate",
      projectDir,
      "--investigation",
      "compact-cell-evidence",
    ]), runCli([
      "investigate",
      projectDir,
      "--investigation",
      "compact-cell-evidence",
      "--section",
      "anchors",
      "--json",
    ])]);
    expect({ exitCode: human.exitCode, stderr: human.stderr })
      .toEqual({ exitCode: 0, stderr: "" });
    expect({ exitCode: anchors.exitCode, stderr: anchors.stderr })
      .toEqual({ exitCode: 0, stderr: "" });
    expect(JSON.parse(anchors.stdout).data.result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        anchor: expect.objectContaining({
          id: "compact-cell-comparison",
          kind: "run-comparison",
        }),
        state: "current",
        navigation: {
          argv: [
            "inm",
            "compare",
            projectDir,
            "--from-run",
            fromRunId,
            "--to-run",
            toRunId,
            "--json",
          ],
          studioRoute: `/memory-fab/runs?from=${fromRunId}&to=${toRunId}`,
        },
      }),
    ]));
    expect(human.stdout).toContain(
      `compact-cell-comparison · Run comparison '${fromRunId} → ${toRunId}' is exact`,
    );
    expect(human.stdout).toContain("introduced: compact-cell-comparison:run-comparison");

    const incomplete = await runCli([
      "investigate",
      projectDir,
      "--investigation",
      "compact-cell-evidence",
      "--entry",
      "invalid-comparison",
      "--kind",
      "observation",
      "--author",
      "agent",
      "--statement",
      "This request is deliberately incomplete.",
      "--capture-comparison",
      "invalid-comparison",
      "--from-run",
      fromRunId,
      "--json",
    ]);
    expect(incomplete.exitCode).toBe(2);
    expect(incomplete.stderr).toContain("--capture-comparison requires --from-run and --to-run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

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
  const proposed = await runCli(["candidate", projectDir, "--candidate", "commissioned-release-control", "--json"]);
  expect({ exitCode: proposed.exitCode, stderr: proposed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(proposed.stdout)).toEqual(expect.objectContaining({
    data: expect.objectContaining({
      result: expect.objectContaining({ action: "inspect", decisionState: "proposed", review: null }),
    }),
    artifacts: [],
    execution: null,
    nextActions: [expect.objectContaining({
      id: "candidate.review",
      effect: "creates-artifact",
      argv: expect.arrayContaining(["--review"]),
    })],
  }));
  const runCandidate = async (apply = false) => {
    const child = Bun.spawn([
      process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), "candidate", projectDir,
      "--candidate", "commissioned-release-control", ...(apply ? ["--apply"] : ["--review"]), "--json",
    ], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    return { stdout, stderr, exitCode };
  };
  const { stdout, stderr, exitCode } = await runCandidate();
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const result = JSON.parse(stdout);
  expect(result).toEqual(expect.objectContaining({ schemaVersion: 3, ok: true, command: "candidate" }));
  expect(result.data).toEqual(expect.objectContaining({
    section: "summary",
    result: expect.objectContaining({
      action: "preview", candidate: "commissioned-release-control", verdict: "KEEP", lockedBaselineScoreDelta: expect.any(Number),
      currentFactory: expect.objectContaining({
        reference: "current-factory",
        currentBlueprintHash: expect.any(String),
        proposedBlueprintHash: expect.any(String),
        verdict: expect.stringMatching(/IMPROVED|REGRESSED|UNCHANGED/),
        physicalEconomics: {
          current: expect.objectContaining({ totalBuildCost: expect.any(Number), transportCells: expect.any(Number) }),
          proposed: expect.objectContaining({ totalBuildCost: expect.any(Number), transportCells: expect.any(Number) }),
          delta: expect.objectContaining({ totalBuildCost: expect.any(Number), transportCells: expect.any(Number) }),
        },
        cases: expect.arrayContaining([expect.objectContaining({
          currentWip: expect.any(Number),
          proposedWip: expect.any(Number),
          currentOnTimeLots: expect.any(Number),
          proposedOnTimeLots: expect.any(Number),
          currentObjectiveConstraints: expect.arrayContaining([
            expect.objectContaining({ id: "objective:max-build-cost", passed: true }),
          ]),
          proposedObjectiveConstraints: expect.arrayContaining([
            expect.objectContaining({ id: "objective:max-build-cost", passed: true }),
          ]),
        })]),
      }),
      outcomeGuardrails: expect.objectContaining({ total: 6, passed: 6, failed: 0, evidence: expect.any(Array) }),
    }),
    operation: expect.objectContaining({
      operation: "candidate.preview", effect: "creates-artifact",
      writeSet: [expect.stringContaining("candidate-reviews/commissioned-release-control/")],
      artifacts: [expect.objectContaining({ kind: "candidate-review", immutable: true })],
    }),
  }));
  expect(result.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  expect(JSON.parse(await readFile(result.artifacts[0].path, "utf8"))).toEqual(expect.objectContaining({
    version: 2,
    currentFactory: expect.objectContaining({
      reference: "current-factory",
      currentBlueprintHash: expect.any(String),
      proposedBlueprintHash: expect.any(String),
      physicalEconomics: expect.objectContaining({
        current: expect.objectContaining({ totalBuildCost: expect.any(Number) }),
        proposed: expect.objectContaining({ totalBuildCost: expect.any(Number) }),
        delta: expect.objectContaining({ totalBuildCost: expect.any(Number) }),
      }),
      cases: expect.any(Array),
    }),
  }));
  expect(result.execution).toEqual(expect.objectContaining({
    kind: "candidate-preview",
    subject: { kind: "candidate-preview", benchmarkId: "greenfield-dram-design", candidateId: "commissioned-release-control" },
    status: "completed",
    progressEvents: expect.any(Number),
    artifacts: [expect.objectContaining({ kind: "candidate-review", immutable: true })],
  }));
  const recorded = await runCli(["candidate", projectDir, "--candidate", "commissioned-release-control", "--json"]);
  expect({ exitCode: recorded.exitCode, stderr: recorded.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(recorded.stdout)).toEqual(expect.objectContaining({
    data: expect.objectContaining({
      result: expect.objectContaining({ action: "inspect", decisionState: "reviewed-keep", verdict: "KEEP" }),
    }),
    artifacts: [],
    execution: null,
    nextActions: [expect.objectContaining({ id: "candidate.apply" })],
  }));
  expect(result.nextActions).toEqual([expect.objectContaining({ id: "candidate.apply", effect: "mutates-project" })]);
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
  const reviewedAction = await runCli(["inspect", projectDir, "--section", "next-action", "--json"]);
  const reviewedEnvelope = JSON.parse(reviewedAction.stdout);
  expect(reviewedEnvelope.data.result).toEqual(expect.objectContaining({ id: "candidate.apply:commissioned-release-control", requiresConfirmation: true }));
  expect(reviewedEnvelope.nextActions).toEqual([reviewedEnvelope.data.result]);

  const applied = await runCandidate(true);
  expect({ exitCode: applied.exitCode, stderr: applied.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(applied.stdout)).toEqual(expect.objectContaining({
    schemaVersion: 3, ok: true, command: "candidate",
    execution: expect.objectContaining({
      kind: "candidate-apply",
      status: "completed",
      artifacts: [expect.objectContaining({ kind: "blueprint", immutable: false })],
    }),
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
    schemaVersion: 3, ok: false, command: "candidate",
    error: expect.objectContaining({ code: "candidate.review-required", retryable: false }),
  }));
}, 90_000);

test("CLI freezes a reviewed Candidate as an immutable TRIAL without applying it", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-candidate-trial-cli-"));
  const projectDir = join(parent, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const blueprintPath = join(projectDir, "blueprints/equipment-energy-sleep.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  try {
    const trial = await runCli([
      "candidate", projectDir,
      "--candidate", "stable-furnace-sleep",
      "--run",
      "--seed", "42",
      "--json",
    ]);
    expect({ exitCode: trial.exitCode, stderr: trial.stderr }).toEqual({ exitCode: 0, stderr: "" });
    const envelope = JSON.parse(trial.stdout);
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: 3,
      ok: true,
      command: "candidate",
      artifacts: [expect.objectContaining({ kind: "run", immutable: true })],
      data: expect.objectContaining({
        result: expect.objectContaining({
          action: "simulate",
          cached: false,
          candidate: expect.objectContaining({
            id: "stable-furnace-sleep",
            reviewVerdict: "DISCARD",
            proposalHash: expect.any(String),
            reviewResultHash: expect.any(String),
            parentRun: null,
          }),
        }),
        operation: expect.objectContaining({
          operation: "candidate.simulate",
          effect: "creates-artifact",
          writeSet: [expect.stringContaining("runs/")],
        }),
      }),
    }));
    const runPath = envelope.artifacts[0].path;
    expect(JSON.parse(await readFile(join(runPath, "manifest.json"), "utf8")))
      .toEqual(expect.objectContaining({ decision: "TRIAL", candidate: expect.objectContaining({ id: "stable-furnace-sleep" }) }));
    expect(await readFile(blueprintPath, "utf8")).toBe(before);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}, 20_000);

test("current memory-fab Benchmark exposes the explicit on-time service contract", async () => {
  const result = await runCli([
    "benchmark",
    join(repository, "examples/memory-fab"),
    "--benchmark",
    "greenfield-dram-design",
    "--section",
    "all",
    "--progress",
    "ndjson",
    "--json",
  ]);
  expect(result.exitCode).toBe(0);
  const progress = result.stderr.trim().split("\n").map((line) => JSON.parse(line));
  expect(progress).toHaveLength(20);
  expect(progress[0]).toEqual(expect.objectContaining({
    command: "benchmark",
    progress: expect.objectContaining({ version: 3, sequence: 1, phase: "baseline-case-started", work: { completed: 0, total: 10 } }),
  }));
  expect(progress.at(-1)).toEqual(expect.objectContaining({
    progress: expect.objectContaining({ sequence: 20, phase: "candidate-case-completed", work: { completed: 10, total: 10 } }),
  }));
  const operationIds = new Set(progress.map((event) => event.execution.id));
  expect(operationIds.size).toBe(1);
  expect(progress.map((event) => event.execution.progressEvents)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  const benchmarkEnvelope = JSON.parse(result.stdout);
  expect(benchmarkEnvelope.execution).toEqual(expect.objectContaining({
    id: progress[0].execution.id,
    kind: "benchmark",
    subject: { kind: "benchmark", benchmarkId: "greenfield-dram-design" },
    status: "completed",
    progressEvents: 20,
    durationMs: expect.any(Number),
    artifacts: [],
  }));
  const evaluation = benchmarkEnvelope.data.result;
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
      expect.objectContaining({ id: "mixed-quality", candidateValue: 12, threshold: 10, candidatePassed: true }),
      expect.objectContaining({ id: "quality-excursion", candidateValue: 12, threshold: 8, candidatePassed: true }),
      expect.objectContaining({ id: "lithography-interruption", candidateValue: 10, threshold: 7, candidatePassed: true }),
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

test("public CLI cancellation retains one operation identity and exits without a partial result", async () => {
  const child = Bun.spawn([
    process.execPath,
    join(repository, "packages/inm-cli/src/bin.ts"),
    "benchmark",
    join(repository, "examples/memory-fab"),
    "--benchmark",
    "greenfield-dram-design",
    "--progress",
    "ndjson",
    "--json",
  ], { cwd: repository, stdout: "pipe", stderr: "pipe" });
  const stdoutPromise = new Response(child.stdout).text();
  const reader = child.stderr.getReader();
  const decoder = new TextDecoder();
  let stderr = "";
  let cancellationRequested = false;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    stderr += decoder.decode(chunk.value, { stream: true });
    if (!cancellationRequested && stderr.includes("\"mode\":\"parallel\"")) {
      cancellationRequested = true;
      child.kill("SIGINT");
    }
  }
  stderr += decoder.decode();
  const [stdout, exitCode] = await Promise.all([stdoutPromise, child.exited]);
  expect(cancellationRequested).toBeTrue();
  expect({ stdout, exitCode }).toEqual({ stdout: "", exitCode: 130 });
  const records = stderr.trim().split("\n").map((line) => JSON.parse(line));
  const progress = records.filter((record) => record.type === "progress");
  const failure = records.at(-1);
  expect(progress.length).toBeGreaterThan(0);
  expect(failure).toEqual(expect.objectContaining({
    schemaVersion: 3,
    ok: false,
    command: "benchmark",
    error: expect.objectContaining({ code: "operation.cancelled", retryable: false }),
    execution: expect.objectContaining({
      id: progress[0].execution.id,
      kind: "benchmark",
      status: "cancelled",
      cancelRequestedAt: expect.any(String),
      completedAt: expect.any(String),
      progressEvents: progress.length,
      artifacts: [],
    }),
  }));
  expect(new Set(progress.map((event) => event.execution.id))).toEqual(new Set([failure.execution.id]));
}, 20_000);

test("recorded rejected Candidate reopens cheaply with an exact revision handoff", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const result = await runCli([
    "candidate", projectDir,
    "--candidate", "back-end-wip-conwip-5-4",
    "--section", "revision",
    "--json",
  ]);
  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(result.stdout);
  expect(envelope.execution).toBeNull();
  expect(envelope.artifacts).toEqual([]);
  expect(envelope.data.result).toEqual(expect.objectContaining({
    disposition: "revise-or-retire",
    decisionOwner: "human-or-agent",
    candidateId: "back-end-wip-conwip-5-4",
    currentFactoryStatus: "evaluated",
    guardrailRegressions: [
      expect.objectContaining({ caseId: "steady-production", metric: "onTimeLots", currentValue: 12, proposedValue: 11, threshold: 12, deficit: 1 }),
      expect.objectContaining({ caseId: "lithography-interruption", metric: "onTimeLots", currentValue: 9, proposedValue: 6, threshold: 7, deficit: 1 }),
      expect.objectContaining({ caseId: "facility-interruption", metric: "onTimeLots", currentValue: 9, proposedValue: 7, threshold: 9, deficit: 2 }),
    ],
    caseRegressions: [
      expect.objectContaining({ caseId: "lithography-interruption", scoreDelta: -5.806869633333328 }),
    ],
    benefitsToPreserve: expect.arrayContaining([expect.objectContaining({ component: "wip", scoreDelta: expect.any(Number) })]),
    costsToRemove: expect.arrayContaining([expect.objectContaining({ component: "onTimeDelivery", scoreDelta: expect.any(Number) })]),
    patchPaths: ["/policies/lotRelease/maximumWip", "/policies/lotRelease/reopenAtWip"],
  }));
  expect(envelope.nextActions).toEqual([expect.objectContaining({
    id: "candidate.observe-current",
    effect: "read-only",
    argv: [
      "inm", "observe", projectDir,
      "--world", "cleanroom",
      "--blueprint", "generated-dram-fab",
      "--production-plan", "production-window",
      "--scenario", "production-window",
      "--objective", "dram-output",
      "--json",
    ],
  })]);
});

test("public inspect JSON and next action are the shared Core workbench snapshot", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const [{ stdout, stderr, exitCode }, nextAction, expected] = await Promise.all([
    runCli(["inspect", projectDir, "--section", "all", "--json"]),
    runCli(["inspect", projectDir, "--section", "next-action", "--json"]),
    openProjectWorkbenchSnapshot(projectDir),
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(stdout);
  expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 3, ok: true, command: "inspect" }));
  expect(envelope.context).toEqual(expect.objectContaining({ scope: "project", selection: expected.selection && {
    world: expected.selection.world.id, blueprint: expected.selection.blueprint.id,
    productionPlan: expected.selection.productionPlan.id,
    scenario: expected.selection.scenario.id, objective: expected.selection.objective.id,
  }, hashes: expected.hashes }));
  expect(envelope.data).toEqual({ section: "all", result: expected });
  const nextEnvelope = JSON.parse(nextAction.stdout);
  expect(nextEnvelope.data).toEqual({ section: "next-action", result: expected.nextAction });
  expect(nextEnvelope.nextActions).toEqual([expected.nextAction]);
}, 20_000);

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
      evidence: { state: "missing", authorityRunId: null, authorityCommissioning: null, authorityAddressedLossTargets: [], currentRuns: 0, commissionedRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
    expect.objectContaining({
      id: "back-end-die-handoff",
      alignment: { state: "aligned", reasons: [] },
      evidence: { state: "missing", authorityRunId: null, authorityCommissioning: null, authorityAddressedLossTargets: [], currentRuns: 0, commissionedRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
    expect.objectContaining({
      id: "greenfield-dram-fab",
      evidence: { state: "not-applicable", authorityRunId: null, authorityCommissioning: null, authorityAddressedLossTargets: [], currentRuns: 0, commissionedRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
    expect.objectContaining({
      id: "lithography-maintenance-convergence",
      focus: expect.objectContaining({ kind: "loss", loss: "maintenance-qualification" }),
      alignment: { state: "aligned", reasons: [] },
      evidence: { state: "missing", authorityRunId: null, authorityCommissioning: null, authorityAddressedLossTargets: [], currentRuns: 0, commissionedRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
    expect.objectContaining({
      id: "release-admission-convergence",
      focus: expect.objectContaining({ kind: "loss", loss: "release-admission" }),
      alignment: { state: "aligned", reasons: [] },
      evidence: { state: "missing", authorityRunId: null, authorityCommissioning: null, authorityAddressedLossTargets: [], currentRuns: 0, commissionedRuns: 0, historicalRuns: 0, invalidRuns: 0 },
    }),
  ]));
  expect(programs[0].evidence.runs).toBeUndefined();
  expect(human.stdout).toContain("lithography-maintenance-convergence · MISSING");
});

test("public observe binds the exact memory-fab run to shared visual targets without writes", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const currentRunId = "114-candidate-trial-run-112-dimensional-stability";
  const before = await Bun.file(join(projectDir, "blueprints/generated-dram-fab.blueprint.json")).text();
  const [machine, human, help] = await Promise.all([
    runCli(["observe", projectDir, "--run", currentRunId, "--json"]),
    runCli(["observe", projectDir, "--run", currentRunId]),
    runCli(["help", "--json"]),
  ]);
  expect({ machine: machine.exitCode, human: human.exitCode, machineStderr: machine.stderr, humanStderr: human.stderr })
    .toEqual({ machine: 0, human: 0, machineStderr: "", humanStderr: "" });
  const envelope = JSON.parse(machine.stdout);
  expect(envelope).toEqual(expect.objectContaining({
    schemaVersion: 3,
    ok: true,
    command: "observe",
    context: expect.objectContaining({
      scope: "project",
      selection: {
        world: "cleanroom",
        blueprint: "generated-dram-fab",
        productionPlan: "production-window",
        scenario: "production-window",
        objective: "dram-output",
      },
    }),
    data: expect.objectContaining({
      status: "ready",
      authority: "human-or-agent",
      evidence: expect.objectContaining({
        state: "compatible",
        run: expect.objectContaining({ id: currentRunId }),
        sourceLotLineage: expect.objectContaining({
          runId: currentRunId,
          deliveredUnits: 88,
          finalWipUnits: 8,
        }),
        sourceLotServices: expect.arrayContaining([
          expect.objectContaining({
            analysisHash: "4b7e5ccecac2ab09faf6322a2101553851bab42a2e94817a2ee94aaa3b416f50",
            query: expect.objectContaining({
              device: "burn-in-1",
              inputBuffer: "package-input",
              inputResource: "packaged-dram-device",
            }),
          }),
        ]),
      }),
      leadingObjectiveTradeoff: expect.objectContaining({
        component: "wip",
        contribution: -73.78575000000001,
        runId: currentRunId,
        interpretation: "objective-accounting-not-causal-loss",
      }),
      views: expect.arrayContaining([
        expect.objectContaining({ studioRoute: `/memory-fab/factory?run=${currentRunId}` }),
        expect.objectContaining({ studioRoute: `/memory-fab/factory/devices/burn-in-1?run=${currentRunId}` }),
        expect.objectContaining({ studioRoute: `/memory-fab/factory/devices/packaging-1?run=${currentRunId}` }),
      ]),
    }),
  }));
  expect(envelope.nextActions[0]).toEqual(expect.objectContaining({
    id: "author-observation-hypothesis",
    effect: "read-only",
    studioRoute: `/memory-fab/factory?run=${currentRunId}`,
    argv: expect.arrayContaining(["--section", "objective"]),
  }));
  expect(human.stdout).toContain("observation brief");
  expect(human.stdout).toContain(`/memory-fab/factory?run=${currentRunId}`);
  expect(human.stdout).toContain("Leading Objective tradeoff: wip -73.786");
  expect(human.stdout).not.toContain("analysis.material-deficit");
  const observeCapability = JSON.parse(help.stdout).data.commands.find((command: { id: string }) => command.id === "observe");
  expect(observeCapability).toEqual(expect.objectContaining({
    effect: "read-only",
    supportsJson: true,
    outputSections: [],
  }));
  expect(observeCapability.arguments.find((argument: { name: string }) => argument.name === "run")
    .description).toContain("Compatible immutable run id");
  expect(await Bun.file(join(projectDir, "blueprints/generated-dram-fab.blueprint.json")).text()).toBe(before);
});

test("public investigate preserves and resumes exact project-local human/Agent reasoning", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-cli-investigation-"));
  const projectDir = join(root, "memory-fab");
  const sourceProjectDir = join(repository, "examples/memory-fab");
  const sourceDesignRun = "966127dd542de0b114eafefed250b1f3e8fff02b5cb240592b8a949657e7af06";
  await cp(sourceProjectDir, projectDir, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(sourceProjectDir.length).replace(/^\/+/, "");
      const [group, subject, artifact] = relative.split("/");
      if (group === ".inm" || group === "investigations") return false;
      if (group === "runs") return subject === undefined || subject === "098-simulate";
      if (group === "design-runs") {
        return subject === undefined
          || (subject === "inspection-supply-path"
            && (artifact === undefined || artifact === sourceDesignRun));
      }
      return true;
    },
  });
  await restorePreCompactMemoryFabBlueprint(projectDir);
  const operatingRun = await simulateProjectOperation(projectDir, {}, { seed: 42 });
  const operatingRunId = operatingRun.data.run.id;
  const investigationId = "inspection-starvation-next-step";
  const created = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--create",
    "--name",
    "Inspection starvation next step",
    "--question",
    "Which physically distinct intervention should follow the commissioned one-tick etch recovery?",
    "--json",
  ]);
  expect({ exitCode: created.exitCode, stderr: created.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const createdEnvelope = JSON.parse(created.stdout);
  expect(createdEnvelope).toEqual(expect.objectContaining({
    schemaVersion: 3,
    ok: true,
    command: "investigate",
    context: expect.objectContaining({
      scope: "project",
      selection: {
        world: "cleanroom",
        blueprint: "generated-dram-fab",
        productionPlan: "production-window",
        scenario: "production-window",
        objective: "dram-output",
      },
    }),
    data: {
      section: "summary",
      result: expect.objectContaining({
        action: "created",
        investigation: expect.objectContaining({
          id: investigationId,
          authority: "human-or-agent",
        }),
        state: "current",
        entryCount: 0,
        anchors: [
          expect.objectContaining({ id: "operating-run", state: "current" }),
          expect.objectContaining({ id: "diagnostic", state: "current" }),
        ],
      }),
    },
    artifacts: [expect.objectContaining({
      kind: "investigation",
      id: investigationId,
      immutable: true,
    })],
    nextActions: [expect.objectContaining({
      target: expect.objectContaining({
        kind: "investigation",
        investigationId,
        phase: "observe-current-factory",
        sourceEntryId: null,
      }),
    })],
  }));
  expect(await pathExists(join(
    projectDir,
    `investigations/${investigationId}/manifest.json`,
  ))).toBeTrue();

  const observed = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--entry",
    "inspection-input-is-empty",
    "--kind",
    "observation",
    "--author",
    "agent",
    "--statement",
    "Inspection waits with no resident wafer while its exact upstream sources are processing or waiting for input.",
    "--evidence",
    "operating-run,diagnostic",
    "--json",
  ]);
  expect({ exitCode: observed.exitCode, stderr: observed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(observed.stdout)).toEqual(expect.objectContaining({
    data: {
      section: "summary",
      result: expect.objectContaining({
        action: "appended",
        entryCount: 1,
        lastEntry: expect.objectContaining({
          id: "inspection-input-is-empty",
          kind: "observation",
          sequence: 1,
          evidence: ["operating-run", "diagnostic"],
        }),
      }),
    },
    artifacts: [expect.objectContaining({
      kind: "investigation-entry",
      id: "inspection-input-is-empty",
      immutable: true,
    })],
  }));

  const hypothesized = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--entry",
    "inspection-decoupling-buffer",
    "--kind",
    "hypothesis",
    "--author",
    "human",
    "--statement",
    "A small qualified wafer decoupling buffer may smooth final etch handoff without making etch globally faster.",
    "--intervention",
    "blueprint",
    "--expected-effect",
    "Reduce inspection shortage while preserving service, quality, WIP, and interruption guardrails.",
    "--evidence",
    "diagnostic,operating-run",
    "--json",
  ]);
  expect({ exitCode: hypothesized.exitCode, stderr: hypothesized.stderr }).toEqual({ exitCode: 0, stderr: "" });

  const patchFile = join(root, "inspection-decoupling-buffer.patch.json");
  await writeFile(patchFile, `${JSON.stringify([{
    op: "replace",
    path: "/devices/0/position/x",
    value: 3,
  }], null, 2)}\n`);
  const candidateCreated = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--create-candidate",
    "inspection-decoupling-buffer",
    "--hypothesis-entry",
    "inspection-decoupling-buffer",
    "--benchmark",
    "greenfield-dram-design",
    "--candidate-name",
    "Inspection decoupling buffer",
    "--patch-file",
    patchFile,
    "--json",
  ]);
  expect({ exitCode: candidateCreated.exitCode, stderr: candidateCreated.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  const candidateEnvelope = JSON.parse(candidateCreated.stdout);
  expect(candidateEnvelope).toEqual(expect.objectContaining({
    data: {
      section: "summary",
      result: expect.objectContaining({
        action: "candidate-created",
        candidate: expect.objectContaining({
          id: "inspection-decoupling-buffer",
          hypothesis: "A small qualified wafer decoupling buffer may smooth final etch handoff without making etch globally faster.",
          expectedEffect: "Reduce inspection shortage while preserving service, quality, WIP, and interruption guardrails.",
          source: expect.objectContaining({
            kind: "investigation-hypothesis",
            investigation: investigationId,
            entry: "inspection-decoupling-buffer",
          }),
          sourceEvidence: expect.objectContaining({
            state: "current",
            author: "human",
            operatingContext: expect.objectContaining({
              source: "investigation-creation",
              anchorId: "operating-run",
              run: expect.objectContaining({ id: operatingRunId }),
            }),
          }),
        }),
        handoff: expect.objectContaining({
          phase: "review-candidate",
          candidateCycle: expect.objectContaining({
            state: "review-required",
            activeCandidateId: "inspection-decoupling-buffer",
            candidates: [
              expect.objectContaining({
                id: "inspection-decoupling-buffer",
                decisionState: "proposed",
                trial: null,
                comparison: null,
                disposition: null,
              }),
            ],
          }),
        }),
      }),
    },
    artifacts: [expect.objectContaining({
      kind: "candidate",
      id: "inspection-decoupling-buffer",
      immutable: true,
    })],
    nextActions: [expect.objectContaining({
      id: "candidate.review",
      effect: "creates-artifact",
      argv: expect.arrayContaining([
        "--candidate",
        "inspection-decoupling-buffer",
        "--review",
      ]),
    })],
  }));
  const candidateInspected = await runCli([
    "candidate",
    projectDir,
    "--candidate",
    "inspection-decoupling-buffer",
    "--json",
  ]);
  expect({ exitCode: candidateInspected.exitCode, stderr: candidateInspected.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(candidateInspected.stdout).data.result).toEqual(expect.objectContaining({
    decisionState: "proposed",
    sourceEvidence: expect.objectContaining({
      investigation: investigationId,
      entry: "inspection-decoupling-buffer",
      state: "current",
    }),
  }));
  const candidateHuman = await runCli([
    "candidate",
    projectDir,
    "--candidate",
    "inspection-decoupling-buffer",
  ]);
  expect({ exitCode: candidateHuman.exitCode, stderr: candidateHuman.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  expect(candidateHuman.stdout).toContain(`context investigation-creation operating-run / ${operatingRunId} · CURRENT`);

  const captured = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--entry",
    "post-hypothesis-factory-observed",
    "--kind",
    "observation",
    "--author",
    "agent",
    "--statement",
    "The follow-up hypothesis remains bound to the exact current factory and leading diagnostic.",
    "--capture-observation",
    "post-hypothesis-factory",
    "--evidence",
    "operating-run,diagnostic",
    "--json",
  ]);
  expect({ exitCode: captured.exitCode, stderr: captured.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(captured.stdout).data.result).toEqual(expect.objectContaining({
    action: "appended",
    state: "current",
    entryCount: 3,
    anchors: expect.arrayContaining([
      expect.objectContaining({
        id: "post-hypothesis-factory",
        kind: "factory-observation",
        state: "current",
      }),
    ]),
    lastEntry: expect.objectContaining({
      id: "post-hypothesis-factory-observed",
      evidence: ["operating-run", "diagnostic", "post-hypothesis-factory"],
      introducedAnchors: [
        expect.objectContaining({
          id: "post-hypothesis-factory",
          kind: "factory-observation",
          runId: operatingRunId,
          resultHash: operatingRun.data.resultHash,
          diagnostic: expect.objectContaining({
            code: "fab-loss.input-starvation",
          }),
        }),
      ],
    }),
  }));

  const [inspection, entries, list, human, help, schemas] = await Promise.all([
    runCli(["investigate", projectDir, "--investigation", investigationId, "--json"]),
    runCli(["investigate", projectDir, "--investigation", investigationId, "--section", "entries", "--json"]),
    runCli(["investigate", projectDir, "--json"]),
    runCli(["investigate", projectDir, "--investigation", investigationId]),
    runCli(["help", "--json"]),
    runCli(["schema", "--json"]),
  ]);
  expect([inspection, entries, list, human, help, schemas].every((result) =>
    result.exitCode === 0 && result.stderr === "")).toBeTrue();
  expect(JSON.parse(inspection.stdout).data.result).toEqual(expect.objectContaining({
    action: "inspect",
    state: "current",
    entryCount: 3,
    lastEntry: expect.objectContaining({
      id: "post-hypothesis-factory-observed",
      kind: "observation",
      sequence: 3,
    }),
    handoff: expect.objectContaining({
      phase: "form-hypothesis",
      sourceEntry: expect.objectContaining({
        id: "post-hypothesis-factory-observed",
        kind: "observation",
      }),
      evidenceIds: ["operating-run", "diagnostic", "post-hypothesis-factory"],
      authorship: expect.objectContaining({
        kind: "investigation-entry",
        entryKind: "hypothesis",
      }),
    }),
  }));
  expect(JSON.parse(entries.stdout).data.result.map((entry: { id: string }) => entry.id))
    .toEqual([
      "inspection-input-is-empty",
      "inspection-decoupling-buffer",
      "post-hypothesis-factory-observed",
    ]);
  expect(JSON.parse(list.stdout).data).toEqual({
    action: "list",
    investigations: [expect.objectContaining({
      id: investigationId,
      entryCount: 3,
    })],
  });
  expect(human.stdout).toContain("Inspection starvation next step · Industrial Investigation");
  expect(human.stdout).not.toContain("CURRENT    design-lineage");
  expect(human.stdout).toContain("CURRENT    post-hypothesis-factory");
  expect(human.stdout).toContain("0002 HYPOTHESIS · human");
  expect(human.stdout).toContain("0003 OBSERVATION · agent");
  expect(human.stdout).toContain("introduced: post-hypothesis-factory:factory-observation");
  expect(human.stdout).toContain("expected: Reduce inspection shortage");
  expect(human.stdout).toContain("Candidate cycle: REVIEW-REQUIRED · hypothesis inspection-decoupling-buffer · active inspection-decoupling-buffer");
  expect(human.stdout).toContain("inspection-decoupling-buffer · review PROPOSED · trial — · comparison — · decision —");
  expect(human.stdout).toContain("Design Session: FORM-HYPOTHESIS · 0003 post-hypothesis-factory-observed");
  expect(human.stdout).toContain("Evidence: operating-run + diagnostic + post-hypothesis-factory");
  expect((JSON.parse(help.stdout).data.commands as Array<{ id: string }>).map((command) => command.id))
    .toContain("investigate");
  expect((JSON.parse(help.stdout).data.commands as Array<{
    id: string;
    arguments: Array<{ name: string }>;
  }>).find((command) => command.id === "investigate")?.arguments)
    .toContainEqual(expect.objectContaining({ name: "capture-observation" }));
  expect((JSON.parse(help.stdout).data.commands as Array<{
    id: string;
    arguments: Array<{ name: string }>;
  }>).find((command) => command.id === "investigate")?.arguments)
    .toContainEqual(expect.objectContaining({ name: "target-diagnostic-anchor" }));
  expect((JSON.parse(help.stdout).data.commands as Array<{
    id: string;
    arguments: Array<{ name: string }>;
  }>).find((command) => command.id === "session")?.arguments)
    .toContainEqual(expect.objectContaining({ name: "investigation" }));
  expect(JSON.parse(schemas.stdout).data.kinds).toEqual(expect.arrayContaining([
    "investigation",
    "investigation-entry",
  ]));

  const continuedHypothesis = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--entry",
    "post-hypothesis-follow-up",
    "--kind",
    "hypothesis",
    "--author",
    "agent",
    "--statement",
    "A bounded follow-up should preserve the current observed factory outcomes.",
    "--intervention",
    "blueprint",
    "--expected-effect",
    "The exact observed operating context remains feasible after the bounded change.",
    "--evidence",
    "post-hypothesis-factory",
    "--json",
  ]);
  expect({ exitCode: continuedHypothesis.exitCode, stderr: continuedHypothesis.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  const continuedCandidate = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--create-candidate",
    "post-hypothesis-candidate",
    "--hypothesis-entry",
    "post-hypothesis-follow-up",
    "--benchmark",
    "greenfield-dram-design",
    "--candidate-name",
    "Post-hypothesis Candidate",
    "--patch-file",
    patchFile,
    "--json",
  ]);
  expect({ exitCode: continuedCandidate.exitCode, stderr: continuedCandidate.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(continuedCandidate.stdout).data.result.candidate.sourceEvidence)
    .toEqual(expect.objectContaining({
      state: "current",
      operatingContext: expect.objectContaining({
        source: "factory-observation",
        anchorId: "post-hypothesis-factory",
        run: expect.objectContaining({ id: operatingRunId }),
      }),
    }));
  const continuedCandidateHuman = await runCli([
    "candidate",
    projectDir,
    "--candidate",
    "post-hypothesis-candidate",
  ]);
  expect(continuedCandidateHuman.stdout)
    .toContain(`context factory-observation post-hypothesis-factory / ${operatingRunId} · CURRENT`);

  const disposition = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--entry",
    "defer-current-inspection",
    "--kind",
    "decision",
    "--author",
    "agent",
    "--statement",
    "Defer this exact current inspection diagnostic until its selected execution, Run result, diagnostic, or leading contributor changes.",
    "--disposition",
    "defer",
    "--target-diagnostic-anchor",
    "post-hypothesis-factory",
    "--json",
  ]);
  expect({ exitCode: disposition.exitCode, stderr: disposition.stderr })
    .toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(disposition.stdout).data.result.lastEntry).toEqual(expect.objectContaining({
    id: "defer-current-inspection",
    disposition: "defer",
    evidence: ["post-hypothesis-factory"],
    target: { kind: "diagnostic", anchorId: "post-hypothesis-factory" },
  }));
  const dispositions = await runCli([
    "inspect",
    projectDir,
    "--section",
    "dispositions",
    "--json",
  ]);
  expect(JSON.parse(dispositions.stdout).data.result.investigations).toEqual([
    expect.objectContaining({
      disposition: "defer",
      queueEffect: "suppressed",
      target: expect.objectContaining({
        anchorId: "post-hypothesis-factory",
        code: "fab-loss.input-starvation",
      }),
      source: expect.objectContaining({
        investigationId,
        entryId: "defer-current-inspection",
      }),
    }),
  ]);

  const invalid = await runCli([
    "investigate",
    projectDir,
    "--investigation",
    investigationId,
    "--entry",
    "unfalsifiable-hypothesis",
    "--kind",
    "hypothesis",
    "--author",
    "agent",
    "--statement",
    "Make it better.",
    "--json",
  ]);
  expect(invalid.exitCode).toBe(2);
  expect(JSON.parse(invalid.stderr).error).toEqual(expect.objectContaining({
    code: "cli.usage",
    message: expect.stringContaining("requires --expected-effect"),
  }));
  await rm(root, { recursive: true, force: true });
}, 30_000);

test("public investigate authors a source-pinned Production Plan revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-cli-production-plan-revision-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => {
      const segments = source.split("/");
      return !segments.includes(".inm") && !segments.includes("investigations");
    },
  });
  try {
    const investigationId = "cadence-plan-revision";
    const created = await runCli([
      "investigate", projectDir,
      "--investigation", investigationId,
      "--create",
      "--name", "Cadence plan revision",
      "--question", "Can an authored cadence preserve all twelve planned lots?",
      "--json",
    ]);
    expect({ exitCode: created.exitCode, stderr: created.stderr })
      .toEqual({ exitCode: 0, stderr: "" });
    const hypothesis = await runCli([
      "investigate", projectDir,
      "--investigation", investigationId,
      "--entry", "compress-cadence",
      "--kind", "hypothesis",
      "--author", "agent",
      "--statement", "Compress lot and substrate release cadence without removing work.",
      "--intervention", "production-plan",
      "--expected-effect", "Make downstream material available earlier while preserving all twelve lots.",
      "--evidence", "operating-run",
      "--json",
    ]);
    expect({ exitCode: hypothesis.exitCode, stderr: hypothesis.stderr })
      .toEqual({ exitCode: 0, stderr: "" });

    const base = JSON.parse(await readFile(
      join(projectDir, "production-plans/production-window.production-plan.json"),
      "utf8",
    ));
    const proposed = structuredClone(base);
    proposed.id = "cli-compressed-cadence";
    proposed.name = "CLI compressed cadence";
    proposed.lotReleases = proposed.lotReleases.map((lot: object, index: number) => ({
      ...lot,
      releaseTick: index * 5_000,
    }));
    proposed.materialDeliveries = proposed.materialDeliveries.map((
      delivery: object,
      index: number,
    ) => ({
      ...delivery,
      releaseTick: index * 5_000,
    }));
    const inputPath = join(root, "cli-compressed-cadence.production-plan.json");
    await writeFile(inputPath, `${JSON.stringify(proposed, null, 2)}\n`);
    const authored = await runCli([
      "investigate", projectDir,
      "--investigation", investigationId,
      "--create-production-plan", proposed.id,
      "--hypothesis-entry", "compress-cadence",
      "--production-plan-file", inputPath,
      "--json",
    ]);
    expect({ exitCode: authored.exitCode, stderr: authored.stderr })
      .toEqual({ exitCode: 0, stderr: "" });
    const envelope = JSON.parse(authored.stdout);
    expect(envelope).toEqual(expect.objectContaining({
      data: {
        section: "summary",
        result: expect.objectContaining({
          action: "production-plan-created",
          productionPlanRevision: expect.objectContaining({
            revision: expect.objectContaining({
              id: proposed.id,
              source: expect.objectContaining({
                investigation: investigationId,
                hypothesisEntry: "compress-cadence",
              }),
              result: expect.objectContaining({
                id: proposed.id,
                hash: hashValue(proposed),
              }),
            }),
          }),
          handoff: expect.objectContaining({
            phase: "simulate-production-plan",
            productionPlanRevision: expect.objectContaining({ id: proposed.id }),
          }),
        }),
      },
      artifacts: expect.arrayContaining([
        expect.objectContaining({
          kind: "production-plan-revision",
          id: proposed.id,
          immutable: true,
        }),
        expect.objectContaining({
          kind: "production-plan",
          id: proposed.id,
          immutable: false,
        }),
      ]),
      nextActions: [expect.objectContaining({
        target: expect.objectContaining({
          phase: "simulate-production-plan",
        }),
        argv: expect.arrayContaining([
          "--production-plan",
          proposed.id,
        ]),
      })],
    }));
    expect(await pathExists(join(
      projectDir,
      `production-plan-revisions/${proposed.id}.revision.json`,
    ))).toBeTrue();
    expect(await pathExists(join(
      projectDir,
      `production-plans/${proposed.id}.production-plan.json`,
    ))).toBeTrue();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("public inspect rejects an invalid explicit selection", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const { stdout, stderr, exitCode } = await runCli(["inspect", projectDir, "--blueprint", "missing-blueprint", "--json"]);
  expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(JSON.parse(stderr)).toEqual(expect.objectContaining({
    schemaVersion: 3, ok: false, command: "inspect",
    error: expect.objectContaining({ code: "runtime.failed", message: expect.stringContaining("missing-blueprint.blueprint.json"), retryable: false, issues: [] }),
  }));
});

test("public machine help discovers commands, effects, arguments, defaults, and output sections", async () => {
  const { stdout, stderr, exitCode } = await runCli(["help", "--json"]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(stdout);
  expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 3, ok: true, command: "help", context: { scope: "global" } }));
  const commands = envelope.data.commands as Array<{ id: string; effect: string; exitCodes: { success: number; failure: number[]; usage: number }; arguments: Array<{ name: string; default?: unknown }>; outputSections: string[] }>;
  expect(commands.map((command) => command.id)).toContain("candidate");
  expect(commands.map((command) => command.id)).toContain("design");
  expect(commands.find((command) => command.id === "design")!.outputSections).toEqual(["summary", "static", "iterations", "frontier", "best", "runs", "all"]);
  expect(commands.find((command) => command.id === "inspect")!.outputSections).toEqual(["summary", "next-action", "objective", "diagnostics", "losses", "dispositions", "catalog", "runs", "experiments", "candidates", "operations", "all"]);
  expect(commands.find((command) => command.id === "simulate")!.effect).toBe("creates-artifact");
  expect(commands.find((command) => command.id === "compare")!.arguments.find((argument) => argument.name === "seed")!.default).toBe(42);
  expect(commands.find((command) => command.id === "inspect")!.exitCodes).toEqual({ success: 0, failure: [1], usage: 2 });
  expect(commands.find((command) => command.id === "design")!.exitCodes).toEqual({ success: 0, failure: [1, 130], usage: 2 });
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
    expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 3, ok: true, command: "schema" }));
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
        expect.objectContaining({ id: "back-end-die-handoff", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "transport-blocking" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "back-end-wip-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "objective", component: "wip", locations: ["buffer:burn-in-1:package-input:packaged-dram-device", "buffer:packaging-1:die-input:known-good-dram-die"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "burn-in-changeover-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "setup-campaign" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "commissioned-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
        expect.objectContaining({ id: "front-end-queue-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "queue-congestion" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "greenfield-dram-fab", locked: true, seed: { kind: "synthesis", inputBlueprint: "greenfield" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
        expect.objectContaining({ id: "inspection-supply-path", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "integrated-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "experiment" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } }),
        expect.objectContaining({ id: "layer-two-dimensional-control", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "yield-quality" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0.02 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "layer-two-particle-control", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "yield-quality" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "lithography-maintenance-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "maintenance-qualification" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "release-admission-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "release-admission" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
        expect.objectContaining({ id: "shipping-power-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: expect.objectContaining({ kind: "loss", loss: "power-interruption" }), currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 } }),
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
      evidence: {
        state: "missing",
        authorityRunId: null,
        authorityCommissioning: null,
        currentRuns: 0,
        commissionedRuns: 0,
        historicalRuns: 0,
        invalidRuns: 1,
      },
    }),
  }));
  expect(inspection.nextActions).toEqual([expect.objectContaining({ id: "design.run:integrated-dram-fab", effect: "creates-artifact" })]);
  expect(await pathExists(join(projectDir, "design-runs"))).toBeTrue();
  const humanInspection = await runCli(["design", projectDir, "--program", "integrated-dram-fab"]);
  expect(humanInspection.stdout).toContain("Focus: broad industrial search");
  expect(humanInspection.stdout).toContain("Current-best guardrail: uniform · max 0.000000 regression/case");
  expect(humanInspection.stdout).toContain("Frontier: 1 leader + up to 1 alternative branch");
  expect(humanInspection.stdout).toContain("Evidence: 0 current · 0 commissioned · 0 historical · 1 invalid excluded · authority none (missing)");
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
  expect(progress[0]).toEqual(expect.objectContaining({ schemaVersion: 3, type: "progress", command: "design", progress: expect.objectContaining({ phase: "run-started", sequence: 1 }) }));
  expect(progress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "baseline")).toHaveLength(5);
  expect(progress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "seed")).toHaveLength(5);
  expect(progress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "candidate")).toHaveLength(5);
  expect(progress.filter((event) => event.progress.phase === "case-completed").every((event) =>
    typeof event.progress.timing.durationMs === "number")).toBeTrue();
  expect(progress.filter((event) => event.progress.phase.startsWith("driver-replay"))).toEqual([]);
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
  expect(progress.at(-1)).toEqual(expect.objectContaining({ progress: expect.objectContaining({ phase: "run-completed", work: { completedCases: 15, plannedCases: 15 } }) }));
  const run = JSON.parse(executed.stdout);
  expect(run).toEqual(expect.objectContaining({
    command: "design",
    execution: expect.objectContaining({
      id: progress[0].execution.id,
      kind: "design-run",
      subject: { kind: "design-run", programId: "integrated-dram-fab", maxCandidates: 1 },
      status: "completed",
      progressEvents: progress.length,
      artifacts: [expect.objectContaining({ kind: "design-run", immutable: true })],
    }),
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
    version: 5,
    phase: "run-started",
    continuation: { sourceResultHash: resultHash, reusedIterations: 1 },
    budget: { maximum: 2, previousEvaluated: 1, additional: 1 },
  }) }));
  expect(continuationProgress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "baseline")).toHaveLength(5);
  expect(continuationProgress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "seed")).toHaveLength(0);
  expect(continuationProgress.filter((event) => event.progress.phase === "case-completed" && event.progress.evaluation.kind === "candidate")).toHaveLength(5);
  expect(continuationProgress.filter((event) => event.progress.phase.startsWith("driver-replay"))
    .map((event) => event.progress.phase)).toEqual(["driver-replay-started", "driver-replay-completed"]);
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
    result: expect.objectContaining({
      evidence: expect.objectContaining({
        state: "promotable",
        authorityRunId: continuedHash,
        currentRuns: 2,
        historicalRuns: 0,
        invalidRuns: 1,
        runs: expect.arrayContaining([
          expect.objectContaining({ id: resultHash, currentness: { state: "current", reasons: [] }, outcome: "continuable" }),
          expect.objectContaining({ id: continuedHash, currentness: { state: "current", reasons: [] }, outcome: "promotable" }),
        ]),
      }),
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
    }),
  });
  expect(JSON.parse(runs.stdout).data.result.runs).toHaveLength(2);
  const currentBrief = await runCli(["design", projectDir, "--program", "integrated-dram-fab", "--json"]);
  expect({ exitCode: currentBrief.exitCode, stderr: currentBrief.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(currentBrief.stdout)).toEqual(expect.objectContaining({
    data: expect.objectContaining({
      result: expect.objectContaining({
        evidence: {
          state: "promotable",
          authorityRunId: continuedHash,
          authorityCommissioning: null,
          currentRuns: 2,
          commissionedRuns: 0,
          historicalRuns: 0,
          invalidRuns: 1,
        },
      }),
    }),
    nextActions: [expect.objectContaining({
      id: `design.promote:${continuedHash}`,
      effect: "creates-artifact",
      argv: expect.arrayContaining(["--run-id", continuedHash, "--promote"]),
    })],
  }));

  const guardedExecuted = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run", "--max-candidates", "7", "--progress", "ndjson", "--json"]);
  expect(guardedExecuted.exitCode).toBe(0);
  const guardedProgress = guardedExecuted.stderr.trim().split("\n").map((line) => JSON.parse(line));
  expect(guardedProgress.filter((record) => record.progress.phase === "node-exhausted")).toHaveLength(1);
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
    { iteration: 5, strategy: "batch-formation:furnace-flex-30000", decision: "BRANCH", parent: "candidate-4", outcome: "branch-retained" },
    { iteration: 6, strategy: "facility:utility-n-plus-one", decision: "BRANCH", parent: "candidate-5", outcome: "branch-retained" },
    { iteration: 7, strategy: "setup-campaign:lithography-3-12000", decision: "KEEP", parent: "candidate-4", outcome: "leader-promoted" },
  ]);
  expect(guardedIterations.filter((iteration: { decision: string }) => iteration.decision === "KEEP")
    .every((iteration: { decisionEvidence: { guardrail: { passed: boolean } } }) => iteration.decisionEvidence.guardrail.passed)).toBeTrue();
  expect(guardedProgress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "proposal-completed",
    iteration: 7,
    strategy: "setup-campaign:lithography-3-12000",
  }) }));
  expect(guardedProgress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
    phase: "candidate-completed",
    iteration: 7,
    strategy: "setup-campaign:lithography-3-12000",
    decision: "KEEP",
  }) }));
  const guardedHuman = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash]);
  expect(guardedHuman.stdout).toContain("007 KEEP   setup-campaign:lithography-3-12000");
  expect(guardedHuman.stdout).toContain("Frontier: leader candidate-7");
  const guardedFrontier = await runCli(["design", projectDir, "--program", "greenfield-dram-fab", "--run-id", guardedRunHash, "--section", "frontier", "--json"]);
  expect(JSON.parse(guardedFrontier.stdout).data.result).toMatchObject({
    leader: "candidate-7",
    alternatives: ["candidate-6"],
    scheduler: { searchOrder: ["candidate-7"], exhausted: ["candidate-6"] },
    nodes: [
      expect.objectContaining({ nodeId: "candidate-7", role: "leader", searchStatus: "searchable" }),
      expect.objectContaining({ nodeId: "candidate-6", role: "alternative", searchStatus: "exhausted" }),
    ],
    exhaustions: [expect.objectContaining({ node: expect.objectContaining({ nodeId: "candidate-6" }), reason: "proposal-exhausted" })],
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

  const reviewed = await runCli(["candidate", projectDir, "--candidate", commissionedCandidate, "--review", "--json"]);
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

test("public inspect withholds loss authority from a different selected execution", async () => {
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
  const queueCongestion = lossProfile.buckets
    .find((bucket: { id: string }) => bucket.id === "queue-congestion");
  expect(lossProfile.version).toBe(10);
  expect(queueCongestion).toMatchObject({
    subjects: [
      { kind: "device", id: "probe-1" },
      { kind: "route", id: "dram-front-end" },
    ],
    evidence: {
      completedLots: 12,
      totalQueueTicks: 77_909,
      attributedQueueTicks: 77_909,
      unattributedQueueTicks: 0,
    },
  });
  expect(queueCongestion.contributors[0]).toMatchObject({
    label: "probe-1",
    mechanism: "process-queue-wait",
    route: "dram-front-end",
    step: "probe-dram",
    processes: ["probe-sort-dram-standard"],
    resources: ["qualified-dram-wafer-lot"],
    lots: ["dram-lot-02", "dram-lot-03", "dram-lot-04", "dram-lot-05", "dram-lot-06", "dram-lot-07", "dram-lot-09", "dram-lot-11", "dram-lot-12"],
    evidence: {
      queueTicks: 33_932,
      queueShare: 33_932 / 77_909,
      contributingLots: 9,
      segments: 9,
      maximumQueueTicks: 22_000,
    },
  });
  expect(queueCongestion.subjects).not.toContainEqual({ kind: "device", id: "burn-in-1" });
  expect(yieldQuality).toBeUndefined();
  expect(inputStarvation).toMatchObject({
    subjects: [
      { kind: "device", id: "furnace-1" },
      { kind: "connection", id: "deposition-to-batch-furnace" },
      { kind: "device", id: "deposition-1" },
    ],
    evidence: {
      rawWaitingInputTicks: 1_371_327,
      boundaryWaitingInputTicks: 1_130_545,
      exceptionWaitingInputTicks: 0,
      starvationTicks: 240_782,
    },
  });
  expect(inputStarvation.contributors.find((contributor: { id: string }) =>
    contributor.id === "device:furnace-1:material-input-shortage")).toMatchObject({
    label: "furnace-1",
    mechanism: "material-input-shortage",
    resources: ["dielectric-stack-lot"],
    evidence: { starvationTicks: 38_856, opportunityWindowTicks: 110_856, unattributedGapTicks: 0 },
    inputStates: expect.arrayContaining([expect.objectContaining({
      process: "rapid-anneal-dielectric-stack",
      starvationTicks: 22_733,
      shortages: expect.arrayContaining([expect.objectContaining({
        resource: "dielectric-stack-lot",
        buffer: "batch-input",
        available: 0,
        required: 1,
        supplies: expect.arrayContaining([expect.objectContaining({
          connection: "deposition-to-batch-furnace",
          sourceDevice: "deposition-1",
          state: "source-processing",
        })]),
      })]),
    })]),
  });
  expect(qTime).toBeUndefined();
  expect(transportBlocking).toMatchObject({
    label: "Local transport blocking by cause",
    evidence: {
      blockedConnections: 3,
      blockedItemTicks: 218_601,
      connections: 17,
      lineContentionTicks: 138_701,
      endpointCapacityTicks: 42_900,
      endpointPowerTicks: 37_000,
      endpointFailureTicks: 0,
    },
    subjects: [{ kind: "connection", id: "probe-to-packaging" }],
  });
  expect(transportBlocking.contributors[0]).toMatchObject({
    id: "connection:probe-to-packaging:transport-line-contention",
    mechanism: "transport-line-contention",
    evidence: {
      blockedItemTicks: 118_200,
      lineContentionTicks: 73_600,
      endpointCapacityTicks: 36_400,
      endpointPowerTicks: 8_200,
      endpointFailureTicks: 0,
    },
  });

  const human = await runCli(["inspect", projectDir]);
  expect({ exitCode: human.exitCode, stderr: human.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(human.stdout).not.toContain("Quality-origin contributors:");
  expect(human.stdout).toContain("Material-starvation contributors:");
  expect(human.stdout).toContain("furnace-1 · material-input-shortage · 38.9s attributed shortage / 110.9s opportunity · 0.0s unattributed · dielectric-stack-lot · 22.7s dielectric-stack-lot@batch-input 0/1 via deposition-to-batch-furnace:source-processing←deposition-1");
  expect(human.stdout).toContain("[fab-loss.transport-blocking]");
  expect(human.stdout).toContain("Transport-blocking contributors:");
  expect(human.stdout).toContain("probe-to-packaging · dominant immediate cause: line contention · 118.2 blocked item-s · line contention 73.6 item-s · endpoint capacity 36.4 item-s · endpoint power 8.2 item-s · endpoint failure 0.0 item-s · 24.0/240.0 items/min · known-good-dram-die");
  expect(human.stdout).toContain("Setup, changeover, and campaign contributors:");
  expect(human.stdout).toContain("burn-in-1 · reliability-screen → commercial-screen · equipment-production-changeover · 8.0s · screen-commercial-dram · commercial-dram-device+packaged-dram-device · 180000mW / 1440000mJ");
  expect(human.stdout).not.toContain("Q-time contributors:");
  expect(human.stdout).toContain("Tracked-lot queue contributors:");
  expect(human.stdout).toContain("probe-1 · process-queue-wait · 33.9s / 43.6% · 9 lots / 9 segments · max 22.0s · dram-front-end · probe-dram · probe-sort-dram-standard · qualified-dram-wafer-lot");
  expect(human.stdout).not.toContain("burn-in-1 · process-queue-wait");
  expect(human.stdout).toContain("Maintenance and qualification contributors:");
  expect(human.stdout).toContain("etch-1 · 17.0s ready-work overlap / 4.0s idle-window context · 21.0s workload = 14.0s service + 7.0s qualification + 0.0s input wait + 0.0s crew wait · etch-cell-layer-1/qualified · 0 asset / 0 planned / 2 opportunistic · 2 usage / 0 calendar · service 2 chamber-clean-kit · qualification 2 tool-qualification-wafer · etch-1 → maintenance-service-1");
  expect(human.stdout).toContain("Power-interruption contributors:");
  expect(human.stdout).toContain("substrate-receiving-to-packaging-loader · grid-cleanroom-shipping-power / loader · 165.4s / 26.6% · 1 shortages / 0 restores · device peak 500mW · grid 262351mJ unserved / 10000mW peak / 113825mJ envelope");
});

test("public inspect gives Agents and humans the same current WIP and Design evidence boundary", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const [machine, objective, dispositions, human] = await Promise.all([
    runCli(["inspect", projectDir, "--json"]),
    runCli(["inspect", projectDir, "--section", "objective", "--json"]),
    runCli(["inspect", projectDir, "--section", "dispositions", "--json"]),
    runCli(["inspect", projectDir]),
  ]);
  expect({
    machine: machine.exitCode,
    objective: objective.exitCode,
    dispositions: dispositions.exitCode,
    human: human.exitCode,
    machineStderr: machine.stderr,
    objectiveStderr: objective.stderr,
    dispositionsStderr: dispositions.stderr,
    humanStderr: human.stderr,
  }).toEqual({ machine: 0, objective: 0, dispositions: 0, human: 0, machineStderr: "", objectiveStderr: "", dispositionsStderr: "", humanStderr: "" });

  const result = JSON.parse(machine.stdout).data.result;
  const currentInspection = result.designPrograms.find((item: { id: string }) => item.id === "inspection-supply-path");
  if (currentInspection?.evidence.state === "missing"
    && currentInspection.evidence.historicalRuns === 5
    && result.objectiveEvidence?.runId === "110-candidate-trial-run-105-normal-particle-suppress") {
    expect(currentInspection).toEqual(expect.objectContaining({
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({
        state: "missing",
        authorityRunId: null,
        authorityAddressedLossTargets: [],
        currentRuns: 0,
        commissionedRuns: 0,
        historicalRuns: 5,
        invalidRuns: 4,
      }),
    }));
    expect(result.designPrograms
      .filter((item: { alignment: { state: string }, id: string }) =>
        item.alignment.state === "aligned" && item.id !== "lithography-maintenance-convergence")
      .every((item: { evidence: { currentRuns: number } }) =>
        item.evidence.currentRuns === 0)).toBeTrue();
    expect(result.designPrograms.find((item: { id: string }) =>
      item.id === "lithography-maintenance-convergence")).toEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        state: "exhausted",
        authorityRunId: "7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e",
        currentRuns: 1,
      }),
    }));
    expect(result.lossDispositions).toEqual([]);
    expect(result.investigationDiagnosticDispositions).toEqual([
      expect.objectContaining({
        state: "current",
        disposition: "defer",
        queueEffect: "suppressed",
        source: expect.objectContaining({
          investigationId: "run-110-furnace-supply",
          entryId: "defer-run-110-furnace-local-branch",
        }),
        target: expect.objectContaining({
          anchorId: "run-110-furnace-factory",
          code: "fab-loss.input-starvation",
          diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:device:furnace-1/),
        }),
      }),
      expect.objectContaining({
        state: "current",
        disposition: "discard",
        queueEffect: "suppressed",
        source: expect.objectContaining({
          investigationId: "run-110-probe-queue",
          entryId: "discard-qualified-probe-cycle-95",
        }),
        target: expect.objectContaining({
          anchorId: "diagnostic",
          code: "fab-loss.queue-congestion",
          diagnosticId: expect.stringMatching(/^fab-loss\.queue-congestion:device:probe-1/),
        }),
      }),
    ]);
    expect(result.nextAction).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^design\.run\.inspect:lithography-maintenance-convergence:7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e:/),
      title: "Expand Lithography Maintenance Convergence's intervention portfolio",
      actionLabel: "REVIEW EXHAUSTED DESIGN",
      target: expect.objectContaining({
        kind: "design-run",
        phase: "exhausted",
        programId: "lithography-maintenance-convergence",
        runId: "7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e",
        diagnosticId: expect.stringMatching(/^fab-loss\.maintenance-qualification:/),
      }),
    }));
    expect(JSON.parse(objective.stdout).data.result).toEqual(expect.objectContaining({
      runId: "110-candidate-trial-run-105-normal-particle-suppress",
      dominantPenalty: { id: "wip", contribution: -73.78575000000001, role: "penalty" },
    }));
    expect(JSON.parse(dispositions.stdout).data.result).toEqual({
      design: [],
      investigations: [
        expect.objectContaining({
          state: "current",
          disposition: "defer",
          queueEffect: "suppressed",
          source: expect.objectContaining({
            investigationId: "run-110-furnace-supply",
            entryId: "defer-run-110-furnace-local-branch",
          }),
        }),
        expect.objectContaining({
          state: "current",
          disposition: "discard",
          queueEffect: "suppressed",
          source: expect.objectContaining({
            investigationId: "run-110-probe-queue",
            entryId: "discard-qualified-probe-cycle-95",
          }),
        }),
      ],
    });
    expect(human.stdout).toContain("Next action: Expand Lithography Maintenance Convergence's intervention portfolio");
    return;
  }
  if (currentInspection?.evidence.state === "missing"
    && currentInspection.evidence.historicalRuns === 5
    && result.objectiveEvidence?.runId === "105-simulate") {
    expect(currentInspection).toEqual(expect.objectContaining({
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({
        state: "missing",
        authorityRunId: null,
        authorityAddressedLossTargets: [],
        currentRuns: 0,
        commissionedRuns: 0,
        historicalRuns: 5,
        invalidRuns: 4,
      }),
    }));
    expect(result.lossDispositions).toHaveLength(0);
    expect(result.investigationDiagnosticDispositions).toEqual([
      expect.objectContaining({
        disposition: "defer",
        queueEffect: "suppressed",
        source: expect.objectContaining({
          investigationId: "current-inspection-starvation-boundary",
          entryId: "defer-run-105-inspection-local-branch",
        }),
        target: expect.objectContaining({
          code: "fab-loss.input-starvation",
          diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
        }),
      }),
    ]);
    expect(result.nextAction).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^design\.inspect:layer-two-particle-control:fab-loss\.yield-quality:/),
      title: "Investigate the leading loss with Layer-two Particle Control",
      actionLabel: "OPEN DESIGN LOOP",
      target: expect.objectContaining({
        kind: "design-program",
        programId: "layer-two-particle-control",
      }),
    }));
    expect(JSON.parse(objective.stdout).data.result).toEqual(expect.objectContaining({
      runId: "105-simulate",
      dominantPenalty: { id: "wip", contribution: -73.78575000000001, role: "penalty" },
    }));
    expect(JSON.parse(dispositions.stdout).data.result).toEqual({
      design: [],
      investigations: [
        expect.objectContaining({
          disposition: "defer",
          queueEffect: "suppressed",
          source: expect.objectContaining({
            investigationId: "current-inspection-starvation-boundary",
            entryId: "defer-run-105-inspection-local-branch",
          }),
        }),
      ],
    });
    expect(human.stdout).toContain("Investigation diagnostic decisions:");
    expect(human.stdout).toContain("current-inspection-starvation-boundary");
    expect(human.stdout).toContain("Next action: Investigate the leading loss with Layer-two Particle Control");
    return;
  }
  if (currentInspection?.evidence.authorityRunId === "966127dd542de0b114eafefed250b1f3e8fff02b5cb240592b8a949657e7af06") {
    expect(currentInspection.evidence).toEqual(expect.objectContaining({
      state: "commissioned",
      currentRuns: 0,
      commissionedRuns: 1,
      historicalRuns: 4,
      invalidRuns: 4,
      authorityAddressedLossTargets: [{
        loss: "input-starvation",
        target: { contributor: "device:inspection-1:material-input-shortage", metric: "starvationTicks", direction: "decrease" },
      }],
      authorityCommissioning: expect.objectContaining({
        candidateId: "inspection-supply-path-966127dd",
        runId: "966127dd542de0b114eafefed250b1f3e8fff02b5cb240592b8a949657e7af06",
        proposalHash: "18c8ebc898254d30a5e428dbd93412f947da062a1c20779656728237640c9832",
        appliedBlueprintHash: "8281c50706c578b823b7d8cc3f5d4f94cef230fefbee210c8a3756a6a9a9563a",
      }),
    }));
    expect(result.lossDispositions).toHaveLength(0);
    expect(result.nextAction).toEqual(expect.objectContaining({
      title: "Continue from the commissioned Inspection Supply Path Convergence lineage",
      actionLabel: "REVIEW COMMISSIONED LINEAGE",
      target: expect.objectContaining({
        kind: "design-run",
        programId: "inspection-supply-path",
        phase: "commissioned",
      }),
    }));
    expect(JSON.parse(objective.stdout).data.result).toEqual(expect.objectContaining({
      runId: "098-simulate",
      dominantPenalty: { id: "wip", contribution: -73.93575, role: "penalty" },
    }));
    expect(JSON.parse(dispositions.stdout).data.result).toHaveLength(0);
    expect(human.stdout).toContain("Next action: Continue from the commissioned Inspection Supply Path Convergence lineage");
    const commissioned = await runCli([
      "design",
      projectDir,
      "--program",
      "inspection-supply-path",
      "--json",
    ]);
    expect({ exitCode: commissioned.exitCode, stderr: commissioned.stderr }).toEqual({ exitCode: 0, stderr: "" });
    const commissionedEnvelope = JSON.parse(commissioned.stdout);
    expect(commissionedEnvelope.data.result.evidence).toEqual(expect.objectContaining({
      state: "commissioned",
      authorityRunId: currentInspection.evidence.authorityRunId,
      authorityCommissioning: expect.objectContaining({
        candidateId: "inspection-supply-path-966127dd",
        proposalHash: "18c8ebc898254d30a5e428dbd93412f947da062a1c20779656728237640c9832",
      }),
    }));
    expect(commissionedEnvelope.nextActions).toEqual([expect.objectContaining({
      id: `design.open:${currentInspection.evidence.authorityRunId}`,
      effect: "read-only",
    })]);
    const exact = await runCli([
      "design",
      projectDir,
      "--program",
      "inspection-supply-path",
      "--run-id",
      currentInspection.evidence.authorityRunId,
      "--json",
    ]);
    const exactEnvelope = JSON.parse(exact.stdout);
    expect({ exitCode: exact.exitCode, stderr: exact.stderr }).toEqual({ exitCode: 0, stderr: "" });
    expect(exactEnvelope.data.result.evidence).toEqual(expect.objectContaining({
      currentness: expect.objectContaining({
        state: "commissioned",
        commissioning: expect.objectContaining({ candidateId: "inspection-supply-path-966127dd" }),
      }),
    }));
    expect(exactEnvelope.nextActions).toEqual([expect.objectContaining({
      id: "candidate.inspect:inspection-supply-path-966127dd",
      effect: "read-only",
    })]);
    expect(exactEnvelope.nextActions.some((action: { id: string }) =>
      action.id.startsWith("design.promote:") || action.id.startsWith("design.continue:"))).toBeFalse();
    return;
  }
  const objectiveProgram = result.designPrograms.find((item: { id: string }) => item.id === "back-end-wip-convergence");
  if (objectiveProgram?.evidence.authorityRunId) {
    const authorityRunId = objectiveProgram.evidence.authorityRunId;
    expect(objectiveProgram).toEqual(expect.objectContaining({
      focus: {
        kind: "objective",
        component: "wip",
        locations: [
          "buffer:burn-in-1:package-input:packaged-dram-device",
          "buffer:packaging-1:die-input:known-good-dram-die",
        ],
      },
      evidence: expect.objectContaining({
        state: "continuable",
        authorityRunId,
        currentRuns: 1,
      }),
    }));
    expect(result.lossDispositions).toHaveLength(0);
    expect(result.nextAction).toEqual(expect.objectContaining({
      id: "design.inspect:inspection-supply-path:fab-loss.input-starvation:device:inspection-1+connection:etch-to-inspection+device:etch-l2+connection:rework-to-inspection+device:rework-1:c3f1b3047f",
      target: expect.objectContaining({
        kind: "design-program",
        programId: "inspection-supply-path",
      }),
    }));
    expect(JSON.parse(objective.stdout).data.result).toEqual(expect.objectContaining({
      dominantPenalty: { id: "wip", contribution: -74.18575, role: "penalty" },
    }));
    expect(JSON.parse(dispositions.stdout).data.result).toHaveLength(0);
    expect(human.stdout).toContain("Next action: Investigate the leading loss with Inspection Supply Path Convergence");
    return;
  }
  const program = result.designPrograms.find((item: { id: string }) => item.id === "commissioned-dram-fab");
  expect(program).toEqual(expect.objectContaining({
    alignment: { state: "aligned", reasons: [] },
    evidence: expect.objectContaining({
      state: "missing",
      authorityRunId: null,
      authorityAddressedLossTargets: [],
      currentRuns: 0,
      historicalRuns: 0,
      invalidRuns: 32,
    }),
  }));
  const invalidPrograms = [
    ["back-end-die-handoff", 12],
    ["burn-in-changeover-convergence", 14],
    ["front-end-queue-convergence", 7],
    ["layer-two-dimensional-control", 0],
    ["layer-two-particle-control", 8],
    ["lithography-maintenance-convergence", 8],
    ["release-admission-convergence", 7],
    ["shipping-power-convergence", 8],
  ] as const;
  for (const [id, invalidRuns] of invalidPrograms) {
    expect(result.designPrograms.find((item: { id: string }) => item.id === id)).toEqual(expect.objectContaining({
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({
        state: "missing",
        authorityRunId: null,
        authorityAddressedLossTargets: [],
        currentRuns: 0,
        historicalRuns: 0,
        invalidRuns,
      }),
    }));
  }
  expect(result.designPrograms.find((item: { id: string }) => item.id === "inspection-supply-path")).toEqual(expect.objectContaining({
    alignment: { state: "aligned", reasons: [] },
    evidence: expect.objectContaining({
      state: "missing",
      authorityRunId: null,
      authorityAddressedLossTargets: [],
      currentRuns: 0,
      historicalRuns: 0,
      invalidRuns: 9,
    }),
  }));
  expect(result.lossDispositions).toEqual([]);
  expect(JSON.parse(dispositions.stdout).data).toEqual({
    section: "dispositions",
    result: {
      design: result.lossDispositions,
      investigations: result.investigationDiagnosticDispositions,
    },
  });
  expect(JSON.parse(objective.stdout).data).toEqual({ section: "objective", result: result.objectiveEvidence });
  expect(result.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^observation:fab-loss\.input-starvation:/),
    title: "Observe the leading loss before authoring an intervention",
    actionLabel: "OBSERVE CURRENT FACTORY",
    effect: "read-only",
    studioRoute: "/memory-fab/factory?run=114-candidate-trial-run-112-dimensional-stability",
    target: expect.objectContaining({
      kind: "diagnostic",
      diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
    }),
  }));
  expect(result.objectiveEvidence).toEqual(expect.objectContaining({
    runId: "114-candidate-trial-run-112-dimensional-stability",
    dominantPenalty: { id: "wip", contribution: -73.78575000000001, role: "penalty" },
    wip: expect.objectContaining({
      locations: expect.arrayContaining([
        expect.objectContaining({ physicalLocation: "burn-in-1.package-input", averageInventory: 9.465691666666666 }),
        expect.objectContaining({ physicalLocation: "packaging-1.die-input", averageInventory: 7.159541666666667 }),
      ]),
    }),
  }));
  expect(human.stdout).toContain("Objective evidence: run 114-candidate-trial-run-112-dimensional-stability · score 1.261 · dominant penalty wip -73.786");
  expect(human.stdout).toContain("packaged-dram-device @ burn-in-1.package-input (buffer): 9.466 equivalent / 9.466 raw average");
  expect(human.stdout).toContain("known-good-dram-die @ packaging-1.die-input (buffer): 7.160 equivalent / 7.160 raw average");
  expect(human.stdout).toContain("Interpretation: Objective accounting evidence, not proof that the inventory is avoidable.");
  expect(human.stdout).toContain("inspection-supply-path · MISSING");
  expect(human.stdout).not.toContain("Bounded deferred loss evidence:");
  expect(human.stdout).toContain("Next action: Observe the leading loss before authoring an intervention");
  const brief = await runCli(["design", projectDir, "--program", "commissioned-dram-fab"]);
  expect({ exitCode: brief.exitCode, stderr: brief.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(brief.stdout).toContain("Evidence: 0 current · 0 commissioned · 0 historical · 32 invalid excluded · authority none (missing)");
  const invalidated = await runCli([
    "design",
    projectDir,
    "--program",
    "commissioned-dram-fab",
    "--run-id",
    "206067de7d3566d5793d078f2db05ecbceb3b2ccdd0122ecec70b8b0d5c8a217",
    "--json",
    "--section",
    "summary",
  ]);
  expect(invalidated.exitCode).toBe(1);
  expect(JSON.parse(invalidated.stderr).error).toEqual(expect.objectContaining({
    code: "design.invalid-run",
    message: expect.stringContaining("contains invalid Candidate evidence"),
  }));
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
    kind: "downstream-coverage-recovery",
    process: "deposit-dielectric-stack",
    normalMode: "qualified",
    recoveryMode: "agile-pulse",
    downstreamConnection: "deposition-to-batch-furnace",
    recoverBelowItems: 1,
    minimumCoverageDeficitTicks: 1,
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
    minimumCoverageDeficitTicks: 1,
  }));
  expect(control.normalJobs).toBeGreaterThan(0);
  expect(control.recoveryJobs).toBeGreaterThan(0);
  expect(human.stdout).toContain(`Cadence control deposition-1: ${control.normalJobs} qualified / ${control.recoveryJobs} agile-pulse jobs · ${control.recoveryActivations} recovery activations · deposit-dielectric-stack · recover after 0.0s below 1 items on deposition-to-batch-furnace`);

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
  }).toEqual({ machine: 0, human: 0, machineStderr: "", humanStderr: expect.stringContaining("BASELINE") });
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
    expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 3, ok: false, command: item.command, error: expect.objectContaining({ code: item.code, retryable: false, issues: expect.any(Array), hashes: expect.any(Object) }) }));
  }
  const humanOnly = await runCli(["inspect", projectDir, "--section", "catalog"]);
  expect({ stdout: humanOnly.stdout, exitCode: humanOnly.exitCode }).toEqual({ stdout: "", exitCode: 1 });
  expect(humanOnly.stderr).toContain("[cli.section-requires-json]");
});
