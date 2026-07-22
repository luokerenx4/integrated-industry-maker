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

test("memory-fab project provider diversifies measured loss targets from immutable history", async () => {
  const { root, loaded, input } = await memoryFabInput();
  const chain = ["q-time", "yield-quality", "queue-starvation", "batch-formation", "setup-campaign", "maintenance-qualification"] as const;
  const blueprint = structuredClone(input.blueprint);
  const furnace = blueprint.devices.find((device) => device.id === "furnace-1")!;
  furnace.recipe = { ...furnace.recipe!, process: "batch-anneal-dielectric-stack" };
  delete furnace.recipes;
  const guided = { ...input, blueprint, fabLoss: { ...input.fabLoss!, chain: [...chain] } };
  const agent = new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts");
  const history = [{
    iteration: 1,
    strategy: "dispatch:conwip-9-6-edd",
    hypothesis: "already evaluated q-time release control",
    addressedLoss: "q-time" as const,
    decision: "KEEP" as const,
    score: 1,
    scoreDelta: 1,
  }];
  const maintenance = await agent.propose({ ...guided, iteration: 2, history });
  expect(maintenance).toMatchObject({ strategy: "maintenance:lithography-jobs-6", addressedLoss: "yield-quality" });

  const release = await agent.propose({ ...guided, iteration: 3, history: [...history, {
    iteration: 2,
    strategy: maintenance.strategy!,
    hypothesis: maintenance.hypothesis,
    addressedLoss: maintenance.addressedLoss,
    decision: "KEEP" as const,
    score: 2,
    scoreDelta: 1,
  }] });
  expect(release).toMatchObject({ strategy: "dispatch:conwip-8-5-edd", addressedLoss: "queue-starvation" });

  const batch = await agent.propose({ ...guided, iteration: 4, history: [...history, {
    iteration: 2,
    strategy: maintenance.strategy!,
    hypothesis: maintenance.hypothesis,
    addressedLoss: maintenance.addressedLoss,
    decision: "KEEP" as const,
    score: 2,
    scoreDelta: 1,
  }, {
    iteration: 3,
    strategy: release.strategy!,
    hypothesis: release.hypothesis,
    addressedLoss: release.addressedLoss,
    decision: "REVERT" as const,
    score: 1,
    scoreDelta: -1,
  }] });
  expect(batch).toMatchObject({ strategy: "batch-formation:furnace-flex-30000", addressedLoss: "batch-formation" });
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(blueprint, batch.patch) })).not.toThrow();

  const campaign = await agent.propose({ ...guided, iteration: 5, history: [...history, {
    iteration: 2,
    strategy: maintenance.strategy!,
    hypothesis: maintenance.hypothesis,
    addressedLoss: maintenance.addressedLoss,
    decision: "KEEP" as const,
    score: 2,
    scoreDelta: 1,
  }, {
    iteration: 3,
    strategy: release.strategy!,
    hypothesis: release.hypothesis,
    addressedLoss: release.addressedLoss,
    decision: "REVERT" as const,
    score: 1,
    scoreDelta: -1,
  }, {
    iteration: 4,
    strategy: batch.strategy!,
    hypothesis: batch.hypothesis,
    addressedLoss: batch.addressedLoss,
    decision: "REVERT" as const,
    score: 1,
    scoreDelta: -1,
  }] });
  expect(campaign).toMatchObject({ strategy: "setup-campaign:lithography-3-12000", addressedLoss: "setup-campaign" });
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
  await writeFile(resolve(providerRoot, "strategies/missing.ts"), `export default { apiVersion: 3, propose() { return ${proposal}; } };\n`);
  await writeFile(resolve(providerRoot, "strategies/fabricated.ts"), `export default { apiVersion: 3, propose() { return { ...${proposal}, addressedLoss: "release-admission" }; } };\n`);
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/missing.ts").propose(input)).rejects.toThrow("must name addressedLoss");
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/fabricated.ts").propose(input)).rejects.toThrow("addressed unobserved loss 'release-admission'");
});
