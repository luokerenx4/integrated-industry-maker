import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
import { SCORE_BREAKDOWN_COMPONENTS, type ScoreBreakdown } from "./types";

function zeroScoreBreakdown(): ScoreBreakdown {
  return Object.fromEntries(SCORE_BREAKDOWN_COMPONENTS.map((component) => [component, 0])) as ScoreBreakdown;
}

function scoreBreakdownEvidence() {
  return {
    leaderScoreBreakdown: zeroScoreBreakdown(),
    selectedScoreBreakdown: zeroScoreBreakdown(),
    scoreBreakdownDelta: zeroScoreBreakdown(),
  };
}

function migrateArchivedBlueprintForTest<T>(value: T): T {
  const blueprint = structuredClone(value) as {
    devices: Array<{ policy?: { preventiveMaintenance?: Record<string, unknown> } }>;
    policies?: {
      lotRelease?: {
        maximumReleaseDelayTicks?: number;
        serviceLevelAfterTicks?: number;
      };
    };
  };
  for (const device of blueprint.devices) {
    const policy = device.policy?.preventiveMaintenance;
    if (typeof policy?.minimumJobs === "number") {
      device.policy!.preventiveMaintenance = { opportunistic: { afterJobs: policy.minimumJobs } };
    }
  }
  const lotRelease = blueprint.policies?.lotRelease;
  if (typeof lotRelease?.maximumReleaseDelayTicks === "number") {
    lotRelease.serviceLevelAfterTicks = lotRelease.maximumReleaseDelayTicks;
    delete lotRelease.maximumReleaseDelayTicks;
  }
  return blueprint as T;
}

async function memoryFabInput() {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, { blueprint: "experiment", scenario: "production-window", objective: "dram-output" });
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const metrics = result.metrics;
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
    fabLoss: analyzeFabLossProfile(metrics, project.scenario.durationTicks, project, result.events),
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
    value: { planned: { afterJobs: 6 } },
  }]);
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(loaded.blueprint, first.patch) })).not.toThrow();
});

test("commissioned input starvation proposes the bounded adaptive agile-pulse ALD control", async () => {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab",
    scenario: "production-window",
    objective: "dram-output",
  });
  const authoredDeposition = loaded.blueprint.devices.find((device) => device.id === "deposition-1")!;
  const qualifiedDeposition = authoredDeposition.recipe
    ?? authoredDeposition.recipes?.find((recipe) => recipe.process === "deposit-dielectric-stack" && recipe.mode === "qualified");
  if (!qualifiedDeposition) throw new Error("Missing qualified commissioned ALD recipe");
  authoredDeposition.recipe = structuredClone(qualifiedDeposition);
  delete authoredDeposition.recipes;
  if (authoredDeposition.policy) delete authoredDeposition.policy.cadenceControl;
  loaded.blueprint.revision = "6ed24bc31d8176104a511777e4e6296f04a623547c8d97c491196e28e00f1c23";
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const fabLoss = analyzeFabLossProfile(result.metrics, project.scenario.durationTicks, project, result.events)!;
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
    blueprint: project.blueprint,
    metrics: result.metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  });
  const depositionIndex = project.blueprint.devices.findIndex((device) => device.id === "deposition-1");
  const normalRecipe = structuredClone(project.blueprint.devices[depositionIndex]!.recipe!);

  expect(fabLoss.chain[0]).toBe("input-starvation");
  expect(proposal).toMatchObject({
    strategy: "recipe:adaptive-agile-pulse-deposition-after-10000",
    addressedLoss: "input-starvation",
    patch: [
      { op: "remove", path: `/devices/${depositionIndex}/recipe` },
      {
        op: "add",
        path: `/devices/${depositionIndex}/recipes`,
        value: [
          normalRecipe,
          { ...structuredClone(normalRecipe), mode: "agile-pulse" },
        ],
      },
      {
        op: "add",
        path: `/devices/${depositionIndex}/policy/cadenceControl`,
        value: {
          kind: "downstream-starvation-recovery",
          process: "deposit-dielectric-stack",
          normalMode: "qualified",
          recoveryMode: "agile-pulse",
          downstreamConnection: "deposition-to-batch-furnace",
          recoverBelowItems: 1,
          minimumStarvationTicks: 10_000,
        },
      },
    ],
  });
  expect(() => compileFactoryProject({
    ...loaded,
    blueprint: applyResearchPatch(project.blueprint, proposal.patch),
  })).not.toThrow();
});

