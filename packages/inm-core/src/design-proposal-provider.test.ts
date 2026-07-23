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
    branch: { nodeId: "seed", role: "leader" as const, depth: 0, leaderNodeId: "seed" },
    promotionBoundary: {
      leaderNodeId: "seed",
      selectedNodeId: "seed",
      promotable: true,
      aggregate: { leaderScore: 0, selectedScore: 0, scoreDelta: 0 },
      cases: [],
      limitingCase: null,
      guardrail: { kind: "uniform" as const, passed: true, violations: [] },
    },
    project,
    blueprint: project.blueprint,
    metrics,
    fabLoss: analyzeFabLossProfile(metrics, project.scenario.durationTicks, project),
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
  expect(first.strategy).toBe("maintenance:lithography-jobs-6");
  expect(first.addressedLoss).toBe(input.fabLoss!.chain[0]);
  expect(first.patch).toEqual([{
    op: "add",
    path: `/devices/${input.blueprint.devices.findIndex((device) => device.id === "lithography-1")}/policy/preventiveMaintenance`,
    value: { minimumJobs: 6 },
  }]);
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(loaded.blueprint, first.patch) })).not.toThrow();
});

test("memory-fab project provider targets the commissioned factory's measured delivery mismatch", async () => {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output",
  });
  const blueprint = structuredClone(loaded.blueprint);
  const burnIn = blueprint.devices.find((device) => device.id === "burn-in-1")!;
  burnIn.policy = { ...burnIn.policy, recipeDispatch: "authored-order" };
  const project = compileFactoryProject({ ...loaded, blueprint });
  const metrics = runUntil(project, undefined, { seed: 42 }).metrics;
  const fabLoss = analyzeFabLossProfile(metrics, project.scenario.durationTicks, project)!;
  expect(fabLoss).toMatchObject({
    version: 2,
    primary: {
      id: "delivery-portfolio",
      evidence: { underfilledContracts: 2, shortfall: 18, overflow: 16, netValue: -48 },
    },
    outcome: { deliveryShortfall: 18, deliveryOverflow: 16, portfolioNetValue: -48 },
  });
  const proposal = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose({
    iteration: 1,
    branch: { nodeId: "seed", role: "leader", depth: 0, leaderNodeId: "seed" },
    promotionBoundary: {
      leaderNodeId: "seed",
      selectedNodeId: "seed",
      promotable: true,
      aggregate: { leaderScore: 0, selectedScore: 0, scoreDelta: 0 },
      cases: [],
      limitingCase: null,
      guardrail: { kind: "uniform", passed: true, violations: [] },
    },
    project,
    blueprint,
    metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  });
  expect(proposal).toMatchObject({
    strategy: "dispatch:burn-in-contract-value",
    addressedLoss: "delivery-portfolio",
    patch: [{
      op: "replace",
      path: `/devices/${blueprint.devices.indexOf(burnIn)}/policy/recipeDispatch`,
      value: "contract-value",
    }],
  });
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

test("memory-fab project provider targets an exact promotion blocker before ordinary driver loss", async () => {
  const { root, loaded, input } = await memoryFabInput();
  const blueprint = structuredClone(input.blueprint);
  blueprint.devices = blueprint.devices.filter((device) => device.id !== "fab-utility-plant-2");
  const blocked = {
    ...input,
    branch: { nodeId: "candidate-6", parentNodeId: "candidate-3", role: "alternative" as const, depth: 4, leaderNodeId: "candidate-5" },
    promotionBoundary: {
      leaderNodeId: "candidate-5",
      selectedNodeId: "candidate-6",
      promotable: false,
      aggregate: { leaderScore: -246.416302, selectedScore: -244.352902, scoreDelta: 2.0634 },
      cases: [{
        id: "facility-interruption",
        name: "Timed fab utility interruption",
        leaderScore: -263.023866,
        selectedScore: -266.930745,
        scoreDelta: -3.906879,
        maximumScoreRegression: 0,
        guardrailPassed: false,
      }],
      limitingCase: "facility-interruption",
      guardrail: { kind: "uniform" as const, passed: false, violations: ["facility-interruption"] },
    },
    blueprint,
  };
  const repair = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(blocked);
  expect(repair).toMatchObject({ strategy: "facility:utility-n-plus-one", addressedCase: "facility-interruption" });
  expect(repair.addressedLoss).toBeUndefined();
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(blueprint, repair.patch) })).not.toThrow();
});

