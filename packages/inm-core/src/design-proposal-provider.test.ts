import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { compileFactoryProject } from "./compiler";
import { ProjectProposalExhaustedError, ProjectStrategyResearchAgent } from "./design-proposal-provider";
import { loadFactoryProject } from "./loader";
import { planProductionCapacity } from "./capacity-plan";
import { analyzeProduction } from "./production-analysis";
import { applyResearchPatch } from "./research";
import { runUntil } from "./simulator";
import { analyzeFabLossProfile } from "./fab-loss-analysis";

async function memoryFabInput() {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, { blueprint: "experiment", scenario: "production-window", objective: "dram-output" });
  const project = compileFactoryProject(loaded);
  const metrics = runUntil(project, undefined, { seed: 42 }).metrics;
  const input = {
    iteration: 1,
    project,
    blueprint: project.blueprint,
    metrics,
    fabLoss: analyzeFabLossProfile(metrics, project.scenario.durationTicks),
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  };
  return { root, loaded, input };
}

test("memory-fab project provider returns one deterministic loss-guided proposal", async () => {
  const { root, loaded, input } = await memoryFabInput();
  const first = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(input);
  const second = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(input);
  expect(first).toEqual(second);
  expect(first.strategy).toBe("dispatch:conwip-9-6-edd");
  expect(first.addressedLoss).toBe(input.fabLoss!.chain[0]);
  expect(first.patch).toEqual([{ op: "add", path: "/policies/lotRelease", value: {
    kind: "conwip", maximumWip: 9, reopenAtWip: 6, maximumReleaseDelayTicks: 18_000, dispatch: "earliest-due-date",
  } }]);
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(loaded.blueprint, first.patch) })).not.toThrow();
});

test("project proposal providers cannot ignore or fabricate Core-owned loss evidence", async () => {
  const { root, input } = await memoryFabInput();
  const transport = input.fabLoss!.buckets.find((bucket) => bucket.id === "transport-blocking")!;
  const unmatched = { ...input, fabLoss: { ...input.fabLoss!, primary: transport, chain: ["transport-blocking" as const] } };
  await expect(new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(unmatched))
    .rejects.toBeInstanceOf(ProjectProposalExhaustedError);

  const providerRoot = await mkdtemp(`${tmpdir()}/inm-loss-provider-`);
  await mkdir(resolve(providerRoot, "strategies"));
  const proposal = `{ strategy: "dispatch:test", hypothesis: "test", patch: [{ op: "add", path: "/policies/lotRelease", value: {} }] }`;
  await writeFile(resolve(providerRoot, "strategies/missing.ts"), `export default { apiVersion: 2, propose() { return ${proposal}; } };\n`);
  await writeFile(resolve(providerRoot, "strategies/fabricated.ts"), `export default { apiVersion: 2, propose() { return { ...${proposal}, addressedLoss: "release-admission" }; } };\n`);
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/missing.ts").propose(input)).rejects.toThrow("must name addressedLoss");
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/fabricated.ts").propose(input)).rejects.toThrow("addressed unobserved loss 'release-admission'");
});
