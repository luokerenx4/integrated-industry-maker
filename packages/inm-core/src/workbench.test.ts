import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import type { DesignRunSummary } from "./design-run";
import { previewCandidateOperation } from "./operation";
import { buildWorkbenchNextAction, classifyDesignProgramEvidence, openProjectWorkbenchSnapshot, type WorkbenchDesignEvidenceIdentity } from "./workbench";
import { pathExists, stableStringify } from "./utils";

const repository = resolve(import.meta.dir, "../../..");

test("shared workbench snapshot orients an operator with stable diagnostics and operations", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/ironworks"));
  expect(snapshot.version).toBe(6);
  expect(snapshot.project.id).toBe("ironworks");
  expect(snapshot.selection).toEqual(expect.objectContaining({
    world: expect.objectContaining({ id: "main" }),
    blueprint: expect.objectContaining({ id: "main" }),
    scenario: expect.objectContaining({ id: "baseline" }),
    objective: expect.objectContaining({ id: "default" }),
  }));
  expect(snapshot.hashes.blueprintHash).toHaveLength(64);
  expect(snapshot.status.capacity).toEqual(expect.objectContaining({ state: "blocked", gapCount: 3 }));
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    tone: "blocking", effect: "read-only", studioRoute: expect.stringContaining("/analysis/diagnostics/"),
    target: expect.objectContaining({ kind: "diagnostic" }),
  }));
  expect(snapshot.counts).toEqual(expect.objectContaining({
    regions: 2, deviceInstances: 29, connections: 8, experiments: 5, designPrograms: 0,
  }));
  expect(snapshot.catalog.resources.map((asset) => asset.id)).toContain("iron-ore");
  expect(snapshot.experiments.map((experiment) => experiment.id)).toEqual([
    "autoresearch", "high-speed-transport", "power-priority", "power-satisfaction", "station-energy",
  ]);

  const operationIds = new Set(snapshot.operations.map((operation) => operation.id));
  expect(operationIds).toEqual(new Set([
    "validate", "inspect", "analyze", "plan", "simulate", "synthesize", "design.run", "benchmark.evaluate", "candidate.preview", "candidate.apply",
  ]));
  expect(snapshot.operations.find((operation) => operation.id === "design.run")).toEqual(expect.objectContaining({
    effect: "creates-artifact",
    availability: { state: "unavailable", reasons: ["No locked project-local Design Program is available."] },
  }));
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")).toEqual(expect.objectContaining({
    effect: "mutates-blueprint", requiresConfirmation: true,
    availability: { state: "unavailable", reasons: ["No Candidate has a current recorded KEEP review."] },
  }));
  expect(snapshot.diagnostics[0]).toEqual(expect.objectContaining({ severity: "blocking", priority: 100 }));
  expect(new Set(snapshot.diagnostics.map((diagnostic) => diagnostic.id)).size).toBe(snapshot.diagnostics.length);
  expect(snapshot.diagnostics.every((diagnostic) => diagnostic.subjects.length > 0
    && diagnostic.actionIds.every((action) => operationIds.has(action)))).toBeTrue();
  expect(JSON.parse(stableStringify(snapshot))).toEqual(snapshot);
});

