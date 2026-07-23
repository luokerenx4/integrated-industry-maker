import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  analyzeFabLossProfile,
  compileFactoryProject,
  loadFactoryProject,
  planProductionCapacity,
  runUntil,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type { Blueprint, FabLossContributor, FactoryMetrics } from "../../../../packages/inm-core/src/index";

interface BenchmarkCase {
  id: string;
  world: string;
  scenario: string;
  objective: string;
  seed: number;
  weight: number;
}

interface BenchmarkDefinition {
  cases: BenchmarkCase[];
}

type FurnacePolicy =
  | { kind: "batch-only" }
  | { kind: "rapid-only" }
  | { kind: "flex"; maximumWaitTicks: number };

interface Variant {
  strategy: string;
  furnace: FurnacePolicy;
  service: "single-crew" | "dual-crew";
  inspectionMaintenanceJobs: number | null;
  inspectionPowerPriority: number | null;
  lithographyMaintenanceJobs: number | null;
  blueprint: Blueprint;
}

interface CaseResult {
  id: string;
  score: number;
  capacityReady: boolean;
  metrics: FactoryMetrics;
  contributors: FabLossContributor[];
}

interface ResultRow {
  strategy: string;
  furnace: string;
  service: Variant["service"];
  inspectionMaintenanceJobs: number | null;
  inspectionPowerPriority: number | null;
  lithographyMaintenanceJobs: number | null;
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  guardrailPassed: boolean;
  commissionedFloorsPassed: boolean;
  qTimeReduced: boolean;
  caseDeltas: number[];
  cases: CaseResult[];
  blueprint: Blueprint;
}

const projectDir = resolve(import.meta.dir, "../..");
const definition = JSON.parse(
  await readFile(join(projectDir, "benchmarks/greenfield-dram-design.benchmark.json"), "utf8"),
) as BenchmarkDefinition;
const incumbentBlueprintSelection = "generated-dram-fab";
const incumbentRun = "058-simulate";
const incumbentBlueprint = JSON.parse(
  await readFile(join(projectDir, "runs", incumbentRun, "blueprint.json"), "utf8"),
) as Blueprint;
const totalWeight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (values: number[]) =>
  values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / totalWeight;

function withFurnacePolicy(blueprint: Blueprint, policy: FurnacePolicy): Blueprint {
  const candidate = structuredClone(blueprint);
  const furnace = candidate.devices.find((device) => device.id === "furnace-1");
  if (!furnace?.recipe) throw new Error("commissioned Q-time research requires furnace-1 with one configured recipe");
  const recipe = structuredClone(furnace.recipe);
  furnace.policy = { ...furnace.policy };
  delete furnace.policy.batchFormation;
  delete furnace.recipes;
  if (policy.kind === "batch-only") return candidate;
  if (policy.kind === "rapid-only") {
    recipe.process = "rapid-anneal-dielectric-stack";
    furnace.recipe = recipe;
    return candidate;
  }
  delete furnace.recipe;
  furnace.recipes = [
    recipe,
    { ...structuredClone(recipe), process: "rapid-anneal-dielectric-stack" },
  ];
  furnace.policy.batchFormation = {
    preferredProcess: "batch-anneal-dielectric-stack",
    maximumWaitTicks: policy.maximumWaitTicks,
  };
  return candidate;
}

function withServiceCapacity(blueprint: Blueprint, service: Variant["service"]): Blueprint {
  const candidate = structuredClone(blueprint);
  const provider = candidate.devices.find((device) => device.id === "maintenance-service-1");
  if (!provider) throw new Error("commissioned Q-time research requires maintenance-service-1");
  provider.asset = service === "dual-crew"
    ? "dual-crew-maintenance-service-bay"
    : "maintenance-service-bay";
  return candidate;
}

function withInspectionMaintenance(blueprint: Blueprint, minimumJobs: number | null): Blueprint {
  const candidate = structuredClone(blueprint);
  const inspection = candidate.devices.find((device) => device.id === "inspection-1");
  if (!inspection) throw new Error("commissioned Q-time research requires inspection-1");
  inspection.policy = { ...inspection.policy };
  if (minimumJobs === null) delete inspection.policy.preventiveMaintenance;
  else inspection.policy.preventiveMaintenance = { minimumJobs };
  return candidate;
}

