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
  expect(snapshot.version).toBe(3);
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
    regions: 2, deviceInstances: 29, connections: 8, experiments: 5,
  }));
  expect(snapshot.catalog.resources.map((asset) => asset.id)).toContain("iron-ore");
  expect(snapshot.experiments.map((experiment) => experiment.id)).toEqual([
    "autoresearch", "high-speed-transport", "power-priority", "power-satisfaction", "station-energy",
  ]);

  const operationIds = new Set(snapshot.operations.map((operation) => operation.id));
  expect(operationIds).toEqual(new Set([
    "validate", "inspect", "analyze", "plan", "simulate", "synthesize", "benchmark.evaluate", "candidate.preview", "candidate.apply",
  ]));
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
    flow: { state: "at-risk", warningCount: 10, infoCount: 12 },
    evidence: { state: "current", runId: "068-simulate" },
    review: { state: "stale", pendingCount: 0, staleCount: 7, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.catalog.routes.map((route) => route.id)).toEqual(["dram-front-end"]);
  expect(snapshot.experiments.map((experiment) => experiment.id)).toContain("equipment-energy-research");
  expect(snapshot.candidates).toEqual([
    expect.objectContaining({
      id: "commissioned-greenfield-dram-fab", benchmark: "greenfield-dram-design", patchOperations: 74,
      decision: expect.objectContaining({ state: "stale" }),
    }),
    expect.objectContaining({
      id: "commissioned-release-control", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "verified", verdict: "KEEP",
        proposalHash: "9ccae6b3df3178e9c2794ca06cb5270f6662a42d89b7d1bee02d5bc1bfe8e2e1",
        proposedCandidateHash: "0bc0ef35709a69a92426608cdcdc6350cb109dc88f3caaad48f7e4f3f46a25e3",
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
      id: "stable-furnace-sleep", benchmark: "equipment-energy-research", patchOperations: 1,
      decision: expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD", proposalHash: "7a901798f75777ed93f195cec9e4e140ec68fed7d7ea1a61270fff993355f174" }),
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^diagnostic:fab-loss\.yield-quality:/),
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "analyze", snapshot.project.rootDir, "--world", "cleanroom", "--blueprint", "generated-dram-fab", "--scenario", "production-window", "--objective", "dram-output", "--section", "diagnostics", "--json"],
    studioRoute: expect.stringContaining("/memory-fab/analysis/diagnostics/fab-loss.yield-quality"),
  }));
  const yieldQuality = snapshot.lossAttribution?.primary;
  expect(yieldQuality).toMatchObject({
    id: "yield-quality",
    subjects: [
      { kind: "device", id: "etch-l2" },
      { kind: "route", id: "dram-front-end" },
      { kind: "project", id: "dram-wafer" },
    ],
    evidence: {
      inspectedLots: 12,
      firstPassCompleted: 8,
      reworkedLots: 4,
      scrapDispositions: 4,
      originContributors: 2,
      subjectIntroducedLots: 3,
      subjectPersistentLots: 2,
      subjectScrappedLots: 2,
    },
  });
  expect(yieldQuality?.contributors).toHaveLength(2);
  expect(yieldQuality?.contributors[0]).toMatchObject({
    label: "etch-cell-layer-2",
    mechanism: "quality-excursion",
    defects: ["critical-dimension", "latent-electrical", "particle-contamination"],
    lots: ["dram-lot-03", "dram-lot-08", "dram-lot-11"],
    subjects: [{ kind: "device", id: "etch-l2" }, { kind: "route", id: "dram-front-end" }],
    evidence: {
      introducedLots: 3,
      detectedLots: 3,
      reworkAttemptedLots: 3,
      repairedLots: 1,
      persistentLots: 2,
      scrappedLots: 2,
      escapedLots: 0,
    },
  });
  expect(yieldQuality?.contributors[1]).toMatchObject({
    label: "final-inspection",
    mechanism: "route-q-time-defect",
    defects: ["particle-contamination"],
    lots: ["dram-lot-03", "dram-lot-06"],
    evidence: { introducedLots: 2, detectedLots: 2, scrappedLots: 2 },
  });
  const inputStarvation = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "input-starvation");
  expect(inputStarvation).toMatchObject({
    subjects: [{ kind: "device", id: "probe-1" }],
    evidence: {
      activeProductiveDevices: 11,
      flowProductiveDevices: 10,
      contributingDevices: 8,
      rawWaitingInputTicks: 1_612_000,
      flowRawWaitingInputTicks: 1_404_000,
      exceptionWaitingInputTicks: 208_000,
      boundaryWaitingInputTicks: 1_220_000,
      opportunityWindowTicks: 1_140_050,
      unavailableGapTicks: 110_050,
      starvationTicks: 184_000,
      subjectStarvationTicks: 53_500,
    },
  });
  expect(inputStarvation?.contributors[0]).toMatchObject({
    id: "device:probe-1:inter-job-input-gap",
    mechanism: "inter-job-input-gap",
    evidence: { jobs: 8, starvationTicks: 53_500, opportunityWindowTicks: 117_500 },
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "q-time")).toMatchObject({
    evidence: { violatedLots: 2, violations: 2, contributors: 1 },
    contributors: [{
      id: "dram-front-end:final-inspection:maintenance-qualification",
      mechanism: "maintenance-qualification",
      subjects: [
        { kind: "route", id: "dram-front-end" },
        { kind: "device", id: "inspection-1" },
        { kind: "device", id: "maintenance-service-1" },
      ],
      evidence: { violatedLots: 2, violations: 2, totalOverrunTicks: 96_200 },
    }],
  });
  expect(snapshot.operations.find((operation) => operation.id === "candidate.preview")?.availability.state).toBe("conditional");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.guards).toContain("keep-verdict");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.availability.state).toBe("unavailable");
});