test("commissioned provider proposes only layer-two lithography EDD after cadence control", async () => {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab",
    scenario: "production-window",
    objective: "dram-output",
  });
  const lithography = loaded.blueprint.devices.find((device) => device.id === "lithography-l2")!;
  lithography.policy!.lotDispatch = "fifo";
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const fabLoss = analyzeFabLossProfile(result.metrics, project.scenario.durationTicks, project, result.events)!;
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
    blueprint: project.blueprint,
    metrics: result.metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  });
  const lithographyIndex = project.blueprint.devices.findIndex((device) => device.id === "lithography-l2");

  expect(fabLoss.chain[0]).toBe("input-starvation");
  expect(proposal).toMatchObject({
    strategy: "dispatch:lithography-l2-earliest-due-date",
    addressedLoss: "input-starvation",
    patch: [{
      op: "replace",
      path: `/devices/${lithographyIndex}/policy/lotDispatch`,
      value: "earliest-due-date",
    }],
  });
  expect(() => compileFactoryProject({
    ...loaded,
    blueprint: applyResearchPatch(project.blueprint, proposal.patch),
  })).not.toThrow();
});

test("pre-intervention memory-fab yield loss proposes recovered-output delivery conversion", async () => {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab",
    scenario: "production-window",
    objective: "dram-output",
  });
  const blueprint = migrateArchivedBlueprintForTest(JSON.parse(
    await readFile(resolve(root, "runs/070-simulate/blueprint.json"), "utf8"),
  ));
  const project = compileFactoryProject({ ...loaded, blueprint });
  const result = runUntil(project, undefined, { seed: 42 });
  const metrics = result.metrics;
  const fabLoss = analyzeFabLossProfile(metrics, project.scenario.durationTicks, project, result.events)!;
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
    blueprint: project.blueprint,
    metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  });
  const recoveryIndex = project.blueprint.devices.findIndex((device) => device.id === "rework-1");
  const burnInIndex = project.blueprint.devices.findIndex((device) => device.id === "burn-in-1");

  expect(fabLoss.chain[0]).toBe("yield-quality");
  expect(proposal).toMatchObject({
    strategy: "recipe:advanced-recovery+high-throughput-burn-in",
    addressedLoss: "yield-quality",
    patch: [{
      op: "replace",
      path: `/devices/${recoveryIndex}/asset`,
      value: "advanced-pattern-recovery-cell",
    }, {
      op: "replace",
      path: `/devices/${recoveryIndex}/recipe/process`,
      value: "recover-final-pattern-advanced",
    }, {
      op: "replace",
      path: "/policies/lotRelease",
      value: {
        kind: "conwip",
        maximumWip: 6,
        reopenAtWip: 3,
        serviceLevelAfterTicks: 18_000,
        dispatch: "earliest-due-date",
      },
    }, {
      op: "replace",
      path: `/devices/${burnInIndex}/recipes/0/mode`,
      value: "high-throughput-qualified",
    }, {
      op: "replace",
      path: `/devices/${burnInIndex}/recipes/1/mode`,
      value: "high-throughput-qualified",
    }],
  });
  expect(() => compileFactoryProject({
    ...loaded,
    blueprint: applyResearchPatch(project.blueprint, proposal.patch),
  })).not.toThrow();
});