test("memory-fab workbench discovers project-local routes, experiments, and candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-memory-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("design-runs") && !source.split("/").includes(".inm"),
  });
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  expect(snapshot.project.id).toBe("memory-fab");
  expect(snapshot.status).toEqual(expect.objectContaining({
    capacity: { state: "ready", gapCount: 0, gapsByKind: {} },
    flow: { state: "at-risk", warningCount: 13, infoCount: 12 },
    evidence: { state: "current", runId: "080-simulate" },
    review: { state: "stale", pendingCount: 0, staleCount: 13, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.objective.wipResources).toContain("packaged-dram-device");
  expect(snapshot.objective.wipResources).not.toContain("dram-package-substrate");
  expect(snapshot.inventoryAccounting).toEqual(expect.objectContaining({
    runId: "080-simulate",
    averageWip: 21.810833333333335,
    averageTotalInventory: 118.54843333333334,
    averageExcludedInventory: 96.7376,
    peakWip: 55,
  }));
  expect(snapshot.inventoryAccounting?.resources["dram-package-substrate"]).toEqual(expect.objectContaining({
    includedInWip: false,
    averageInventory: 39.8024,
  }));
  expect(snapshot.lossAttribution).toEqual(expect.objectContaining({
    version: 5,
    chain: ["input-starvation", "yield-quality", "queue-congestion", "maintenance-qualification", "release-admission"],
  }));
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "transport-blocking")).toMatchObject({
    evidence: { blockedConnections: 1, blockedItemTicks: 100, connections: 17 },
    subjects: [{ kind: "connection", id: "etch-to-inspection" }],
  });
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "fab-loss.transport-blocking")).toBeFalse();
  expect(snapshot.catalog.routes.map((route) => route.id)).toEqual(["dram-front-end"]);
  expect(snapshot.experiments.map((experiment) => experiment.id)).toContain("equipment-energy-research");
  expect(snapshot.counts.designPrograms).toBe(3);
  expect(snapshot.designPrograms).toEqual([
    expect.objectContaining({
      id: "commissioned-dram-fab",
      benchmark: "greenfield-dram-design",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "greenfield-dram-fab",
      seed: { kind: "synthesis", inputBlueprint: "greenfield" },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "not-aligned", reasons: ["synthesis-seed"] },
      evidence: expect.objectContaining({ state: "not-applicable", authorityRunId: null }),
    }),
    expect.objectContaining({
      id: "integrated-dram-fab",
      seed: { kind: "blueprint", blueprint: "experiment" },
      promotionTarget: "experiment",
      alignment: { state: "not-aligned", reasons: ["seed-blueprint-mismatch", "promotion-target-mismatch"] },
      evidence: expect.objectContaining({ state: "not-applicable", authorityRunId: null }),
    }),
  ]);
  expect(snapshot.candidates).toEqual([
    expect.objectContaining({
      id: "closed-loop-layer-two-etch", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "b57802197eca94e2238013b2ead200e2f39436ae43ebdf1ec944bedca1dfc2d0",
        proposedCandidateHash: "6ed24bc31d8176104a511777e4e6296f04a623547c8d97c491196e28e00f1c23",
      }),
    }),
    expect.objectContaining({
      id: "commissioned-greenfield-dram-fab", benchmark: "greenfield-dram-design", patchOperations: 74,
      decision: expect.objectContaining({ state: "stale" }),
    }),
    expect.objectContaining({
      id: "commissioned-release-control", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "9ccae6b3df3178e9c2794ca06cb5270f6662a42d89b7d1bee02d5bc1bfe8e2e1",
        proposedCandidateHash: "0bc0ef35709a69a92426608cdcdc6350cb109dc88f3caaad48f7e4f3f46a25e3",
      }),
    }),
    expect.objectContaining({
      id: "commissioned-sustained-starvation-cadence", benchmark: "greenfield-dram-design", patchOperations: 3,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "ed733cbe502e68ea9de2b7616363f5623722cec0aadae384b5a3719714e163bc",
        proposedCandidateHash: "dea38a4fd312432e153a9de79ddc7de6dc9c44286c08759b0f9f700e446ea71d",
      }),
    }),
    expect.objectContaining({
      id: "continuous-deep-metrology", benchmark: "greenfield-dram-design", patchOperations: 4,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "dedicated-etch-quality-cell", benchmark: "greenfield-dram-design", patchOperations: 27,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "furnace-flex-dual-service", benchmark: "greenfield-dram-design", patchOperations: 4,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
      }),
    }),
    expect.objectContaining({
      id: "identity-safe-release-control", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "a6e8489bce16c1f9148cdd07ac6367b43fac8c5df57317abee03dbb1b05148e5",
        proposedCandidateHash: "c4177e82f758ab0704e8b17fc5213714d7bda6164d3375b03804d3c361ac9891",
      }),
    }),
    expect.objectContaining({
      id: "inspection-edd-resilience", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
      }),
    }),
    expect.objectContaining({
      id: "layer-two-lithography-capacity", benchmark: "greenfield-dram-design", patchOperations: 30,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "lithography-l2-edd", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({
        state: "verified", verdict: "KEEP",
        proposalHash: "639e2552beb8344d3e2e55eba3612265a3b2bb08b2c9738ded86bd323f284b12",
        proposedCandidateHash: "967aa232816e20e936e6e3e16d63114f52971574e825185f19aa36c9394e0a07",
      }),
    }),
    expect.objectContaining({
      id: "planned-lithography-maintenance", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "165714663627742c4e413d673e23b0b14c521ca89551cbed7ce0b62470300b18",
        proposedCandidateHash: "f4d8d4900067931ca81454498badbc3050041e2eb7a87f2decf3e1e67a600612",
      }),
    }),
    expect.objectContaining({
      id: "portfolio-aware-dram-dispatch", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({ state: "stale", verdict: "KEEP" }),
    }),
    expect.objectContaining({
      id: "recovered-output-high-throughput", benchmark: "greenfield-dram-design", patchOperations: 7,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "stable-furnace-sleep", benchmark: "equipment-energy-research", patchOperations: 1,
      decision: expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD", proposalHash: "7a901798f75777ed93f195cec9e4e140ec68fed7d7ea1a61270fff993355f174" }),
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^design\.inspect:commissioned-dram-fab:fab-loss\.input-starvation:/),
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "design", snapshot.project.rootDir, "--program", "commissioned-dram-fab", "--json"],
    studioRoute: "/memory-fab/designs/commissioned-dram-fab",
    target: expect.objectContaining({
      kind: "design-program",
      programId: "commissioned-dram-fab",
      diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
    }),
  }));
  const exhaustedId = "f".repeat(64);
  const withExhaustedEvidence = snapshot.designPrograms.map((program) => program.id === "commissioned-dram-fab" ? {
    ...program,
    evidence: {
      state: "exhausted" as const,
      authorityRunId: exhaustedId,
      currentRuns: 1,
      historicalRuns: 0,
      invalidRuns: 0,
      runs: [{
        id: exhaustedId,
        currentness: { state: "current" as const, reasons: [] },
        outcome: "exhausted" as const,
        continuation: null,
        budget: { maximum: 7, evaluated: 4 },
        best: {
          iteration: 0,
          blueprintHash: "a".repeat(64),
          promotionPatchOperations: 0,
          candidateScore: 29.321159,
          scoreDelta: 104.296881,
          verdict: "KEEP" as const,
        },
        stopReason: "frontier-exhausted" as const,
      }],
      invalid: [],
    },
  } : program);
  expect(buildWorkbenchNextAction({ ...snapshot, designPrograms: withExhaustedEvidence })).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^design\.run\.inspect:commissioned-dram-fab:/),
    title: "Expand Commissioned DRAM Fab Optimization's intervention portfolio",
    actionLabel: "REVIEW EXHAUSTED DESIGN",
    argv: ["inm", "design", snapshot.project.rootDir, "--program", "commissioned-dram-fab", "--run-id", exhaustedId, "--json"],
    studioRoute: `/memory-fab/designs/commissioned-dram-fab/runs/${exhaustedId}`,
    target: expect.objectContaining({ kind: "design-run", programId: "commissioned-dram-fab", runId: exhaustedId, phase: "exhausted" }),
  }));
  expect(snapshot.operations.find((operation) => operation.id === "design.run")).toEqual(expect.objectContaining({
    effect: "creates-artifact",
    availability: { state: "available", reasons: [] },
  }));
  const yieldQuality = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "yield-quality");
  expect(yieldQuality).toMatchObject({
    id: "yield-quality",
    subjects: [
      { kind: "device", id: "etch-l2" },
      { kind: "route", id: "dram-front-end" },
      { kind: "project", id: "dram-wafer" },
    ],
    evidence: {
      inspectedLots: 12,
      firstPassCompleted: 10,
      reworkedLots: 2,
      scrapDispositions: 0,
      originContributors: 1,
      subjectIntroducedLots: 2,
      subjectPersistentLots: 0,
      subjectScrappedLots: 0,
    },
  });
  expect(yieldQuality?.contributors).toHaveLength(1);
  expect(yieldQuality?.contributors[0]).toMatchObject({
    label: "etch-cell-layer-2",
    mechanism: "quality-excursion",
    defects: ["critical-dimension", "particle-contamination"],
    lots: ["dram-lot-03", "dram-lot-08"],
    subjects: [{ kind: "device", id: "etch-l2" }, { kind: "route", id: "dram-front-end" }],
    evidence: {
      introducedLots: 2,
      detectedLots: 2,
      reworkAttemptedLots: 2,
      repairedLots: 2,
      persistentLots: 0,
      scrappedLots: 0,
      escapedLots: 0,
    },
  });
  const inputStarvation = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "input-starvation");
  expect(inputStarvation).toMatchObject({
    subjects: [{ kind: "device", id: "furnace-1" }],
    evidence: {
      activeProductiveDevices: 11,
      flowProductiveDevices: 10,
      contributingDevices: 8,
      rawWaitingInputTicks: 1_669_016,
      flowRawWaitingInputTicks: 1_437_016,
      exceptionWaitingInputTicks: 232_000,
      boundaryWaitingInputTicks: 1_179_140,
      opportunityWindowTicks: 1_184_860,
      unavailableGapTicks: 76_000,
      starvationTicks: 257_876,
      subjectStarvationTicks: 42_456,
    },
  });
  expect(inputStarvation?.contributors[0]).toMatchObject({
    id: "device:furnace-1:inter-job-input-gap",
    mechanism: "inter-job-input-gap",
    evidence: { jobs: 12, starvationTicks: 42_456, opportunityWindowTicks: 114_456 },
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "q-time")).toBeUndefined();
  expect(snapshot.operations.find((operation) => operation.id === "candidate.preview")?.availability.state).toBe("conditional");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.guards).toContain("keep-verdict");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.availability.state).toBe("unavailable");
});

