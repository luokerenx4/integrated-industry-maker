import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileFactoryProject,
  createBlueprintPatch,
  evaluatePreparedBlueprintBenchmark,
  loadFactoryProject,
  parallelizeWorkCenter,
  prepareBlueprintBenchmark,
  runUntil,
  stableStringify,
  subtractScoreBreakdown,
} from "../../../../packages/inm-core/src/index";
import type {
  Blueprint,
  BlueprintBenchmarkResult,
  BlueprintMetricSnapshot,
  FactoryEvent,
  FactoryMetrics,
  FactoryState,
  ScoreBreakdown,
  ScoreBreakdownComponent,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  strategy: string;
  hypothesis: string;
  blueprint: Blueprint;
}

interface CaseDelta {
  id: string;
  scoreDelta: number;
  scoreBreakdownDelta: ScoreBreakdown;
}

interface ResultRow {
  strategy: string;
  hypothesis: string;
  verdict: "INCUMBENT" | "KEEP" | "REJECT";
  benchmarkAccepted: boolean;
  hardOutcomesPassed: boolean;
  capacityReady: boolean;
  aggregateDeltaFromIncumbent: number;
  minimumCaseDeltaFromIncumbent: number;
  caseDeltasFromIncumbent: CaseDelta[];
  limitingCase: string;
  limitingScoreDrivers: Array<{ component: ScoreBreakdownComponent; delta: number }>;
  lithographyInterruption: ReturnType<typeof summarizeMetrics>;
  patchOperations: number;
  reasons: string[];
  blueprint: Blueprint;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const incumbentBlueprintId = "generated-dram-fab";
const incumbentEvidenceRun = "070-simulate";
const limitingCaseId = "lithography-interruption";

function advancedRecovery(source: Blueprint): Blueprint {
  const blueprint = structuredClone(source);
  const recovery = blueprint.devices.find((device) => device.id === "rework-1");
  if (!recovery?.recipe || recovery.recipe.process !== "rework-final-pattern") {
    throw new Error("advanced recovery research requires the commissioned selective-rework cell");
  }
  recovery.asset = "advanced-pattern-recovery-cell";
  recovery.recipe.process = "recover-final-pattern-advanced";
  recovery.policy = { ...recovery.policy, lotDispatch: "fifo" };
  delete recovery.policy.preventiveMaintenance;
  blueprint.policies.lotRelease = {
    kind: "conwip",
    maximumWip: 6,
    reopenAtWip: 3,
    dispatch: "earliest-due-date",
    serviceLevelAfterTicks: 18_000,
  };
  return blueprint;
}

function burnInDispatch(
  source: Blueprint,
  recipeDispatch: "contract-value" | "shortest-cycle" | "authored-order",
): Blueprint {
  const blueprint = structuredClone(source);
  const burnIn = blueprint.devices.find((device) => device.id === "burn-in-1");
  if (!burnIn?.recipes) throw new Error("back-end research requires burn-in-1");
  burnIn.policy = { ...burnIn.policy, recipeDispatch };
  return blueprint;
}

function burnInMode(
  source: Blueprint,
  processes: string[],
  mode = "high-throughput-qualified",
): Blueprint {
  const blueprint = structuredClone(source);
  const burnIn = blueprint.devices.find((device) => device.id === "burn-in-1");
  if (!burnIn?.recipes) throw new Error("back-end research requires burn-in-1");
  const selected = new Set(processes);
  for (const recipe of burnIn.recipes) if (selected.has(recipe.process)) recipe.mode = mode;
  return blueprint;
}

function summarizeMetrics(metrics: BlueprintMetricSnapshot) {
  return {
    score: metrics.score,
    scoreBreakdown: metrics.scoreBreakdown,
    deliveryNetValuePerMinute: metrics.deliveryNetValuePerMinute,
    contractFulfillment: metrics.contractFulfillment,
    deliveryOverflow: metrics.deliveryOverflow,
    completedLots: metrics.completedLots,
    onTimeLots: metrics.onTimeLots,
    scrappedLots: metrics.scrappedLots,
    averageWip: metrics.averageWip,
    meanCycleTimeTicks: metrics.meanCycleTimeTicks,
    meanTardinessTicks: metrics.meanTardinessTicks,
    energyConsumedMilliJoules: metrics.energyConsumedMilliJoules,
    totalBuildCost: metrics.totalBuildCost,
    occupiedArea: metrics.occupiedArea,
    infeasibleReason: metrics.infeasibleReason,
  };
}

function scoreDrivers(delta: ScoreBreakdown, maximum = 5) {
  return (Object.entries(delta) as Array<[ScoreBreakdownComponent, number]>)
    .filter(([, value]) => Math.abs(value) > 1e-9)
    .sort(([leftComponent, left], [rightComponent, right]) =>
      Math.abs(right) - Math.abs(left) || leftComponent.localeCompare(rightComponent))
    .slice(0, maximum)
    .map(([component, value]) => ({ component, delta: value }));
}

function recoveredOutputTrace(
  incumbentEvents: FactoryEvent[],
  candidateEvents: FactoryEvent[],
  durationTicks: number,
  incumbentResult: { metrics: FactoryMetrics; state: FactoryState },
  candidateResult: { metrics: FactoryMetrics; state: FactoryState },
) {
  const incumbentCompleted = new Set(incumbentEvents
    .filter((event): event is Extract<FactoryEvent, { type: "lot.completed" }> => event.type === "lot.completed")
    .map((event) => event.lot));
  const candidateCompleted = candidateEvents
    .filter((event): event is Extract<FactoryEvent, { type: "lot.completed" }> => event.type === "lot.completed");
  const additionalCompletedLots = candidateCompleted
    .filter((event) => !incumbentCompleted.has(event.lot))
    .map((event) => event.lot);
  const additionalSet = new Set(additionalCompletedLots);
  const lotEvents = candidateEvents.filter((event) =>
    ("lot" in event && additionalSet.has(event.lot))
    || ("lotIds" in event && event.lotIds?.some((lot) => additionalSet.has(lot))));
  const probeCompletions = candidateCompleted.filter((event) => additionalSet.has(event.lot));
  const firstProbeCompletionTick = Math.min(...probeCompletions.map((event) => event.tick));
  const backEndEvents = candidateEvents.filter((event) => event.tick >= firstProbeCompletionTick && (
    (event.type === "device.start" && ["packaging-1", "burn-in-1", "burn-in-2"].includes(event.device))
    || (event.type === "device.finish" && ["packaging-1", "burn-in-1", "burn-in-2"].includes(event.device))
    || (event.type === "resource.arrive"
      && ["commercial-to-customer", "performance-to-customer", "automotive-to-customer"].includes(event.connection))
  ));
  const resources = [
    "known-good-dram-die",
    "packaged-dram-device",
    "commercial-dram-device",
    "performance-dram-device",
    "automotive-dram-device",
  ];
  const devices = ["probe-1", "packaging-1", "burn-in-1", "commercial-customer", "performance-customer", "automotive-customer"];
  const snapshot = (result: { metrics: FactoryMetrics; state: FactoryState }) => ({
    deliveryPortfolio: result.metrics.deliveryPortfolio,
    produced: Object.fromEntries(resources.map((resource) => [resource, result.metrics.produced[resource] ?? 0])),
    buffers: Object.fromEntries(devices.map((device) => [
      device,
      result.state.devices[device]?.buffers ?? null,
    ])),
    customerTransports: Object.fromEntries(
      ["commercial-to-customer", "performance-to-customer", "automotive-to-customer"].map((connection) => [
        connection,
        result.state.transports[connection] ?? [],
      ]),
    ),
  });
  const backEndTimeline = (events: FactoryEvent[]) => events.filter((event) =>
    (["device.start", "device.finish", "device.changeover-start", "device.changeover-finish"].includes(event.type)
      && "device" in event && ["packaging-1", "burn-in-1"].includes(event.device))
    || (event.type === "resource.arrive" && event.connection === "packaging-to-burn-in"));
  return {
    durationTicks,
    additionalCompletedLots,
    probeCompletions,
    remainingTicksAfterFirstProbeCompletion: durationTicks - firstProbeCompletionTick,
    lotEvents,
    backEndEvents,
    incumbent: snapshot(incumbentResult),
    candidate: snapshot(candidateResult),
    incumbentBackEndTimeline: backEndTimeline(incumbentEvents),
    candidateBackEndTimeline: backEndTimeline(candidateEvents),
  };
}

async function simulateLimitingCase(blueprint: Blueprint) {
  const benchmarkCase = prepared.manifest.cases.find((item) => item.id === limitingCaseId);
  if (!benchmarkCase) throw new Error(`Benchmark '${benchmarkId}' is missing '${limitingCaseId}'`);
  const loaded = await loadFactoryProject(projectDir, {
    blueprint: incumbentBlueprintId,
    world: benchmarkCase.world,
    scenario: benchmarkCase.scenario,
    objective: benchmarkCase.objective,
  });
  const project = compileFactoryProject({ ...loaded, blueprint });
  return {
    project,
    result: runUntil(project, undefined, { seed: benchmarkCase.seed }),
  };
}

function currentBestDecision(
  strategy: string,
  evaluation: BlueprintBenchmarkResult,
  caseDeltas: CaseDelta[],
  aggregateDelta: number,
): { verdict: ResultRow["verdict"]; reasons: string[] } {
  if (strategy === "incumbent") return { verdict: "INCUMBENT", reasons: [] };
  const hardOutcomesPassed = evaluation.outcomeGuardrails?.every((guardrail) => guardrail.passed) ?? true;
  const capacityReady = evaluation.cases.every((item) => item.candidateCapacityReady);
  const minimumCaseDelta = Math.min(...caseDeltas.map((item) => item.scoreDelta));
  const reasons = [
    ...evaluation.reasons,
    ...(aggregateDelta <= 1e-9 ? [`aggregate delta ${aggregateDelta.toFixed(6)} does not improve the incumbent`] : []),
    ...(minimumCaseDelta < -1e-9
      ? [`current-best case regression ${minimumCaseDelta.toFixed(6)} is below zero`] : []),
    ...(!hardOutcomesPassed ? ["one or more hard industrial outcomes failed"] : []),
    ...(!capacityReady ? ["one or more locked cases is not capacity READY"] : []),
  ];
  return {
    verdict: evaluation.accepted && hardOutcomesPassed && capacityReady
      && aggregateDelta > 1e-9 && minimumCaseDelta >= -1e-9
      ? "KEEP"
      : "REJECT",
    reasons,
  };
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const source = await loadFactoryProject(projectDir, { blueprint: incumbentBlueprintId });
const incumbentBlueprint = JSON.parse(await readFile(
  resolve(projectDir, "runs", incumbentEvidenceRun, "blueprint.json"),
  "utf8",
)) as Blueprint;
const incumbentProject = compileFactoryProject({ ...source, blueprint: incumbentBlueprint });
const incumbent = await evaluatePreparedBlueprintBenchmark(prepared, {
  candidateBlueprint: incumbentProject.blueprint,
  evaluationId: "recovery-delivery-incumbent",
});
const recoveryBlueprint = advancedRecovery(incumbentProject.blueprint);
const incumbentAcceleratedBurnIn = burnInMode(incumbentProject.blueprint, [
  "screen-commercial-dram",
  "screen-performance-mix",
]);
const recoveryCommercialAccelerated = burnInMode(recoveryBlueprint, ["screen-commercial-dram"]);
const recoveryAcceleratedBurnIn = burnInMode(recoveryBlueprint, [
  "screen-commercial-dram",
  "screen-performance-mix",
]);
const recoverySimulation = await simulateLimitingCase(recoveryBlueprint);

const parallelBurnIn = parallelizeWorkCenter(recoverySimulation.project, recoveryBlueprint, {
  device: "burn-in-1",
  cloneId: "burn-in-2",
});
const parallelProbe = parallelizeWorkCenter(recoverySimulation.project, recoveryBlueprint, {
  device: "probe-1",
  cloneId: "probe-2",
});
if (!parallelBurnIn) throw new Error("could not construct an explicit parallel burn-in topology");
if (!parallelProbe) throw new Error("could not construct an explicit parallel Probe topology");

const parallelProbeProject = compileFactoryProject({
  ...recoverySimulation.project,
  blueprint: parallelProbe.blueprint,
});
const parallelProbeAndBurnIn = parallelizeWorkCenter(parallelProbeProject, parallelProbe.blueprint, {
  device: "burn-in-1",
  cloneId: "burn-in-2",
});

const variants: Variant[] = [
  {
    strategy: "incumbent",
    hypothesis: "Record the exact commissioned factory as the current-best authority.",
    blueprint: incumbentProject.blueprint,
  },
  {
    strategy: "recovery:advanced+conwip-6-3-delay-18",
    hypothesis: "Record the exact WIP-led advanced-recovery branch before adding downstream capacity.",
    blueprint: recoveryBlueprint,
  },
  {
    strategy: "mode:incumbent+high-throughput-burn-in-control",
    hypothesis: "Accelerate the commissioned back end without recovery changes to measure how much delivery belongs to mode capacity alone.",
    blueprint: incumbentAcceleratedBurnIn,
  },
  {
    strategy: "mode:advanced+commercial-high-throughput",
    hypothesis: "Accelerate only short commercial screening to test whether the recovered tail can clear without changing reliability qualification.",
    blueprint: recoveryCommercialAccelerated,
  },
  {
    strategy: "mode:advanced+all-burn-in-high-throughput",
    hypothesis: "Run both qualified screening recipes at two-thirds duration and 150% active power so the same physical rack can convert the recovered eight-device batch.",
    blueprint: recoveryAcceleratedBurnIn,
  },
  {
    strategy: "dispatch:advanced+burn-in-shortest-cycle",
    hypothesis: "Prefer the shortest qualified final-test batch so late recovered dies can still finish inside the fixed interruption window.",
    blueprint: burnInDispatch(recoveryBlueprint, "shortest-cycle"),
  },
  {
    strategy: "dispatch:advanced+burn-in-authored-order",
    hypothesis: "Use authored commercial-first final-test order as a bounded diagnostic for late-tail batch conversion.",
    blueprint: burnInDispatch(recoveryBlueprint, "authored-order"),
  },
  {
    strategy: "capacity:advanced+parallel-burn-in",
    hypothesis: "Purchase and route a second independent final-test rack so the recovered eight-die batch need not wait behind the incumbent contract mix.",
    blueprint: parallelBurnIn.blueprint,
  },
  {
    strategy: "capacity:advanced+parallel-probe",
    hypothesis: "Purchase and route a second Probe cell to expose whether earlier lot termination gives the existing packaging and final-test chain enough horizon.",
    blueprint: parallelProbe.blueprint,
  },
  ...(parallelProbeAndBurnIn ? [{
    strategy: "capacity:advanced+parallel-probe+parallel-burn-in",
    hypothesis: "Purchase explicit Probe and final-test parallelism around the existing packaging cell to bound both sides of the recovered-output tail.",
    blueprint: parallelProbeAndBurnIn.blueprint,
  }] : []),
];

const incumbentLimitingCase = await simulateLimitingCase(incumbentProject.blueprint);
const trace = recoveredOutputTrace(
  incumbentLimitingCase.result.events,
  recoverySimulation.result.events,
  recoverySimulation.project.scenario.durationTicks,
  incumbentLimitingCase.result,
  recoverySimulation.result,
);
const rows: ResultRow[] = [];

for (const variant of variants) {
  const evaluation = variant.strategy === "incumbent"
    ? incumbent
    : await evaluatePreparedBlueprintBenchmark(prepared, {
      candidateBlueprint: variant.blueprint,
      evaluationId: `recovery-delivery-${variant.strategy}`,
    });
  const caseDeltasFromIncumbent = evaluation.cases.map((item): CaseDelta => {
    const current = incumbent.cases.find((candidate) => candidate.id === item.id);
    if (!current) throw new Error(`incumbent evidence is missing case '${item.id}'`);
    return {
      id: item.id,
      scoreDelta: item.candidateScore - current.candidateScore,
      scoreBreakdownDelta: subtractScoreBreakdown(
        current.candidateMetrics.scoreBreakdown,
        item.candidateMetrics.scoreBreakdown,
      ),
    };
  });
  const aggregateDeltaFromIncumbent = evaluation.candidateScore - incumbent.candidateScore;
  const minimumCaseDeltaFromIncumbent = Math.min(...caseDeltasFromIncumbent.map((item) => item.scoreDelta));
  const limitingCase = caseDeltasFromIncumbent.reduce((minimum, item) =>
    item.scoreDelta < minimum.scoreDelta ? item : minimum);
  const interruption = evaluation.cases.find((item) => item.id === limitingCaseId);
  if (!interruption) throw new Error(`evaluation is missing '${limitingCaseId}'`);
  const decision = currentBestDecision(
    variant.strategy,
    evaluation,
    caseDeltasFromIncumbent,
    aggregateDeltaFromIncumbent,
  );
  rows.push({
    strategy: variant.strategy,
    hypothesis: variant.hypothesis,
    verdict: decision.verdict,
    benchmarkAccepted: evaluation.accepted,
    hardOutcomesPassed: evaluation.outcomeGuardrails?.every((guardrail) => guardrail.passed) ?? true,
    capacityReady: evaluation.cases.every((item) => item.candidateCapacityReady),
    aggregateDeltaFromIncumbent,
    minimumCaseDeltaFromIncumbent,
    caseDeltasFromIncumbent,
    limitingCase: limitingCase.id,
    limitingScoreDrivers: scoreDrivers(limitingCase.scoreBreakdownDelta),
    lithographyInterruption: summarizeMetrics(interruption.candidateMetrics),
    patchOperations: createBlueprintPatch(incumbentProject.blueprint, variant.blueprint).length,
    reasons: decision.reasons,
    blueprint: variant.blueprint,
  });
}

rows.sort((left, right) =>
  Number(right.verdict === "KEEP") - Number(left.verdict === "KEEP")
  || Number(right.verdict === "INCUMBENT") - Number(left.verdict === "INCUMBENT")
  || right.minimumCaseDeltaFromIncumbent - left.minimumCaseDeltaFromIncumbent
  || right.aggregateDeltaFromIncumbent - left.aggregateDeltaFromIncumbent
  || left.strategy.localeCompare(right.strategy));

const report = {
  benchmark: benchmarkId,
  incumbent: {
    blueprint: incumbentBlueprintId,
    evidenceRun: incumbentEvidenceRun,
    blueprintHash: incumbent.candidateBlueprintHash,
    aggregateScore: incumbent.candidateScore,
  },
  authority: {
    requireBenchmarkAcceptance: true,
    requireAllOutcomeGuardrails: true,
    requireCapacityReady: true,
    minimumAggregateDeltaFromIncumbent: 0,
    maximumCaseRegressionFromIncumbent: 0,
  },
  excluded: [
    ...(!parallelProbeAndBurnIn ? [{
      strategy: "capacity:advanced+parallel-probe+parallel-burn-in",
      reason: "no non-overlapping project-local junction and lane topology could be routed",
    }] : []),
  ],
  trace,
  rows,
};

if (Bun.argv.includes("--json")) {
  process.stdout.write(`${stableStringify(report, 2)}\n`);
} else {
  console.log(`# recovered-output delivery search · current=${incumbent.candidateScore.toFixed(6)} · ${rows.length} explicit variants`);
  console.log(`trace\tadditional lots ${trace.additionalCompletedLots.join(",") || "none"}\tremaining after Probe ${(trace.remainingTicksAfterFirstProbeCompletion / 1000).toFixed(3)}s\tback-end events ${trace.backEndEvents.length}`);
  console.log("verdict\tstrategy\taggregate-delta\tminimum-case-delta\tlimiting-case\tleading-score-drivers\tlith-value/min\tlith-completed/on-time\tlith-scrap\tlith-wip\tcost\tarea\tpatch\treasons");
  for (const row of rows) console.log([
    row.verdict,
    row.strategy,
    row.aggregateDeltaFromIncumbent.toFixed(6),
    row.minimumCaseDeltaFromIncumbent.toFixed(6),
    row.limitingCase,
    row.limitingScoreDrivers.map((item) => `${item.component}:${item.delta.toFixed(6)}`).join(","),
    row.lithographyInterruption.deliveryNetValuePerMinute.toFixed(3),
    `${row.lithographyInterruption.completedLots}/${row.lithographyInterruption.onTimeLots}`,
    row.lithographyInterruption.scrappedLots,
    row.lithographyInterruption.averageWip.toFixed(3),
    row.lithographyInterruption.totalBuildCost,
    row.lithographyInterruption.occupiedArea,
    row.patchOperations,
    row.reasons.join(" | ") || "none",
  ].join("\t"));
}
