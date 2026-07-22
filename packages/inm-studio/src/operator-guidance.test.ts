import { expect, test } from "bun:test";
import { openProjectWorkbenchSnapshot, type ProjectWorkbenchSnapshot } from "@inm/core";
import { resolve } from "node:path";
import { recommendOperatorAction, type OperatorGuidanceSnapshot } from "./operator-guidance";

function snapshot(overrides: Partial<OperatorGuidanceSnapshot> = {}): OperatorGuidanceSnapshot {
  const selection: ProjectWorkbenchSnapshot["selection"] = {
    world: { id: "world", name: "World" },
    blueprint: { id: "blueprint", name: "Blueprint" },
    scenario: { id: "scenario", name: "Scenario", durationTicks: 1_000 },
    objective: { id: "objective", name: "Objective" },
  };
  return {
    selection,
    readiness: { ready: true, gapCount: 0, gapsByKind: {} },
    diagnostics: [],
    candidates: [],
    runs: [],
    operations: [
      { id: "analyze", label: "Analyze", description: "", effect: "read-only", selectionAware: true, requiresConfirmation: false, writeSet: [], guards: [], availability: { state: "available", reasons: [] } },
      { id: "simulate", label: "Simulate", description: "", effect: "creates-artifact", selectionAware: true, requiresConfirmation: false, writeSet: ["runs/<generated>/"], guards: [], availability: { state: "available", reasons: [] } },
    ],
    ...overrides,
  };
}

test("operator recommendation prioritizes shared blocking evidence", () => {
  const recommendation = recommendOperatorAction(snapshot({
    readiness: { ready: false, gapCount: 1, gapsByKind: { power: 1 } },
    diagnostics: [{ id: "power-gap", code: "capacity.power", severity: "blocking", priority: 100, subjects: [{ kind: "region", id: "fab" }], message: "Fab power is short", evidence: { source: "capacity-plan", summary: "Fab power is short" }, actionIds: ["plan"] }],
    candidates: [{ id: "candidate", name: "Candidate", benchmark: "benchmark", hypothesis: "Improve it", baseCandidateHash: "hash", patchOperations: 1 }],
  }));
  expect(recommendation).toEqual(expect.objectContaining({ tone: "blocking", target: { kind: "diagnostic", diagnosticId: "power-gap" } }));
});

test("operator recommendation makes a pending Candidate the review task", () => {
  const recommendation = recommendOperatorAction(snapshot({
    candidates: [{ id: "sleep", name: "Stable sleep", benchmark: "energy", hypothesis: "Avoid a wake", expectedEffect: "Retain the energy gain", baseCandidateHash: "hash", patchOperations: 1 }],
  }));
  expect(recommendation).toEqual(expect.objectContaining({ tone: "review", reason: "Retain the energy gain", target: { kind: "candidate", benchmarkId: "energy", candidateId: "sleep" } }));
});

test("operator recommendation requests evidence only for the exact effective selection", () => {
  const mismatchedRun: ProjectWorkbenchSnapshot["runs"][number] = {
    id: "other-run", score: 1, decision: "BASELINE", resultHash: "hash", engineVersion: "engine", compatible: true,
    selection: { world: "world", blueprint: "other", scenario: "scenario", objective: "objective" },
  };
  expect(recommendOperatorAction(snapshot({ runs: [mismatchedRun] }))).toEqual(expect.objectContaining({
    title: "Measure the current selection", target: { kind: "operation", operationId: "simulate" },
  }));
});

test("operator recommendation opens matching evidence after warnings are clear", () => {
  const matchingRun: ProjectWorkbenchSnapshot["runs"][number] = {
    id: "matching-run", score: 7.25, decision: "KEEP", resultHash: "hash", engineVersion: "engine", compatible: true,
    selection: { world: "world", blueprint: "blueprint", scenario: "scenario", objective: "objective" },
  };
  expect(recommendOperatorAction(snapshot({ runs: [matchingRun] }))).toEqual(expect.objectContaining({
    tone: "ready", target: { kind: "run", runId: "matching-run" },
  }));
});

test("memory-fab opens with its concrete optimization proposal as the next decision", async () => {
  const projectDir = resolve(import.meta.dir, "../../../examples/memory-fab");
  const recommendation = recommendOperatorAction(await openProjectWorkbenchSnapshot(projectDir));
  expect(recommendation).toEqual(expect.objectContaining({
    title: "Review Stable furnace sleep threshold",
    target: { kind: "candidate", benchmarkId: "equipment-energy-research", candidateId: "stable-furnace-sleep" },
  }));
});
