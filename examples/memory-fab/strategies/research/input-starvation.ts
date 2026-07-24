import { resolve } from "node:path";
import {
  analyzeFabLossProfile,
  compileFactoryProject,
  evaluateFactoryBlueprint,
  hashValue,
  loadFactoryProject,
  prepareBlueprintBenchmark,
  runUntil,
  stableStringify,
  subtractScoreBreakdown,
} from "../../../../packages/inm-core/src/index";
import type {
  Blueprint,
  BlueprintMetricSnapshot,
  CompiledFactoryProject,
  DeviceAsset,
  FabLossProfile,
  LoadedFactoryProject,
  ScoreBreakdown,
} from "../../../../packages/inm-core/src/index";

interface AssetTechnologyEnvelope {
  kind: "asset";
  id: string;
  name: string;
  speed: { numerator: number; denominator: number };
  power: { idleMilliWatts: number; activeMilliWatts: number };
  buildCost: number;
}

interface ModeTechnologyEnvelope {
  kind: "mode";
  id: string;
  name: string;
  durationMultiplier: { numerator: number; denominator: number };
  powerMultiplier: { numerator: number; denominator: number };
}

type TechnologyEnvelope = AssetTechnologyEnvelope | ModeTechnologyEnvelope;

interface Variant {
  id: string;
  technology: TechnologyEnvelope | null;
}

interface CaseResult {
  id: string;
  weight: number;
  score: number;
  baselineScore: number;
  baselineDelta: number;
  capacityReady: boolean;
  metrics: BlueprintMetricSnapshot;
}

