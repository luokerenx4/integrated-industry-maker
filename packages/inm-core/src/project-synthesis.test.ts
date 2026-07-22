import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject } from "./loader";
import { planProductionCapacity } from "./capacity-plan";
import { synthesizeProjectBlueprint } from "./project-synthesis";
import { runUntil } from "./simulator";
import { stableStringify } from "./utils";
import { evaluateBlueprintBenchmark } from "./benchmark";

const memoryFab = resolve("examples/memory-fab");

test("project-local strategy expands an empty site into a deterministic operating re-entrant memory fab", async () => {
  const source = await loadFactoryProject(memoryFab, {
    blueprint: "greenfield", scenario: "production-window", objective: "dram-output",
  });
  expect(source.blueprint.devices).toHaveLength(0);

  const first = await synthesizeProjectBlueprint(source);
  const second = await synthesizeProjectBlueprint(source);
  expect(first.method).toBe("project-strategy");
  expect(stableStringify(first.blueprint)).toBe(stableStringify(second.blueprint));
  expect(first.blueprint.devices).toHaveLength(56);
  expect(first.blueprint.connections).toHaveLength(16);
  if (first.method !== "project-strategy") throw new Error("expected project strategy");
  expect(first.strategy.summary.trackedRoute).toBe("dram-front-end");

  const project = compileFactoryProject({ ...source, blueprint: first.blueprint });
  expect(planProductionCapacity(project)).toMatchObject({ ready: true, gaps: [] });
  const run = runUntil(project, undefined, { seed: 42 });
  expect(run.metrics.infeasibleReason).toBeNull();
  expect(run.metrics.lotFlow.released).toBe(12);
  expect(run.metrics.lotFlow.completed).toBeGreaterThan(0);
  expect(run.metrics.routeFlow["dram-front-end"]!.reentrantTransitions).toBe(10);
  expect(run.metrics.deliveryPortfolio.valued).toBeGreaterThan(0);

  const benchmark = await evaluateBlueprintBenchmark(memoryFab, "dispatch-research", { candidateBlueprint: first.blueprint });
  expect(benchmark.cases).toHaveLength(5);
  expect(benchmark.cases.every((item) => item.candidateCapacityReady)).toBeTrue();
  expect(benchmark.cases.every((item) => item.candidateMetrics.completedLots > 0)).toBeTrue();
}, 15_000);
