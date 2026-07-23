import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { applyCandidateOperation, previewCandidateOperation } from "./operation";
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
    flow: { state: "at-risk", warningCount: 13, infoCount: 12 },
    review: { state: "pending", pendingCount: 1, staleCount: 0, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.catalog.routes.map((route) => route.id)).toEqual(["dram-front-end"]);
  expect(snapshot.experiments.map((experiment) => experiment.id)).toContain("equipment-energy-research");
  expect(snapshot.candidates).toEqual([
    expect.objectContaining({
      id: "commissioned-greenfield-dram-fab", benchmark: "greenfield-dram-design", patchOperations: 74,
      decision: expect.objectContaining({ state: "verified", verdict: "KEEP", currentCandidateHash: "2511191a2ddb542dce3d551ef539e278825a53362576d093cb1ff9381a8c9356" }),
    }),
    expect.objectContaining({
      id: "stable-furnace-sleep", benchmark: "equipment-energy-research", patchOperations: 1,
      decision: expect.objectContaining({ state: "proposed", proposalHash: expect.any(String) }),
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: "candidate.review:stable-furnace-sleep",
    effect: "creates-artifact",
    requiresConfirmation: false,
    argv: ["inm", "candidate", snapshot.project.rootDir, "--candidate", "stable-furnace-sleep", "--json"],
    studioRoute: "/memory-fab/experiments/equipment-energy-research/candidates/stable-furnace-sleep",
  }));
  expect(snapshot.operations.find((operation) => operation.id === "candidate.preview")?.availability.state).toBe("conditional");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.guards).toContain("keep-verdict");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.availability.state).toBe("unavailable");
});

test("a hash-compatible tracked-lot run outranks nominal warnings with measured fab loss attribution", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"), {
    world: "cleanroom", blueprint: "equipment-energy-sleep", scenario: "equipment-energy-window", objective: "dram-energy",
  });
  expect(snapshot.status.evidence).toEqual({ state: "current", runId: "052-simulate" });
  expect(snapshot.lossAttribution).toEqual(expect.objectContaining({
    run: { id: "052-simulate", resultHash: expect.any(String) },
    family: "dram-wafer",
    outcome: expect.objectContaining({ scheduled: 12, released: 12, completed: 12, goodYield: 1 }),
    primary: expect.objectContaining({ id: "queue-starvation", score: expect.any(Number) }),
    chain: expect.arrayContaining(["queue-starvation", "maintenance-qualification", "setup-campaign"]),
  }));
  expect(snapshot.lossAttribution!.buckets.every((bucket, index, buckets) => index === 0 || buckets[index - 1]!.score >= bucket.score)).toBeTrue();
  expect(snapshot.diagnostics[0]).toEqual(expect.objectContaining({
    code: "fab-loss.queue-starvation", priority: 90,
    evidence: expect.objectContaining({ source: "compatible-run", runId: "052-simulate" }),
  }));
  expect(snapshot.diagnostics.findIndex((diagnostic) => diagnostic.code === "fab-loss.queue-starvation"))
    .toBeLessThan(snapshot.diagnostics.findIndex((diagnostic) => diagnostic.code.startsWith("analysis.")));
});

test("Candidate review and apply advance the shared decision across reloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-candidate-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true });
  await rm(join(projectDir, "candidate-reviews", "stable-furnace-sleep"), { recursive: true, force: true });

  const review = await previewCandidateOperation(projectDir, "stable-furnace-sleep");
  expect(review.effect).toBe("creates-artifact");
  expect(review.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  const reviewed = await openProjectWorkbenchSnapshot(projectDir);
  expect(reviewed.candidates.find((candidate) => candidate.id === "stable-furnace-sleep")?.decision.state).toBe("reviewed-keep");
  expect(reviewed.status.review).toEqual({ state: "pending", pendingCount: 1, staleCount: 0, verifiedCount: 1 });
  expect(reviewed.nextAction).toEqual(expect.objectContaining({
    id: "candidate.apply:stable-furnace-sleep", effect: "mutates-project", requiresConfirmation: true,
  }));

  await applyCandidateOperation(projectDir, "stable-furnace-sleep", review.data);
  const verified = await openProjectWorkbenchSnapshot(projectDir);
  expect(verified.candidates.find((candidate) => candidate.id === "stable-furnace-sleep")?.decision).toEqual(expect.objectContaining({ state: "verified", verdict: "KEEP" }));
  expect(verified.status.review).toEqual({ state: "clear", pendingCount: 0, staleCount: 0, verifiedCount: 2 });
  expect(verified.nextAction.id.startsWith("candidate.")).toBeFalse();
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
