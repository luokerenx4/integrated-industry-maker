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
    evidence: { state: "current", runId: "063-simulate" },
    review: { state: "stale", pendingCount: 0, staleCount: 5, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.catalog.routes.map((route) => route.id)).toEqual(["dram-front-end"]);
  expect(snapshot.experiments.map((experiment) => experiment.id)).toContain("equipment-energy-research");
  expect(snapshot.candidates).toEqual([
    expect.objectContaining({
      id: "commissioned-greenfield-dram-fab", benchmark: "greenfield-dram-design", patchOperations: 74,
      decision: expect.objectContaining({ state: "stale", verdict: "KEEP", currentCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392" }),
    }),
    expect.objectContaining({
      id: "dedicated-etch-quality-cell", benchmark: "greenfield-dram-design", patchOperations: 27,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "d5bbbae23fefc51fdefc4e5ba6636baae6f1e182b28c2fddec333b763bb69687",
        currentCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392",
      }),
    }),
    expect.objectContaining({
      id: "furnace-flex-dual-service", benchmark: "greenfield-dram-design", patchOperations: 4,
      decision: expect.objectContaining({
        state: "verified", verdict: "KEEP",
        proposalHash: "d2da7f191a212a42302307cb1582d66a2841b697e034ba2c76b8bef54d1a613a",
        currentCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392",
        proposedCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392",
      }),
    }),
    expect.objectContaining({
      id: "inspection-edd-resilience", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "6f55c2a1c8229efcbb90e6d373664b78193ea7e2ead9e7863d5f69e9c3739c6d",
        currentCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392",
      }),
    }),
    expect.objectContaining({
      id: "layer-two-lithography-capacity", benchmark: "greenfield-dram-design", patchOperations: 30,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "86aefb102832a22e1fe551aea7e2e88e79558a69c34b4873152cd8a652a8211b",
        currentCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392",
      }),
    }),
    expect.objectContaining({
      id: "portfolio-aware-dram-dispatch", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({ state: "stale", verdict: "KEEP", currentCandidateHash: "d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392" }),
    }),
    expect.objectContaining({
      id: "stable-furnace-sleep", benchmark: "equipment-energy-research", patchOperations: 1,
      decision: expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD", proposalHash: "432ab0f0b3bef886503fa02df5afa6b80729f7c42b19af6449473cc2c5a0d013" }),
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^diagnostic:fab-loss\.yield-quality:/),
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "analyze", snapshot.project.rootDir, "--world", "cleanroom", "--blueprint", "generated-dram-fab", "--scenario", "production-window", "--objective", "dram-output", "--section", "diagnostics", "--json"],
    studioRoute: expect.stringContaining("/memory-fab/analysis/diagnostics/fab-loss.yield-quality"),
  }));
  expect(snapshot.lossAttribution?.primary).toMatchObject({
    id: "yield-quality",
    evidence: {
      inspectedLots: 12,
      firstPassCompleted: 8,
      firstPassYield: 2 / 3,
      reworkedLots: 4,
      scrapDispositions: 4,
      escapedDefects: 0,
    },
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
      evidence: { violatedLots: 2, violations: 2, totalOverrunTicks: 83_600 },
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
  expect(snapshot.status.evidence).toEqual({ state: "current", runId: "064-simulate" });
  expect(snapshot.lossAttribution).toEqual(expect.objectContaining({
    version: 4,
    run: { id: "064-simulate", resultHash: "a400286cadc9ae78a79217677ecf65780abd3e53e05a733e64f76863e85d0850" },
    family: "dram-wafer",
    outcome: expect.objectContaining({
      scheduled: 12, released: 12, completed: 12, firstPassYield: 1,
      deliveryShortfall: 15, deliveryOverflow: 3, portfolioNetValue: 236,
    }),
    primary: expect.objectContaining({ id: "input-starvation", score: expect.any(Number) }),
    chain: ["input-starvation", "queue-congestion", "delivery-portfolio", "transport-blocking", "maintenance-qualification"],
  }));
  expect(snapshot.lossAttribution!.primary!.subjects).toEqual([{ kind: "device", id: "burn-in-1" }]);
  expect(snapshot.lossAttribution!.primary!.evidence).toEqual(expect.objectContaining({
    activeProductiveDevices: 10,
    subjectWaitingInputTicks: 158_000,
    subjectUtilization: 0.5611111111111111,
  }));
  expect(snapshot.lossAttribution!.buckets.every((bucket, index, buckets) => index === 0 || buckets[index - 1]!.score >= bucket.score)).toBeTrue();
  expect(snapshot.diagnostics[0]).toEqual(expect.objectContaining({
    code: "fab-loss.input-starvation", priority: 90,
    evidence: expect.objectContaining({ source: "compatible-run", runId: "064-simulate" }),
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
  expect(reviewed.status.review).toEqual({ state: "stale", pendingCount: 0, staleCount: 5, verifiedCount: 1 });
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