interface ResultRow {
  id: string;
  technology: TechnologyEnvelope | null;
  benchmarkAccepted: boolean;
  hardOutcomesPassed: boolean;
  capacityReady: boolean;
  aggregateScore: number;
  aggregateDeltaFromBaseline: number;
  aggregateDeltaFromIncumbent: number;
  minimumBaselineCaseDelta: number;
  minimumCurrentBestCaseDelta: number;
  currentBestCaseDeltas: Array<{ id: string; delta: number }>;
  promotable: boolean;
  reasons: string[];
  mixedQualityScoreBreakdownDelta: ScoreBreakdown;
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
  cases: Array<{
    id: string;
    score: number;
    baselineDelta: number;
    currentBestDelta: number;
    capacityReady: boolean;
    scoreBreakdownDelta: ScoreBreakdown;
    outcomes: {
      contractFulfillment: number;
      completedLots: number;
      onTimeLots: number;
      firstPassYield: number;
      scrappedLots: number;
      qualityEscapes: number;
      pendingReleaseLots: number;
    };
  }>;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const depositionDeviceId = "deposition-1";
const depositionAssetId = "ald-deposition-bay";
const technologyAssetId = "multi-chamber-ald-cell";

const variants: Variant[] = [
  { id: "incumbent", technology: null },
  {
    id: "multi-chamber-ald-4-3",
    technology: {
      kind: "asset",
      id: technologyAssetId,
      name: "Multi-chamber ALD Cell",
      speed: { numerator: 4, denominator: 3 },
      power: { idleMilliWatts: 36_000, activeMilliWatts: 340_000 },
      buildCost: 19_000,
    },
  },
  {
    id: "multi-chamber-ald-3-2",
    technology: {
      kind: "asset",
      id: technologyAssetId,
      name: "Multi-chamber ALD Cell",
      speed: { numerator: 3, denominator: 2 },
      power: { idleMilliWatts: 40_000, activeMilliWatts: 380_000 },
      buildCost: 22_000,
    },
  },
  {
    id: "multi-chamber-ald-2-1",
    technology: {
      kind: "asset",
      id: technologyAssetId,
      name: "Multi-chamber ALD Cell",
      speed: { numerator: 2, denominator: 1 },
      power: { idleMilliWatts: 45_000, activeMilliWatts: 440_000 },
      buildCost: 26_000,
    },
  },
  {
    id: "agile-pulse-ald-4-5",
    technology: {
      kind: "mode",
      id: "agile-pulse",
      name: "Agile pulse deposition",
      durationMultiplier: { numerator: 4, denominator: 5 },
      powerMultiplier: { numerator: 5, denominator: 4 },
    },
  },
  {
    id: "agile-pulse-ald-2-3",
    technology: {
      kind: "mode",
      id: "agile-pulse-fast",
      name: "Agile pulse deposition",
      durationMultiplier: { numerator: 2, denominator: 3 },
      powerMultiplier: { numerator: 3, denominator: 2 },
    },
  },
];

function researchAsset(source: DeviceAsset, technology: AssetTechnologyEnvelope): DeviceAsset {
  if (!source.production) throw new Error(`${depositionAssetId} has no production contract`);
  const assetContract = {
    source: source.contentHash,
    id: technology.id,
    speed: technology.speed,
    power: technology.power,
    buildCost: technology.buildCost,
  };
  return {
    ...source,
    id: technology.id,
    name: technology.name,
    description: "Compact multi-chamber atomic-layer deposition equipment researched against the commissioned DRAM front-end cadence.",
    tags: [...new Set([...source.tags, "multi-chamber", "cadence"])],
    production: {
      ...source.production,
      speed: { ...technology.speed },
      processes: [...source.production.processes],
      categories: [...source.production.categories],
      inputPorts: [...source.production.inputPorts],
      outputPorts: [...source.production.outputPorts],
      modes: structuredClone(source.production.modes),
      ...(source.production.changeover ? { changeover: structuredClone(source.production.changeover) } : {}),
      ...(source.production.maintenance ? { maintenance: structuredClone(source.production.maintenance) } : {}),
    },
    power: { ...source.power, ...technology.power },
    economics: { buildCost: technology.buildCost },
    contentHash: hashValue(assetContract),
  };
}

function researchModeAsset(source: DeviceAsset, technology: ModeTechnologyEnvelope): DeviceAsset {
  if (!source.production) throw new Error(`${depositionAssetId} has no production contract`);
  const existing = source.production.modes.find((mode) => mode.id === technology.id);
  if (existing) {
    const matchesResearchEnvelope =
      existing.durationMultiplier.numerator === technology.durationMultiplier.numerator
      && existing.durationMultiplier.denominator === technology.durationMultiplier.denominator
      && existing.powerMultiplier.numerator === technology.powerMultiplier.numerator
      && existing.powerMultiplier.denominator === technology.powerMultiplier.denominator;
    if (!matchesResearchEnvelope) {
      throw new Error(`${depositionAssetId} mode ${technology.id} does not match the research envelope`);
    }
    return source;
  }
  return {
    ...source,
    production: {
      ...source.production,
      processes: [...source.production.processes],
      categories: [...source.production.categories],
      speed: { ...source.production.speed },
      inputPorts: [...source.production.inputPorts],
      outputPorts: [...source.production.outputPorts],
      modes: [
        ...structuredClone(source.production.modes),
        {
          id: technology.id,
          name: technology.name,
          inputCycles: 1,
          outputCycles: 1,
          durationMultiplier: { ...technology.durationMultiplier },
          powerMultiplier: { ...technology.powerMultiplier },
          auxiliaryInputs: [],
          preventsDefects: [],
          minimumInputTreatmentLevel: 0,
        },
      ],
      ...(source.production.changeover ? { changeover: structuredClone(source.production.changeover) } : {}),
      ...(source.production.maintenance ? { maintenance: structuredClone(source.production.maintenance) } : {}),
    },
    contentHash: hashValue({
      source: source.contentHash,
      mode: technology,
    }),
  };
}

function withTechnology(loaded: LoadedFactoryProject, variant: Variant): LoadedFactoryProject {
  if (!variant.technology) return loaded;
  const source = loaded.deviceAssets[depositionAssetId];
  if (!source) throw new Error(`Missing ${depositionAssetId}`);
  const blueprint = structuredClone(loaded.blueprint);
  const deposition = blueprint.devices.find((device) => device.id === depositionDeviceId);
  if (!deposition || deposition.asset !== depositionAssetId) {
    throw new Error(`${depositionDeviceId} is not the expected incumbent ${depositionAssetId}`);
  }
  if (variant.technology.kind === "asset") deposition.asset = technologyAssetId;
  else {
    if (!deposition.recipe || deposition.recipe.process !== "deposit-dielectric-stack") {
      throw new Error(`${depositionDeviceId} is missing the incumbent deposition recipe`);
    }
    deposition.recipe.mode = variant.technology.id;
  }
  return {
    ...loaded,
    blueprint,
    deviceAssets: {
      ...loaded.deviceAssets,
      ...(variant.technology.kind === "asset"
        ? { [technologyAssetId]: researchAsset(source, variant.technology) }
        : { [depositionAssetId]: researchModeAsset(source, variant.technology) }),
    },
  };
}

async function compileCase(
  variant: Variant,
  selection: { world: string; scenario: string; objective: string },
): Promise<CompiledFactoryProject> {
  const loaded = await loadFactoryProject(projectDir, { ...selection, blueprint: blueprintId });
  return compileFactoryProject(withTechnology(loaded, variant));
}

function guardrailPassed(
  metrics: BlueprintMetricSnapshot,
  guardrail: NonNullable<typeof prepared.manifest.acceptance.outcomeGuardrails>[number],
  caseId: string,
): boolean {
  const threshold = guardrail.thresholds[caseId];
  if (threshold === undefined) return true;
  const value = metrics[guardrail.metric];
  return guardrail.operator === "minimum" ? value >= threshold - 1e-9 : value <= threshold + 1e-9;
}

function summarizeLoss(profile: FabLossProfile | null) {
  const bucket = profile?.buckets.find((item) => item.id === "input-starvation");
  const contributor = (id: string) => bucket?.contributors.find((item) => item.label === id);
  return {
    chain: profile?.chain ?? [],
    inputStarvationScore: bucket?.score ?? 0,
    totalStarvationTicks: bucket?.evidence.starvationTicks ?? 0,
    furnaceStarvationTicks: contributor("furnace-1")?.evidence.starvationTicks ?? 0,
    depositionStarvationTicks: contributor("deposition-1")?.evidence.starvationTicks ?? 0,
    inspectionStarvationTicks: contributor("inspection-1")?.evidence.starvationTicks ?? 0,
  };
}

async function evaluateVariant(variant: Variant): Promise<{
  cases: CaseResult[];
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
}> {
  const cases: CaseResult[] = [];
  let mixedQualityLoss: ReturnType<typeof summarizeLoss> | null = null;
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const project = await compileCase(variant, {
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const evaluation = evaluateFactoryBlueprint(project, variant.id, item.seed);
    cases.push({
      id: item.id,
      weight: item.weight,
      score: evaluation.metrics.score,
      baselineScore: preparedCase.evaluation.metrics.score,
      baselineDelta: evaluation.metrics.score - preparedCase.evaluation.metrics.score,
      capacityReady: evaluation.capacityPlan.ready,
      metrics: evaluation.metrics,
    });
    if (item.id === "mixed-quality") {
      const run = runUntil(project, undefined, { seed: item.seed });
      mixedQualityLoss = summarizeLoss(
        analyzeFabLossProfile(run.metrics, project.scenario.durationTicks, project, run.events),
      );
    }
  }
  if (!mixedQualityLoss) throw new Error("Benchmark is missing mixed-quality");
  return { cases, mixedQualityLoss };
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<string, Awaited<ReturnType<typeof evaluateVariant>>>();
for (const variant of variants) evaluated.set(variant.id, await evaluateVariant(variant));

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent result");
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (cases: CaseResult[], field: "score" | "baselineScore") =>
  cases.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight;
const incumbentAggregate = weightedMean(incumbent.cases, "score");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));
const incumbentMixed = incumbent.cases.find((item) => item.id === "mixed-quality");
if (!incumbentMixed) throw new Error("Incumbent is missing mixed-quality");

const rows: ResultRow[] = [];
for (const variant of variants) {
  const result = evaluated.get(variant.id)!;
  const aggregateScore = weightedMean(result.cases, "score");
  const aggregateBaseline = weightedMean(result.cases, "baselineScore");
  const aggregateDeltaFromBaseline = aggregateScore - aggregateBaseline;
  const aggregateDeltaFromIncumbent = aggregateScore - incumbentAggregate;
  const currentBestCaseDeltas = result.cases.map((item) => ({
    id: item.id,
    delta: item.score - incumbentByCase.get(item.id)!.score,
  }));
  const minimumBaselineCaseDelta = Math.min(...result.cases.map((item) => item.baselineDelta));
  const minimumCurrentBestCaseDelta = Math.min(...currentBestCaseDeltas.map((item) => item.delta));
  const capacityReady = result.cases.every((item) => item.capacityReady);
  const hardOutcomesPassed = result.cases.every((item) =>
    prepared.manifest.acceptance.outcomeGuardrails?.every((guardrail) =>
      guardrailPassed(item.metrics, guardrail, item.id)) ?? true);
  const benchmarkAccepted =
    aggregateDeltaFromBaseline >= prepared.manifest.acceptance.minimumAggregateScoreDelta - 1e-9
    && minimumBaselineCaseDelta >= -prepared.manifest.acceptance.maximumCaseScoreRegression - 1e-9
    && (!prepared.manifest.acceptance.requireCandidateCapacityReady || capacityReady)
    && hardOutcomesPassed;
  const reasons = [
    ...(aggregateDeltaFromBaseline < prepared.manifest.acceptance.minimumAggregateScoreDelta - 1e-9
      ? [`aggregate baseline delta ${aggregateDeltaFromBaseline.toFixed(6)} is below the locked minimum`] : []),
    ...(minimumBaselineCaseDelta < -prepared.manifest.acceptance.maximumCaseScoreRegression - 1e-9
      ? [`minimum baseline case delta ${minimumBaselineCaseDelta.toFixed(6)} exceeds the locked regression budget`] : []),
    ...(!capacityReady ? ["one or more locked cases is not capacity ready"] : []),
    ...(!hardOutcomesPassed ? ["one or more absolute industrial outcomes failed"] : []),
    ...(aggregateDeltaFromIncumbent <= 1e-9 ? ["aggregate score does not improve the current commissioned best"] : []),
    ...(minimumCurrentBestCaseDelta < -1e-9
      ? [`current-best case regression ${minimumCurrentBestCaseDelta.toFixed(6)} is below zero`] : []),
  ];
  const mixed = result.cases.find((item) => item.id === "mixed-quality");
  if (!mixed) throw new Error(`${variant.id} is missing mixed-quality`);
  rows.push({
    id: variant.id,
    technology: variant.technology,
    benchmarkAccepted,
    hardOutcomesPassed,
    capacityReady,
    aggregateScore,
    aggregateDeltaFromBaseline,
    aggregateDeltaFromIncumbent,
    minimumBaselineCaseDelta,
    minimumCurrentBestCaseDelta,
    currentBestCaseDeltas,
    promotable: benchmarkAccepted && aggregateDeltaFromIncumbent > 1e-9 && minimumCurrentBestCaseDelta >= -1e-9,
    reasons,
    mixedQualityScoreBreakdownDelta: subtractScoreBreakdown(
      incumbentMixed.metrics.scoreBreakdown,
      mixed.metrics.scoreBreakdown,
    ),
    mixedQualityLoss: result.mixedQualityLoss,
    cases: result.cases.map((item) => {
      const incumbentCase = incumbentByCase.get(item.id)!;
      return {
        id: item.id,
        score: item.score,
        baselineDelta: item.baselineDelta,
        currentBestDelta: item.score - incumbentCase.score,
        capacityReady: item.capacityReady,
        scoreBreakdownDelta: subtractScoreBreakdown(
          incumbentCase.metrics.scoreBreakdown,
          item.metrics.scoreBreakdown,
        ),
        outcomes: {
          contractFulfillment: item.metrics.contractFulfillment,
          completedLots: item.metrics.completedLots,
          onTimeLots: item.metrics.onTimeLots,
          firstPassYield: item.metrics.firstPassYield,
          scrappedLots: item.metrics.scrappedLots,
          qualityEscapes: item.metrics.qualityEscapes,
          pendingReleaseLots: item.metrics.pendingReleaseLots,
        },
      };
    }),
  });
}

console.log(stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  sourceEvidence: "074-simulate",
  incumbent: {
    aggregateScore: incumbentAggregate,
    mixedQualityLoss: incumbent.mixedQualityLoss,
  },
  rows,
}, 2));