test("memory-fab project provider reaches the measured delivery mismatch after higher-ranked losses are attempted", async () => {
  const root = resolve("examples/memory-fab");
  const current = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output",
  });
  const commissionedBlueprint = migrateArchivedBlueprintForTest(JSON.parse(
    await readFile(resolve(root, "runs/058-simulate/blueprint.json"), "utf8"),
  )) as typeof current.blueprint;
  const loaded = { ...current, blueprint: commissionedBlueprint };
  const blueprint = structuredClone(loaded.blueprint);
  const burnIn = blueprint.devices.find((device) => device.id === "burn-in-1")!;
  burnIn.policy = { ...burnIn.policy, recipeDispatch: "authored-order" };
  const project = compileFactoryProject({ ...loaded, blueprint });
  const result = runUntil(project, undefined, { seed: 42 });
  const metrics = result.metrics;
  const fabLoss = analyzeFabLossProfile(metrics, project.scenario.durationTicks, project, result.events)!;
  expect(fabLoss).toMatchObject({
    version: 5,
    outcome: { deliveryShortfall: 18, deliveryOverflow: 8, portfolioNetValue: -64 },
  });
  expect(fabLoss.buckets.find((bucket) => bucket.id === "delivery-portfolio")).toMatchObject({
    evidence: { underfilledContracts: 2, shortfall: 18, overflow: 8, netValue: -64 },
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
    history: (["q-time", "input-starvation", "yield-quality", "queue-congestion", "maintenance-qualification"] as const)
      .map((addressedLoss, index) => ({
        iteration: index + 1,
        strategy: `evaluated:${addressedLoss}`,
        hypothesis: `The higher-ranked ${addressedLoss} route was already evaluated.`,
        addressedLoss,
        decision: "REVERT" as const,
        score: 0,
        scoreDelta: -1,
      })),
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

test("pre-intervention commissioned evidence exposes the exact Q-time mechanisms", async () => {
  const root = resolve("examples/memory-fab");
  const current = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output",
  });
  const blueprint = migrateArchivedBlueprintForTest(JSON.parse(
    await readFile(resolve(root, "runs/058-simulate/blueprint.json"), "utf8"),
  ));
  const loaded = { ...current, blueprint };
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const metrics = result.metrics;
  const fabLoss = analyzeFabLossProfile(metrics, project.scenario.durationTicks, project, result.events)!;

  expect(fabLoss).toMatchObject({
    version: 5,
    outcome: {
      completed: 5,
      inProgress: 5,
      firstPassYield: 5 / 12,
      deliveryShortfall: 10,
      portfolioNetValue: 144,
      scrapped: 2,
    },
    primary: {
      id: "q-time",
      subjects: [{ kind: "route", id: "dram-front-end" }],
      evidence: { violatedLots: 7, violations: 7 },
      contributors: [{
        id: "dram-front-end:final-inspection:maintenance-qualification",
        mechanism: "maintenance-qualification",
        route: "dram-front-end",
        step: "final-inspection",
        processes: ["inspect-final-pattern-deep"],
        subjects: [
          { kind: "route", id: "dram-front-end" },
          { kind: "device", id: "inspection-1" },
          { kind: "device", id: "maintenance-service-1" },
        ],
        evidence: {
          violations: 5,
          violatedLots: 5,
          totalOverrunTicks: 20_200,
        },
      }, {
        id: "dram-front-end:anneal-dielectric-stack:batch-companion-wait",
        mechanism: "batch-companion-wait",
        route: "dram-front-end",
        step: "anneal-dielectric-stack",
        processes: ["batch-anneal-dielectric-stack"],
        subjects: [
          { kind: "route", id: "dram-front-end" },
          { kind: "device", id: "furnace-1" },
        ],
        evidence: {
          violations: 2,
          violatedLots: 2,
          totalOverrunTicks: 60_600,
        },
      }],
    },
    chain: ["q-time", "yield-quality", "input-starvation", "queue-congestion", "maintenance-qualification"],
  });
  const yieldQuality = fabLoss.buckets.find((bucket) => bucket.id === "yield-quality");
  expect(yieldQuality).toMatchObject({
    subjects: [
      { kind: "device", id: "inspection-1" },
      { kind: "route", id: "dram-front-end" },
      { kind: "project", id: "dram-wafer" },
    ],
    evidence: {
      inspectedLots: 12,
      firstPassCompleted: 5,
      reworkedLots: 7,
      scrapDispositions: 2,
      equipmentDriftedLots: 3,
      equipmentDriftDefects: 3,
      leadingDriftDeviceLots: 2,
      leadingDriftDeviceDefects: 2,
      originContributors: 5,
      subjectIntroducedLots: 5,
      subjectPersistentLots: 4,
      subjectScrappedLots: 2,
    },
  });
  expect(yieldQuality?.contributors[0]).toMatchObject({
    label: "final-inspection",
    mechanism: "route-q-time-defect",
    defects: ["particle-contamination"],
    lots: ["dram-lot-03", "dram-lot-05", "dram-lot-09", "dram-lot-10", "dram-lot-11"],
    evidence: {
      introducedLots: 5,
      detectedLots: 5,
      reworkAttemptedLots: 4,
      persistentLots: 4,
      scrappedLots: 2,
    },
  });
  expect(fabLoss.buckets.find((bucket) => bucket.id === "queue-congestion")).toMatchObject({
    subjects: [{ kind: "device", id: "inspection-1" }],
    evidence: { meanQueueTicks: 24_760, bottleneckUtilization: 0.5525 },
  });
  expect(fabLoss.buckets.find((bucket) => bucket.id === "input-starvation")).toMatchObject({
    subjects: [{ kind: "device", id: "etch-1" }],
    evidence: {
      activeProductiveDevices: 11,
      flowProductiveDevices: 10,
      contributingDevices: 8,
      rawWaitingInputTicks: 1_738_400,
      flowRawWaitingInputTicks: 1_554_400,
      exceptionWaitingInputTicks: 184_000,
      boundaryWaitingInputTicks: 1_186_000,
      opportunityWindowTicks: 1_231_500,
      unavailableGapTicks: 137_100,
      starvationTicks: 368_400,
      subjectStarvationTicks: 49_900,
      subjectUtilization: 0.3416666666666667,
    },
  });
  expect(fabLoss.buckets.some((bucket) => bucket.subjects.some((subject) => subject.id === "rework-1"))).toBeFalse();
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
    blueprint: project.blueprint,
    metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  });
  expect(() => compileFactoryProject({
    ...loaded,
    blueprint: applyResearchPatch(project.blueprint, proposal.patch),
  })).not.toThrow();
  expect(proposal).toMatchObject({
    strategy: "batch-formation:furnace-zero-wait+dual-service",
    addressedLoss: "q-time",
    patch: [
      { op: "remove", path: expect.stringContaining("/recipe") },
      { op: "add", path: expect.stringContaining("/recipes") },
      {
        op: "add",
        path: expect.stringContaining("/policy/batchFormation"),
        value: { preferredProcess: "batch-anneal-dielectric-stack", maximumWaitTicks: 0 },
      },
      {
        op: "replace",
        path: expect.stringContaining("/asset"),
        value: "dual-crew-maintenance-service-bay",
      },
    ],
  });
});

