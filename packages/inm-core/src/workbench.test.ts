import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { previewCandidateOperation } from "./operation";
import { openProjectWorkbenchSnapshot } from "./workbench";
import { pathExists, stableStringify } from "./utils";

const repository = resolve(import.meta.dir, "../../..");

test("shared workbench snapshot orients an operator with stable diagnostics and operations", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/ironworks"));
  expect(snapshot.version).toBe(5);
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
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"));
  expect(snapshot.project.id).toBe("memory-fab");
  expect(snapshot.status).toEqual(expect.objectContaining({
    capacity: { state: "ready", gapCount: 0, gapsByKind: {} },
    flow: { state: "at-risk", warningCount: 13, infoCount: 11 },
    evidence: { state: "current", runId: "074-simulate" },
    review: { state: "stale", pendingCount: 0, staleCount: 10, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.objective.wipResources).toContain("packaged-dram-device");
  expect(snapshot.objective.wipResources).not.toContain("dram-package-substrate");
  expect(snapshot.inventoryAccounting).toEqual(expect.objectContaining({
    runId: "074-simulate",
    averageWip: 21.793333333333333,
    averageTotalInventory: 119.14593333333333,
    averageExcludedInventory: 97.3526,
    peakWip: 55,
  }));
  expect(snapshot.inventoryAccounting?.resources["dram-package-substrate"]).toEqual(expect.objectContaining({
    includedInWip: false,
    averageInventory: 40.3624,
  }));
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
    }),
    expect.objectContaining({
      id: "greenfield-dram-fab",
      seed: { kind: "synthesis", inputBlueprint: "greenfield" },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "not-aligned", reasons: ["synthesis-seed"] },
    }),
    expect.objectContaining({
      id: "integrated-dram-fab",
      seed: { kind: "blueprint", blueprint: "experiment" },
      promotionTarget: "experiment",
      alignment: { state: "not-aligned", reasons: ["seed-blueprint-mismatch", "promotion-target-mismatch"] },
    }),
  ]);
  expect(snapshot.candidates).toEqual([
    expect.objectContaining({
      id: "closed-loop-layer-two-etch", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "verified", verdict: "KEEP",
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
      id: "continuous-deep-metrology", benchmark: "greenfield-dram-design", patchOperations: 4,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "187c75bd786fdca9f22656adf86257e4448dfa72969cb0bea474432f9ca42d25",
        proposedCandidateHash: "b62ff5ab7587e1519011b0397513efc865ed8e0d3ba2739c9cb3619312e30438",
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
        state: "stale", verdict: "KEEP",
        proposalHash: "6a00aae7ec10fde190a015a759bd0676be3988e39ead8be648ad4167266214ac",
        proposedCandidateHash: "5f2852b5c09a5fe68e7ab1a32a52cc401742146caaf51fb8a672ada8a89882fd",
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
      rawWaitingInputTicks: 1_666_216,
      flowRawWaitingInputTicks: 1_434_216,
      exceptionWaitingInputTicks: 232_000,
      boundaryWaitingInputTicks: 1_174_940,
      opportunityWindowTicks: 1_189_060,
      unavailableGapTicks: 76_000,
      starvationTicks: 259_276,
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
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true });
  await rm(join(projectDir, "candidate-reviews", "stable-furnace-sleep"), { recursive: true, force: true });

  const review = await previewCandidateOperation(projectDir, "stable-furnace-sleep");
  expect(review.effect).toBe("creates-artifact");
  expect(review.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  const reviewed = await openProjectWorkbenchSnapshot(projectDir);
  expect(reviewed.candidates.find((candidate) => candidate.id === "stable-furnace-sleep")?.decision)
    .toEqual(expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD" }));
  expect(reviewed.status.review).toEqual({ state: "stale", pendingCount: 0, staleCount: 10, verifiedCount: 1 });
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