test("Design evidence classification chooses current leaf authority without timestamp or hash recency", () => {
  const hash = (value: string) => value.repeat(64);
  const identity: WorkbenchDesignEvidenceIdentity = {
    engineVersion: "inm-sim/test",
    project: "memory-fab",
    program: { id: "commissioned-dram-fab", hash: hash("a") },
    benchmark: { id: "greenfield-dram-design", contractHash: hash("b") },
    seed: {
      source: { kind: "blueprint", blueprint: "generated-dram-fab" },
      sourceBlueprintHash: hash("c"),
      blueprintHash: hash("d"),
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: hash("c") },
  };
  const run = (id: string, overrides: Partial<DesignRunSummary> = {}): DesignRunSummary => ({
    id: hash(id),
    path: `/design-runs/${id}`,
    engineVersion: identity.engineVersion,
    project: identity.project,
    program: identity.program.id,
    programHash: identity.program.hash,
    benchmark: identity.benchmark.id,
    benchmarkContractHash: identity.benchmark.contractHash,
    seed: structuredClone(identity.seed),
    promotionBase: { ...identity.promotionBase },
    continuation: null,
    budget: { maximum: 1, evaluated: 1 },
    best: {
      iteration: 0,
      blueprintHash: identity.seed.blueprintHash,
      promotionPatchOperations: 0,
      candidateScore: 1,
      scoreDelta: 1,
      verdict: "KEEP",
    },
    stopReason: "budget-exhausted",
    ...overrides,
  });
  const source = run("1");
  const continuation = run("2", {
    continuation: { sourceResultHash: source.id, reusedIterations: 1, reusedExhaustions: 0, additionalCandidateBudget: 1 },
    budget: { maximum: 2, evaluated: 2 },
  });
  const exhausted = run("3", { budget: { maximum: 7, evaluated: 4 }, stopReason: "frontier-exhausted" });
  const promotable = run("4", {
    budget: { maximum: 3, evaluated: 3 },
    best: { ...source.best, iteration: 3, promotionPatchOperations: 2, candidateScore: 4 },
    stopReason: "frontier-exhausted",
  });
  const historical = run("5", { programHash: hash("e") });
  const evidence = classifyDesignProgramEvidence(identity, [historical, exhausted, source, promotable, continuation], [{
    id: hash("6"), path: "/invalid", program: identity.program.id, code: "design.invalid-run", message: "invalid evidence",
  }]);
  expect(evidence).toEqual(expect.objectContaining({
    state: "promotable",
    authorityRunId: promotable.id,
    currentRuns: 4,
    historicalRuns: 1,
    invalidRuns: 1,
  }));
  expect(evidence.runs.find((item) => item.id === historical.id)?.currentness)
    .toEqual({ state: "historical", reasons: ["program-hash-mismatch"] });
  expect(evidence.runs.find((item) => item.id === continuation.id)?.outcome).toBe("continuable");
  expect(classifyDesignProgramEvidence(identity, [exhausted], []).state).toBe("exhausted");
  expect(classifyDesignProgramEvidence(identity, [], []).state).toBe("missing");
});