test("current commissioned fab prevents latent etch damage without reintroducing final-inspection Q-time", async () => {
  const root = resolve("examples/memory-fab");
  const loaded = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output",
  });
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const fabLoss = analyzeFabLossProfile(
    result.metrics,
    project.scenario.durationTicks,
    project,
    result.events,
  )!;
  const qTime = fabLoss.buckets.find((bucket) => bucket.id === "q-time");

  expect(fabLoss).toMatchObject({
    version: 5,
    outcome: {
      completed: 12,
      inProgress: 0,
      firstPassYield: 10 / 12,
      deliveryShortfall: 0,
      deliveryOverflow: 46,
      portfolioNetValue: 304,
      scrapped: 0,
    },
  });
  expect(qTime).toBeUndefined();
  expect(fabLoss.buckets.find((bucket) => bucket.id === "yield-quality")).toEqual(expect.objectContaining({
    evidence: expect.objectContaining({
      authoredDefectInstances: 3,
      preventedDefectInstances: 1,
      appliedDefectInstances: 2,
      preventedLots: 1,
    }),
  }));
  expect(project.blueprint.devices.find((device) => device.id === "etch-l2")).toEqual(expect.objectContaining({
    asset: "closed-loop-plasma-etch-bay",
    recipes: [expect.objectContaining({ process: "etch-cell-layer-2", mode: "closed-loop-control" })],
  }));
  expect(project.deviceAssets["closed-loop-plasma-etch-bay"]?.production?.modes).toContainEqual(
    expect.objectContaining({
      id: "particle-suppression",
      durationMultiplier: { numerator: 1, denominator: 1 },
      powerMultiplier: { numerator: 13, denominator: 10 },
      preventsDefects: ["latent-electrical", "particle-contamination"],
    }),
  );
  expect(project.blueprint.devices.find((device) => device.id === "inspection-1")?.asset)
    .toBe("continuous-deep-metrology-cell");
  expect(project.blueprint.devices.find((device) => device.id === "maintenance-service-1")?.asset)
    .toBe("dual-crew-maintenance-service-bay");
});

