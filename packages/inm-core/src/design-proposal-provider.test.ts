import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { compileFactoryProject } from "./compiler";
import { ProjectStrategyResearchAgent } from "./design-proposal-provider";
import { loadFactoryProject } from "./loader";
import { planProductionCapacity } from "./capacity-plan";
import { analyzeProduction } from "./production-analysis";
import { applyResearchPatch } from "./research";
import { runUntil } from "./simulator";

test("memory-fab project provider returns one deterministic confined proposal", async () => {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, { blueprint: "experiment", scenario: "production-window", objective: "dram-output" });
  const project = compileFactoryProject(loaded);
  const metrics = runUntil(project, undefined, { seed: 42 }).metrics;
  const input = {
    iteration: 1,
    project,
    blueprint: project.blueprint,
    metrics,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  };
  const first = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(input);
  const second = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(input);
  expect(first).toEqual(second);
  expect(first.strategy).toBe("dispatch:conwip-9-6-edd");
  expect(first.patch).toEqual([{ op: "add", path: "/policies/lotRelease", value: {
    kind: "conwip", maximumWip: 9, reopenAtWip: 6, maximumReleaseDelayTicks: 18_000, dispatch: "earliest-due-date",
  } }]);
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(loaded.blueprint, first.patch) })).not.toThrow();
});