test("memory-fab project provider gives a retained setup campaign an exact interruption escape", async () => {
  const { root, loaded, input } = await memoryFabInput();
  const blueprint = structuredClone(input.blueprint);
  const lithography = blueprint.devices.find((device) => device.id === "lithography-1")!;
  lithography.recipes = [...lithography.recipes!, {
    process: "pattern-cell-layer-2",
    mode: "qualified",
    priority: 10,
    inputs: { "annealed-dielectric-stack-lot": "reentrant-input" },
    outputs: { "patterned-cell-l2-lot": "pattern-output" },
  }];
  lithography.policy = {
    ...lithography.policy,
    setupCampaign: { minimumReadyLots: 3, maximumHoldTicks: 12_000 },
  };
  const blocked = {
    ...input,
    branch: { nodeId: "candidate-6", parentNodeId: "candidate-4", role: "alternative" as const, depth: 5, leaderNodeId: "candidate-4" },
    promotionBoundary: {
      leaderNodeId: "candidate-4",
      selectedNodeId: "candidate-6",
      promotable: false,
      aggregate: { leaderScore: -242.898902, selectedScore: -242.443118, scoreDelta: 0.455784 },
      cases: [{
        id: "lithography-interruption",
        name: "Timed lithography interruption",
        leaderScore: -246.599285,
        selectedScore: -246.653952,
        scoreDelta: -0.054667,
        maximumScoreRegression: 0,
        guardrailPassed: false,
      }],
      limitingCase: "lithography-interruption",
      guardrail: { kind: "uniform" as const, passed: false, violations: ["lithography-interruption"] },
    },
    blueprint,
  };
  const repair = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose(blocked);
  expect(repair).toMatchObject({
    strategy: "setup-campaign:lithography-3-0-interruption-escape",
    addressedCase: "lithography-interruption",
    patch: [{
      op: "replace",
      path: `/devices/${blueprint.devices.indexOf(lithography)}/policy/setupCampaign`,
      value: { minimumReadyLots: 3, maximumHoldTicks: 0 },
    }],
  });
  expect(repair.addressedLoss).toBeUndefined();
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(blueprint, repair.patch) })).not.toThrow();
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
  await writeFile(resolve(providerRoot, "strategies/missing.ts"), `export default { apiVersion: 5, propose() { return ${proposal}; } };\n`);
  await writeFile(resolve(providerRoot, "strategies/fabricated.ts"), `export default { apiVersion: 5, propose() { return { ...${proposal}, addressedLoss: "release-admission" }; } };\n`);
  await writeFile(resolve(providerRoot, "strategies/fabricated-case.ts"), `export default { apiVersion: 5, propose() { return { ...${proposal}, addressedCase: "quality-excursion" }; } };\n`);
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/missing.ts").propose(input)).rejects.toThrow("must name addressedLoss");
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/fabricated.ts").propose(input)).rejects.toThrow("addressed unobserved loss 'release-admission'");
  const blocked = {
    ...input,
    branch: { ...input.branch, nodeId: "candidate-1", role: "alternative" as const },
    promotionBoundary: { ...input.promotionBoundary, selectedNodeId: "candidate-1", promotable: false, limitingCase: "facility-interruption", guardrail: { kind: "uniform" as const, passed: false, violations: ["facility-interruption"] } },
  };
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/missing.ts").propose(blocked)).rejects.toThrow("must name addressedCase");
  await expect(new ProjectStrategyResearchAgent(providerRoot, "strategies/fabricated-case.ts").propose(blocked)).rejects.toThrow("addressed non-blocking case 'quality-excursion'");
});