test("historical commissioned yield evidence reproduces the dedicated etch quality-cell intervention", async () => {
  const root = resolve("examples/memory-fab");
  const current = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output",
  });
  const blueprint = migrateArchivedBlueprintForTest(
    JSON.parse(await readFile(resolve(root, "runs/057-simulate/blueprint.json"), "utf8")),
  );
  const loaded = { ...current, blueprint };
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const metrics = result.metrics;
  const fabLoss = analyzeFabLossProfile(metrics, project.scenario.durationTicks, project, result.events)!;

  expect(fabLoss).toMatchObject({
    version: 5,
    outcome: {
      completed: 6,
      inProgress: 4,
      firstPassYield: 5 / 11,
      deliveryShortfall: 10,
      portfolioNetValue: 144,
      scrapped: 2,
    },
    primary: {
      id: "yield-quality",
      subjects: [
        { kind: "device", id: "etch-1" },
        { kind: "route", id: "dram-front-end" },
        { kind: "project", id: "dram-wafer" },
      ],
      evidence: {
        inspectedLots: 11,
        firstPassCompleted: 5,
        reworkedLots: 5,
        scrapDispositions: 2,
        equipmentDriftedLots: 8,
        equipmentDriftDefects: 8,
        leadingDriftDeviceLots: 6,
        leadingDriftDeviceDefects: 6,
        originContributors: 5,
        subjectIntroducedLots: 4,
        subjectPersistentLots: 4,
        subjectScrappedLots: 2,
      },
    },
    chain: ["yield-quality", "q-time", "queue-congestion", "input-starvation", "batch-formation"],
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
    blueprint: project.blueprint,
    metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [],
  });
  expect(proposal).toMatchObject({
    strategy: "specialize:etch-layer-two-quality-cell",
    addressedLoss: "yield-quality",
  });
  expect(proposal.patch).toHaveLength(7);
  const candidate = compileFactoryProject({
    ...loaded,
    blueprint: applyResearchPatch(blueprint, proposal.patch),
  });
  const candidateMetrics = runUntil(candidate, undefined, { seed: 42 }).metrics;
  expect(candidate.blueprint.devices.some((device) => device.id === "etch-l2")).toBeTrue();
  expect(candidateMetrics.equipmentMaintenance.totalDriftDefects)
    .toBeLessThan(metrics.equipmentMaintenance.totalDriftDefects);
  expect(candidateMetrics.deliveryPortfolio.netValue).toBeGreaterThanOrEqual(metrics.deliveryPortfolio.netValue);
  expect(candidateMetrics.qualityFlow.escapedDefects).toBe(0);
});