function withInspectionPowerPriority(blueprint: Blueprint, priority: number | null): Blueprint {
  const candidate = structuredClone(blueprint);
  if (priority === null) return candidate;
  const inspection = candidate.devices.find((device) => device.id === "inspection-1");
  if (!inspection) throw new Error("commissioned Q-time research requires inspection-1");
  inspection.policy = { ...inspection.policy, powerPriority: priority };
  return candidate;
}

function withLithographyMaintenance(blueprint: Blueprint, minimumJobs: number | null): Blueprint {
  const candidate = structuredClone(blueprint);
  if (minimumJobs === null) return candidate;
  for (const id of ["lithography-1", "lithography-l2"]) {
    const device = candidate.devices.find((item) => item.id === id);
    if (!device) throw new Error(`commissioned Q-time research requires ${id}`);
    device.policy = { ...device.policy, preventiveMaintenance: { minimumJobs } };
  }
  return candidate;
}

async function simulate(blueprint: Blueprint): Promise<CaseResult[]> {
  return Promise.all(definition.cases.map(async (item) => {
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: incumbentBlueprintSelection,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const project = compileFactoryProject({ ...loaded, blueprint });
    const result = runUntil(project, undefined, { seed: item.seed });
    const profile = analyzeFabLossProfile(result.metrics, project.scenario.durationTicks, project, result.events);
    return {
      id: item.id,
      score: result.metrics.finalScore,
      capacityReady: planProductionCapacity(project).ready,
      metrics: result.metrics,
      contributors: profile?.buckets.find((bucket) => bucket.id === "q-time")?.contributors ?? [],
    };
  }));
}

const incumbentSource = await loadFactoryProject(projectDir, {
  blueprint: incumbentBlueprintSelection,
  world: definition.cases[0]!.world,
  scenario: definition.cases[0]!.scenario,
  objective: definition.cases[0]!.objective,
});
const incumbent = compileFactoryProject({ ...incumbentSource, blueprint: incumbentBlueprint });
const incumbentCases = await simulate(incumbentBlueprint);
const incumbentScores = incumbentCases.map((item) => item.score);
const incumbentAggregate = weightedMean(incumbentScores);
const furnacePolicies: FurnacePolicy[] = [
  { kind: "batch-only" },
  { kind: "rapid-only" },
  ...[0, 5_000, 10_000, 15_000, 20_000].map((maximumWaitTicks): FurnacePolicy =>
    ({ kind: "flex", maximumWaitTicks })),
];
const variants: Variant[] = [];

for (const furnace of furnacePolicies) {
  for (const service of ["single-crew", "dual-crew"] as const) {
    const maintenanceThresholds = furnace.kind === "batch-only" ? [null, 3, 4] : [null];
    for (const inspectionMaintenanceJobs of maintenanceThresholds) {
      const furnaceLabel = furnace.kind === "flex" ? `flex-${furnace.maximumWaitTicks}` : furnace.kind;
      const maintenanceLabel = inspectionMaintenanceJobs === null
        ? "inspection-mandatory"
        : `inspection-jobs-${inspectionMaintenanceJobs}`;
      variants.push({
        strategy: `qtime:${furnaceLabel}+${service}+${maintenanceLabel}`,
        furnace,
        service,
        inspectionMaintenanceJobs,
        inspectionPowerPriority: null,
        lithographyMaintenanceJobs: null,
        blueprint: withInspectionMaintenance(
          withServiceCapacity(withFurnacePolicy(incumbent.blueprint, furnace), service),
          inspectionMaintenanceJobs,
        ),
      });
    }
  }
}
for (const inspectionMaintenanceJobs of [null, 4]) {
  variants.push({
    strategy: `qtime:batch-only+single-crew+${inspectionMaintenanceJobs === null ? "inspection-mandatory" : "inspection-jobs-4"}+inspection-priority-11`,
    furnace: { kind: "batch-only" },
    service: "single-crew",
    inspectionMaintenanceJobs,
    inspectionPowerPriority: 11,
    lithographyMaintenanceJobs: null,
    blueprint: withInspectionPowerPriority(
      withInspectionMaintenance(
        withServiceCapacity(withFurnacePolicy(incumbent.blueprint, { kind: "batch-only" }), "single-crew"),
        inspectionMaintenanceJobs,
      ),
      11,
    ),
  });
}
for (const configuration of [
  { furnace: { kind: "batch-only" } as FurnacePolicy, service: "dual-crew" as const },
  { furnace: { kind: "rapid-only" } as FurnacePolicy, service: "single-crew" as const },
  { furnace: { kind: "rapid-only" } as FurnacePolicy, service: "dual-crew" as const },
]) {
  const furnaceLabel = configuration.furnace.kind;
  variants.push({
    strategy: `qtime:${furnaceLabel}+${configuration.service}+inspection-mandatory+lithography-jobs-5`,
    furnace: configuration.furnace,
    service: configuration.service,
    inspectionMaintenanceJobs: null,
    inspectionPowerPriority: null,
    lithographyMaintenanceJobs: 5,
    blueprint: withLithographyMaintenance(
      withInspectionMaintenance(
        withServiceCapacity(withFurnacePolicy(incumbent.blueprint, configuration.furnace), configuration.service),
        null,
      ),
      5,
    ),
  });
}