test("a hash-compatible tracked-lot run outranks nominal warnings with measured fab loss attribution", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"), {
    world: "cleanroom", blueprint: "equipment-energy-sleep", scenario: "equipment-energy-window", objective: "dram-energy",
  });
  expect(snapshot.status.evidence).toEqual({ state: "current", runId: "066-simulate" });
  expect(snapshot.lossAttribution).toEqual(expect.objectContaining({
    version: 4,
    run: { id: "066-simulate", resultHash: "caa6fbc0a917317e257ecfde0c4a751b7a26cc51f942aa3a61dddbd5741493ee" },
    family: "dram-wafer",
    outcome: expect.objectContaining({
      scheduled: 12, released: 12, completed: 12, firstPassYield: 1,
      deliveryShortfall: 15, deliveryOverflow: 3, portfolioNetValue: 236,
    }),
    primary: expect.objectContaining({ id: "input-starvation", score: expect.any(Number) }),
    chain: ["input-starvation", "queue-congestion", "delivery-portfolio", "transport-blocking", "maintenance-qualification"],
  }));
  expect(snapshot.lossAttribution!.primary!.subjects).toEqual([{ kind: "device", id: "packaging-1" }]);
  expect(snapshot.lossAttribution!.primary!.evidence).toEqual(expect.objectContaining({
    activeProductiveDevices: 10,
    flowProductiveDevices: 10,
    contributingDevices: 10,
    rawWaitingInputTicks: 2_373_100,
    boundaryWaitingInputTicks: 917_600,
    opportunityWindowTicks: 2_605_500,
    unavailableGapTicks: 221_500,
    starvationTicks: 1_455_500,
    subjectStarvationTicks: 161_000,
    subjectUtilization: 0.3663888888888889,
  }));
  expect(snapshot.lossAttribution!.buckets.every((bucket, index, buckets) => index === 0 || buckets[index - 1]!.score >= bucket.score)).toBeTrue();
  expect(snapshot.diagnostics[0]).toEqual(expect.objectContaining({
    code: "fab-loss.input-starvation", priority: 90,
    evidence: expect.objectContaining({ source: "compatible-run", runId: "066-simulate" }),
  }));
  expect(snapshot.diagnostics.findIndex((diagnostic) => diagnostic.code === "fab-loss.input-starvation"))
    .toBeLessThan(snapshot.diagnostics.findIndex((diagnostic) => diagnostic.code.startsWith("analysis.")));
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
  expect(reviewed.status.review).toEqual({ state: "stale", pendingCount: 0, staleCount: 7, verifiedCount: 1 });
  expect(reviewed.nextAction).toEqual(expect.objectContaining({
    id: expect.stringContaining("fab-loss."),
    target: expect.objectContaining({ kind: "diagnostic" }),
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