test("a historical run with a stale Device catalog cannot supply current fab loss authority", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"), {
    world: "cleanroom", blueprint: "equipment-energy-sleep", scenario: "equipment-energy-window", objective: "dram-energy",
  });
  expect(snapshot.status.evidence).toEqual({ state: "incompatible", runId: "066-simulate" });
  expect(snapshot.lossAttribution).toBeNull();
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code.startsWith("fab-loss."))).toBeFalse();
});

test("a non-KEEP Candidate receipt resolves review work without displacing current fab evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-candidate-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("design-runs") && !source.split("/").includes(".inm"),
  });
  await rm(join(projectDir, "candidate-reviews", "stable-furnace-sleep"), { recursive: true, force: true });

  const review = await previewCandidateOperation(projectDir, "stable-furnace-sleep");
  expect(review.effect).toBe("creates-artifact");
  expect(review.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  const reviewed = await openProjectWorkbenchSnapshot(projectDir);
  expect(reviewed.candidates.find((candidate) => candidate.id === "stable-furnace-sleep")?.decision)
    .toEqual(expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD" }));
  expect(reviewed.status.review).toEqual({ state: "stale", pendingCount: 0, staleCount: 13, verifiedCount: 1 });
  expect(reviewed.nextAction).toEqual(expect.objectContaining({
    id: expect.stringContaining("design.inspect:commissioned-dram-fab:fab-loss."),
    target: expect.objectContaining({ kind: "design-program", programId: "commissioned-dram-fab" }),
  }));
}, 20_000);

test("workbench inspection stays read-only for a project without runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-readonly-"));
  const projectDir = join(root, "ironworks");
  await cp(join(repository, "examples/ironworks"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  expect(snapshot.runs).toEqual([]);
  expect(snapshot.counts.runs).toBe(0);
  expect(await pathExists(join(projectDir, "runs"))).toBeFalse();
  expect(await pathExists(join(projectDir, ".inm"))).toBeFalse();
});

test("workbench rejects an invalid explicit selection instead of falling back", async () => {
  const projectDir = join(repository, "examples/ironworks");
  expect(openProjectWorkbenchSnapshot(projectDir, { blueprint: "missing-blueprint" }))
    .rejects.toThrow("missing-blueprint.blueprint.json");
});