const rows: ResultRow[] = [];
for (const variant of variants) {
  const cases = await simulate(variant.blueprint);
  const scores = cases.map((item) => item.score);
  const caseDeltas = scores.map((score, index) => score - incumbentScores[index]!);
  const mixed = cases.find((item) => item.id === "mixed-quality")!;
  const incumbentMixed = incumbentCases.find((item) => item.id === "mixed-quality")!;
  const mixedContracts = mixed.metrics.deliveryPortfolio.contracts;
  const commissionedFloorsPassed =
    (mixedContracts["commercial-order"]?.delivered ?? 0) >= 27
    && (mixedContracts["performance-order"]?.delivered ?? 0) >= 12
    && (mixedContracts["automotive-order"]?.delivered ?? 0) >= 6
    && mixed.metrics.deliveryPortfolio.netValue >= 164
    && mixed.metrics.lotFlow.completed >= incumbentMixed.metrics.lotFlow.completed
    && mixed.metrics.qualityFlow.firstPassCompleted >= incumbentMixed.metrics.qualityFlow.firstPassCompleted
    && mixed.metrics.qualityFlow.firstPassYield >= incumbentMixed.metrics.qualityFlow.firstPassYield - 1e-9
    && mixed.metrics.qualityFlow.totalReworkCycles <= incumbentMixed.metrics.qualityFlow.totalReworkCycles
    && mixed.metrics.equipmentMaintenance.totalDriftDefects
      <= incumbentMixed.metrics.equipmentMaintenance.totalDriftDefects
    && mixed.metrics.qualityFlow.escapedDefects === 0;
  const qTimeReduced = mixed.metrics.routeFlow["dram-front-end"]!.queueTimeViolations
    < incumbentMixed.metrics.routeFlow["dram-front-end"]!.queueTimeViolations;
  rows.push({
    strategy: variant.strategy,
    furnace: variant.furnace.kind === "flex"
      ? `flex-${variant.furnace.maximumWaitTicks}`
      : variant.furnace.kind,
    service: variant.service,
    inspectionMaintenanceJobs: variant.inspectionMaintenanceJobs,
    inspectionPowerPriority: variant.inspectionPowerPriority,
    lithographyMaintenanceJobs: variant.lithographyMaintenanceJobs,
    aggregateScore: weightedMean(scores),
    aggregateDelta: weightedMean(scores) - incumbentAggregate,
    minimumCaseDelta: Math.min(...caseDeltas),
    guardrailPassed: caseDeltas.every((delta) => delta >= -1e-9)
      && cases.every((item) => item.capacityReady),
    commissionedFloorsPassed,
    qTimeReduced,
    caseDeltas,
    cases,
    blueprint: variant.blueprint,
  });
}

rows.sort((left, right) =>
  Number(right.guardrailPassed && right.commissionedFloorsPassed && right.qTimeReduced)
    - Number(left.guardrailPassed && left.commissionedFloorsPassed && left.qTimeReduced)
  || Number(right.guardrailPassed) - Number(left.guardrailPassed)
  || Number(right.commissionedFloorsPassed) - Number(left.commissionedFloorsPassed)
  || right.aggregateDelta - left.aggregateDelta
  || right.minimumCaseDelta - left.minimumCaseDelta
  || left.strategy.localeCompare(right.strategy));