test("commissioned provider skips installed CONWIP and proposes explicit layer-two lithography capacity", async () => {
  const root = resolve("examples/memory-fab");
  const current = await loadFactoryProject(root, {
    blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output",
  });
  const blueprint = migrateArchivedBlueprintForTest(
    JSON.parse(await readFile(resolve(root, "runs/056-simulate/blueprint.json"), "utf8")),
  );
  const loaded = { ...current, blueprint };
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed: 42 });
  const metrics = result.metrics;
  const fabLoss = analyzeFabLossProfile(metrics, project.scenario.durationTicks, project, result.events)!;
  const proposal = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose({
    iteration: 2,
    branch: { nodeId: "candidate-1", parentNodeId: "seed", role: "leader", depth: 1, leaderNodeId: "candidate-1" },
    promotionBoundary: {
      leaderNodeId: "candidate-1",
      selectedNodeId: "candidate-1",
      promotable: true,
      aggregate: { leaderScore: 0, selectedScore: 0, scoreDelta: 0 },
      cases: [],
      limitingCase: null,
      guardrail: { kind: "uniform", passed: true, violations: [] },
    },
    project,
    blueprint: project.blueprint,
    metrics,
    fabLoss,
    production: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    history: [{
      iteration: 1,
      strategy: "dispatch:conwip-9-6-edd",
      hypothesis: "The wider release window was already rejected.",
      addressedLoss: "input-starvation",
      decision: "REVERT",
      score: 0,
      scoreDelta: -1,
    }],
  });
  expect(proposal).toMatchObject({
    strategy: "specialize:lithography-layer-two",
    addressedLoss: "queue-congestion",
  });
  expect(proposal.patch).toHaveLength(8);
  expect(proposal.patch).not.toContainEqual(expect.objectContaining({
    value: expect.objectContaining({ maximumWip: 8, reopenAtWip: 5 }),
  }));
  const candidateBlueprint = applyResearchPatch(loaded.blueprint, proposal.patch);
  const candidate = compileFactoryProject({ ...loaded, blueprint: candidateBlueprint });
  const candidateResult = runUntil(candidate, undefined, { seed: 42 });
  const candidateMetrics = candidateResult.metrics;
  expect(candidateMetrics).toMatchObject({
    bottleneckEntity: "etch-1",
    lotFlow: { completed: 6, inProgress: 4, scrapped: 2 },
    deliveryPortfolio: {
      delivered: 40, fulfillment: 0.8, netValue: 144,
      contracts: {
        "commercial-order": { delivered: 22, shortfall: 10 },
        "performance-order": { delivered: 12, shortfall: 0 },
        "automotive-order": { delivered: 6, shortfall: 0 },
      },
    },
  });
  const repair = await new ProjectStrategyResearchAgent(root, "strategies/integrated-dram-proposals.ts").propose({
    iteration: 3,
    branch: { nodeId: "candidate-2", parentNodeId: "seed", role: "alternative", depth: 1, leaderNodeId: "seed" },
    promotionBoundary: {
      leaderNodeId: "seed",
      selectedNodeId: "candidate-2",
      promotable: false,
      aggregate: { leaderScore: -218.698, selectedScore: -212.279, scoreDelta: 6.419 },
      cases: [{
        id: "facility-interruption",
        name: "Timed fab utility interruption",
        leaderScore: -220.665,
        selectedScore: -276.248,
        scoreDelta: -55.583,
        ...scoreBreakdownEvidence(),
        maximumScoreRegression: 0,
        guardrailPassed: false,
      }],
      limitingCase: "facility-interruption",
      guardrail: { kind: "uniform", passed: false, violations: ["facility-interruption"] },
    },
    project: candidate,
    blueprint: candidateBlueprint,
    metrics: candidateMetrics,
    fabLoss: analyzeFabLossProfile(candidateMetrics, candidate.scenario.durationTicks, candidate, candidateResult.events),
    production: analyzeProduction(candidate),
    capacityPlan: planProductionCapacity(candidate),
    history: [{
      iteration: 2,
      strategy: proposal.strategy!,
      hypothesis: proposal.hypothesis,
      addressedLoss: proposal.addressedLoss,
      decision: "KEEP",
      score: -212.279,
      scoreDelta: 6.419,
    }],
  });
  expect(() => compileFactoryProject({
    ...loaded,
    blueprint: applyResearchPatch(candidateBlueprint, repair.patch),
  })).not.toThrow();
  expect(repair).toMatchObject({
    strategy: "facility:utility-n-plus-two",
    addressedCase: "facility-interruption",
    patch: [{
      op: "add",
      path: "/devices/-",
      value: expect.objectContaining({ id: "fab-utility-plant-3", position: { x: 30, y: 22 } }),
    }],
  });
});

test("memory-fab project provider diversifies measured loss targets from immutable history", async () => {
  const { root, loaded, input } = await memoryFabInput();
  const chain = ["q-time", "yield-quality", "queue-congestion", "input-starvation", "batch-formation", "setup-campaign", "maintenance-qualification"] as const;
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
  expect(release).toMatchObject({ strategy: "dispatch:conwip-8-5-edd", addressedLoss: "queue-congestion" });

  const starvation = await agent.propose({ ...guided, iteration: 4, history: [...history, {
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
  expect(starvation).toMatchObject({ strategy: "dispatch:conwip-10-7-edd", addressedLoss: "input-starvation" });

  const batch = await agent.propose({ ...guided, iteration: 5, history: [...history, {
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
    strategy: starvation.strategy!,
    hypothesis: starvation.hypothesis,
    addressedLoss: starvation.addressedLoss,
    decision: "REVERT" as const,
    score: 1,
    scoreDelta: -1,
  }] });
  expect(batch).toMatchObject({
    strategy: "batch-formation:furnace-flex-30000",
    addressedLoss: "batch-formation",
  });
  expect(() => compileFactoryProject({ ...loaded, blueprint: applyResearchPatch(blueprint, batch.patch) })).not.toThrow();

  const campaign = await agent.propose({ ...guided, iteration: 6, history: [...history, {
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
    strategy: starvation.strategy!,
    hypothesis: starvation.hypothesis,
    addressedLoss: starvation.addressedLoss,
    decision: "REVERT" as const,
    score: 1,
    scoreDelta: -1,
  }, {
    iteration: 5,
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
        ...scoreBreakdownEvidence(),
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
        ...scoreBreakdownEvidence(),
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