const report = {
  incumbent: {
    blueprint: incumbentBlueprintSelection,
    sourceRun: incumbentRun,
    aggregateScore: incumbentAggregate,
    caseScores: incumbentScores,
  },
  guardrail: { maximumCaseScoreRegression: 0, requireCapacityReady: true },
  cases: definition.cases.map((item) => item.id),
  rows: rows.map((row) => ({
    strategy: row.strategy,
    furnace: row.furnace,
    service: row.service,
    inspectionMaintenanceJobs: row.inspectionMaintenanceJobs,
    inspectionPowerPriority: row.inspectionPowerPriority,
    lithographyMaintenanceJobs: row.lithographyMaintenanceJobs,
    verdict: row.guardrailPassed && row.commissionedFloorsPassed && row.qTimeReduced && row.aggregateDelta > 1e-9
      ? "KEEP"
      : "REJECT",
    aggregateScore: row.aggregateScore,
    aggregateDelta: row.aggregateDelta,
    minimumCaseDelta: row.minimumCaseDelta,
    caseDeltas: row.caseDeltas,
    capacityReady: row.cases.every((item) => item.capacityReady),
    commissionedFloorsPassed: row.commissionedFloorsPassed,
    qTimeReduced: row.qTimeReduced,
    mixedQuality: (() => {
      const mixed = row.cases.find((item) => item.id === "mixed-quality")!;
      return {
        qTimeViolations: mixed.metrics.routeFlow["dram-front-end"]!.queueTimeViolations,
        violatedLots: mixed.metrics.routeFlow["dram-front-end"]!.violatedLots,
        contributors: mixed.contributors,
        completed: mixed.metrics.lotFlow.completed,
        firstPassCompleted: mixed.metrics.qualityFlow.firstPassCompleted,
        firstPassYield: mixed.metrics.qualityFlow.firstPassYield,
        rework: mixed.metrics.qualityFlow.totalReworkCycles,
        scrap: mixed.metrics.qualityFlow.scrapDispositions,
        qualityEscapes: mixed.metrics.qualityFlow.escapedDefects,
        driftDefects: mixed.metrics.equipmentMaintenance.totalDriftDefects,
        portfolioNetValue: mixed.metrics.deliveryPortfolio.netValue,
        buildCost: mixed.metrics.totalBuildCost,
        occupiedArea: mixed.metrics.occupiedArea,
      };
    })(),
  })),
};

if (Bun.argv.includes("--json")) {
  process.stdout.write(`${stableStringify(report, 2)}\n`);
} else {
  console.log(`# commissioned Q-time search · incumbent aggregate=${incumbentAggregate.toFixed(6)} · ${rows.length} batch/service variants · zero-regression five-case gate + causal commissioned delivery/quality floors`);
  console.log("verdict\tstrategy\taggregate-delta\tminimum-case-delta\tcase-deltas\tcommissioned-floors\tqtime-reduced\tmixed-qtime\tmixed-lots\tmixed-contributors\tmixed-completed\tmixed-first-pass\tmixed-fpy\tmixed-rework\tmixed-scrap\tmixed-escapes\tmixed-drift\tmixed-net-value\tcost\tarea");
  for (const row of report.rows) console.log([
    row.verdict,
    row.strategy,
    row.aggregateDelta.toFixed(6),
    row.minimumCaseDelta.toFixed(6),
    row.caseDeltas.map((value) => value.toFixed(3)).join(","),
    row.commissionedFloorsPassed ? "PASS" : "FAIL",
    row.qTimeReduced ? "YES" : "NO",
    row.mixedQuality.qTimeViolations,
    row.mixedQuality.violatedLots,
    row.mixedQuality.contributors.map((contributor) =>
      `${contributor.step}:${contributor.mechanism}:${contributor.evidence.violations}`).join(",") || "none",
    row.mixedQuality.completed,
    row.mixedQuality.firstPassCompleted,
    row.mixedQuality.firstPassYield.toFixed(3),
    row.mixedQuality.rework,
    row.mixedQuality.scrap,
    row.mixedQuality.qualityEscapes,
    row.mixedQuality.driftDefects,
    row.mixedQuality.portfolioNetValue.toFixed(3),
    row.mixedQuality.buildCost,
    row.mixedQuality.occupiedArea,
  ].join("\t"));
}
