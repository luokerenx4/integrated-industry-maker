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
  BlueprintMetricSnapshot,
  CompiledFactoryProject,
  DeviceAsset,
  DeviceTransportContext,
  DeviceTransportPlan,
  FabLossProfile,
  InputSupplyState,
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
  selection: "recovery" | "always";
  durationMultiplier: { numerator: number; denominator: number };
  powerMultiplier: { numerator: number; denominator: number };
  recoverBelowItems?: number;
  minimumCoverageDeficitTicks?: number;
}

interface TransportTechnologyEnvelope {
  kind: "transport";
  id: string;
  name: string;
  durationMultiplier: { numerator: number; denominator: number };
  lineBuildCost: number;
  endpointBuildCost: number;
  endpointPower: { idleMilliWatts: number; activeMilliWatts: number };
}

interface CombinedTechnologyEnvelope {
  kind: "combined";
  id: string;
  name: string;
  process: AssetTechnologyEnvelope;
  transport: TransportTechnologyEnvelope;
}

type TechnologyEnvelope =
  | AssetTechnologyEnvelope
  | ModeTechnologyEnvelope
  | TransportTechnologyEnvelope
  | CombinedTechnologyEnvelope;

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

interface FurnaceSupplyPathSummary {
  totalTicks: number;
  sourceProcessingTicks: number;
  sourceWaitingInputTicks: number;
  transportInFlightTicks: number;
  otherTicks: number;
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
  furnaceShortageReduced: boolean;
  promotable: boolean;
  reasons: string[];
  mixedQualityScoreBreakdownDelta: ScoreBreakdown;
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
  mixedQualityLossDeltaFromIncumbent: ReturnType<typeof subtractLoss>;
  mixedQualityFurnaceSupplyPathDeltaFromReference: FurnaceSupplyPathSummary;
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
      totalBuildCost: number;
      occupiedArea: number;
      infeasibleReason: string | null;
    };
    cadenceControl: BlueprintMetricSnapshot["cadenceControl"]["devices"][string] | null;
  }>;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const depositionDeviceId = "deposition-1";
const depositionAssetId = "ald-deposition-bay";
const technologyAssetId = "multi-chamber-ald-cell";
const furnaceConnectionId = "deposition-to-batch-furnace";
const furnaceLoaderId = "deposition-to-batch-furnace-loader";
const furnaceUnloaderId = "deposition-to-batch-furnace-unloader";
const conveyorAssetId = "conveyor";
const sorterAssetId = "sorter";
const fastConveyorAssetId = "vacuum-wafer-conveyor";
const fastSorterAssetId = "vacuum-wafer-sorter";
const referenceFurnaceSupplyPath: FurnaceSupplyPathSummary = {
  totalTicks: 42_456,
  sourceProcessingTicks: 23_800,
  sourceWaitingInputTicks: 8_756,
  transportInFlightTicks: 9_900,
  otherTicks: 0,
};

const multiChamberFourThirds: AssetTechnologyEnvelope = {
  kind: "asset",
  id: technologyAssetId,
  name: "Multi-chamber ALD Cell",
  speed: { numerator: 4, denominator: 3 },
  power: { idleMilliWatts: 36_000, activeMilliWatts: 340_000 },
  buildCost: 19_000,
};

const fastFurnaceHandoff: TransportTechnologyEnvelope = {
  kind: "transport",
  id: "vacuum-wafer-handoff-1-2",
  name: "Vacuum wafer handoff",
  durationMultiplier: { numerator: 1, denominator: 2 },
  lineBuildCost: 20,
  endpointBuildCost: 80,
  endpointPower: { idleMilliWatts: 750, activeMilliWatts: 3_000 },
};

function fastRecoveryVariant(recoverBelowItems: number, minimumCoverageDeficitTicks: number): Variant {
  return {
    id: `agile-pulse-ald-2-3-below-${recoverBelowItems}-after-${minimumCoverageDeficitTicks}`,
    technology: {
      kind: "mode",
      id: "agile-pulse-fast",
      name: "Agile pulse deposition",
      selection: "recovery",
      durationMultiplier: { numerator: 2, denominator: 3 },
      powerMultiplier: { numerator: 3, denominator: 2 },
      recoverBelowItems,
      minimumCoverageDeficitTicks,
    },
  };
}

const variants: Variant[] = [
  { id: "incumbent", technology: null },
  {
    id: "multi-chamber-ald-4-3",
    technology: multiChamberFourThirds,
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
      selection: "always",
      durationMultiplier: { numerator: 4, denominator: 5 },
      powerMultiplier: { numerator: 5, denominator: 4 },
    },
  },
  ...[0, 2_000, 5_000, 10_000].map((minimumCoverageDeficitTicks) =>
    fastRecoveryVariant(1, minimumCoverageDeficitTicks)),
  ...[0, 2_000, 5_000, 10_000].map((minimumCoverageDeficitTicks) =>
    fastRecoveryVariant(2, minimumCoverageDeficitTicks)),
  {
    id: "agile-pulse-ald-2-3-always",
    technology: {
      kind: "mode",
      id: "agile-pulse-fast",
      name: "Agile pulse deposition",
      selection: "always",
      durationMultiplier: { numerator: 2, denominator: 3 },
      powerMultiplier: { numerator: 3, denominator: 2 },
    },
  },
  { id: "vacuum-wafer-handoff-1-2", technology: fastFurnaceHandoff },
  {
    id: "multi-chamber-4-3-vacuum-handoff-1-2",
    technology: {
      kind: "combined",
      id: "multi-chamber-4-3-vacuum-handoff-1-2",
      name: "Multi-chamber ALD with vacuum wafer handoff",
      process: multiChamberFourThirds,
      transport: fastFurnaceHandoff,
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

function requireCurrentDepositionBlueprint(loaded: LoadedFactoryProject) {
  const deposition = loaded.blueprint.devices.find((device) => device.id === depositionDeviceId);
  const cadence = deposition?.policy?.cadenceControl;
  if (!deposition || deposition.asset !== depositionAssetId) {
    throw new Error(`${depositionDeviceId} is not the expected current ${depositionAssetId}`);
  }
  if (deposition.recipe || !deposition.recipes || deposition.recipes.length !== 2) {
    throw new Error(`${depositionDeviceId} must expose the current two-recipe cadence contract`);
  }
  if (
    !cadence
    || cadence.kind !== "downstream-coverage-recovery"
    || cadence.process !== "deposit-dielectric-stack"
    || cadence.downstreamConnection !== furnaceConnectionId
  ) {
    throw new Error(`${depositionDeviceId} is missing the current furnace coverage controller`);
  }
  const normal = deposition.recipes.find((recipe) =>
    recipe.process === cadence.process && recipe.mode === cadence.normalMode);
  const recovery = deposition.recipes.find((recipe) =>
    recipe.process === cadence.process && recipe.mode === cadence.recoveryMode);
  if (!normal || !recovery) {
    throw new Error(`${depositionDeviceId} cadence modes do not match its qualified recipes`);
  }
  return { deposition, cadence, normal, recovery };
}

function withProcessTechnology(
  loaded: LoadedFactoryProject,
  technology: AssetTechnologyEnvelope,
): LoadedFactoryProject {
  const source = loaded.deviceAssets[depositionAssetId];
  if (!source) throw new Error(`Missing ${depositionAssetId}`);
  const blueprint = structuredClone(loaded.blueprint);
  const { deposition } = requireCurrentDepositionBlueprint({ ...loaded, blueprint });
  deposition.asset = technology.id;
  return {
    ...loaded,
    blueprint,
    deviceAssets: {
      ...loaded.deviceAssets,
      [technology.id]: researchAsset(source, technology),
    },
  };
}

function withModeTechnology(
  loaded: LoadedFactoryProject,
  technology: ModeTechnologyEnvelope,
): LoadedFactoryProject {
  const source = loaded.deviceAssets[depositionAssetId];
  if (!source) throw new Error(`Missing ${depositionAssetId}`);
  const blueprint = structuredClone(loaded.blueprint);
  const { deposition, cadence, normal, recovery } = requireCurrentDepositionBlueprint({ ...loaded, blueprint });
  if (technology.selection === "recovery") {
    deposition.recipes = deposition.recipes!.map((recipe) =>
      recipe === recovery ? { ...structuredClone(recipe), mode: technology.id } : structuredClone(recipe));
    cadence.recoveryMode = technology.id;
    if (technology.recoverBelowItems !== undefined) {
      cadence.recoverBelowItems = technology.recoverBelowItems;
    }
    if (technology.minimumCoverageDeficitTicks !== undefined) {
      cadence.minimumCoverageDeficitTicks = technology.minimumCoverageDeficitTicks;
    }
  } else {
    deposition.recipe = { ...structuredClone(normal), mode: technology.id };
    delete deposition.recipes;
    delete deposition.policy!.cadenceControl;
  }
  return {
    ...loaded,
    blueprint,
    deviceAssets: {
      ...loaded.deviceAssets,
      [depositionAssetId]: researchModeAsset(source, technology),
    },
  };
}

function requireTransportPlan(value: unknown, assetId: string): DeviceTransportPlan {
  if (
    typeof value !== "object"
    || value === null
    || !Number.isInteger((value as Partial<DeviceTransportPlan>).capacity)
    || !Number.isInteger((value as Partial<DeviceTransportPlan>).durationTicks)
    || !Number.isInteger((value as Partial<DeviceTransportPlan>).stackCapacity)
  ) {
    throw new Error(`${assetId} returned an invalid transport plan`);
  }
  return value as DeviceTransportPlan;
}

function researchTransportAsset(
  source: DeviceAsset,
  id: string,
  name: string,
  technology: TransportTechnologyEnvelope,
  stage: "line" | "endpoint",
): DeviceAsset {
  const sourcePlan = source.program.planTransport;
  if (!sourcePlan) throw new Error(`${source.id} has no physical transport program`);
  const buildCost = stage === "line" ? technology.lineBuildCost : technology.endpointBuildCost;
  const power = stage === "line" ? source.power : { ...source.power, ...technology.endpointPower };
  return {
    ...source,
    id,
    name,
    description: stage === "line"
      ? "Short vacuum-compatible wafer-lot lane researched for the deposition-to-furnace handoff."
      : "Fast vacuum-compatible wafer-lot endpoint researched for the deposition-to-furnace handoff.",
    tags: [...new Set([...source.tags, "vacuum-handoff", "wafer-lot"])],
    power,
    economics: { buildCost },
    contentHash: hashValue({
      source: source.contentHash,
      id,
      buildCost,
      power,
      durationMultiplier: technology.durationMultiplier,
    }),
    runtimeSourceHash: hashValue({
      source: source.runtimeSourceHash,
      id,
      durationMultiplier: technology.durationMultiplier,
    }),
    program: {
      ...source.program,
      planTransport(context: Readonly<DeviceTransportContext>) {
        const planned = requireTransportPlan(sourcePlan(context), source.id);
        return {
          ...planned,
          durationTicks: Math.max(1, Math.ceil(
            planned.durationTicks
            * technology.durationMultiplier.numerator
            / technology.durationMultiplier.denominator,
          )),
        } satisfies DeviceTransportPlan;
      },
    },
  };
}

function withTransportTechnology(
  loaded: LoadedFactoryProject,
  technology: TransportTechnologyEnvelope,
): LoadedFactoryProject {
  const lineSource = loaded.deviceAssets[conveyorAssetId];
  const endpointSource = loaded.deviceAssets[sorterAssetId];
  if (!lineSource || !endpointSource) throw new Error("Missing incumbent conveyor or sorter asset");
  const blueprint = structuredClone(loaded.blueprint);
  const connection = blueprint.connections.find((item) => item.id === furnaceConnectionId);
  const loader = blueprint.devices.find((device) => device.id === furnaceLoaderId);
  const unloader = blueprint.devices.find((device) => device.id === furnaceUnloaderId);
  if (
    !connection
    || connection.logistics.line.deviceAsset !== conveyorAssetId
    || connection.logistics.loader.device !== furnaceLoaderId
    || connection.logistics.unloader.device !== furnaceUnloaderId
  ) {
    throw new Error(`${furnaceConnectionId} is not the expected current physical lane`);
  }
  if (
    loader?.asset !== sorterAssetId
    || loader.transportEndpoint?.connection !== furnaceConnectionId
    || loader.transportEndpoint.stage !== "loader"
    || unloader?.asset !== sorterAssetId
    || unloader.transportEndpoint?.connection !== furnaceConnectionId
    || unloader.transportEndpoint.stage !== "unloader"
  ) {
    throw new Error(`${furnaceConnectionId} is missing its expected sorter endpoints`);
  }
  connection.logistics.line.deviceAsset = fastConveyorAssetId;
  loader.asset = fastSorterAssetId;
  unloader.asset = fastSorterAssetId;
  return {
    ...loaded,
    blueprint,
    deviceAssets: {
      ...loaded.deviceAssets,
      [fastConveyorAssetId]: researchTransportAsset(
        lineSource,
        fastConveyorAssetId,
        "Vacuum Wafer Conveyor",
        technology,
        "line",
      ),
      [fastSorterAssetId]: researchTransportAsset(
        endpointSource,
        fastSorterAssetId,
        "Vacuum Wafer Sorter",
        technology,
        "endpoint",
      ),
    },
  };
}

function withTechnology(loaded: LoadedFactoryProject, variant: Variant): LoadedFactoryProject {
  if (!variant.technology) return loaded;
  if (variant.technology.kind === "asset") return withProcessTechnology(loaded, variant.technology);
  if (variant.technology.kind === "mode") return withModeTechnology(loaded, variant.technology);
  if (variant.technology.kind === "transport") return withTransportTechnology(loaded, variant.technology);
  return withTransportTechnology(
    withProcessTechnology(loaded, variant.technology.process),
    variant.technology.transport,
  );
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
  const furnace = contributor("furnace-1");
  const ticksForState = (state: InputSupplyState) =>
    furnace?.inputStates.reduce((sum, inputState) =>
      sum + (inputState.shortages.some((shortage) =>
        shortage.supplies.some((supply) => supply.state === state)) ? inputState.starvationTicks : 0), 0) ?? 0;
  const furnaceSupplyPath: FurnaceSupplyPathSummary = {
    totalTicks: furnace?.evidence.starvationTicks ?? 0,
    sourceProcessingTicks: ticksForState("source-processing"),
    sourceWaitingInputTicks: ticksForState("source-waiting-input"),
    transportInFlightTicks: ticksForState("transport-in-flight"),
    otherTicks: 0,
  };
  furnaceSupplyPath.otherTicks = furnaceSupplyPath.totalTicks
    - furnaceSupplyPath.sourceProcessingTicks
    - furnaceSupplyPath.sourceWaitingInputTicks
    - furnaceSupplyPath.transportInFlightTicks;
  return {
    chain: profile?.chain ?? [],
    inputStarvationScore: bucket?.score ?? 0,
    totalStarvationTicks: bucket?.evidence.starvationTicks ?? 0,
    furnaceStarvationTicks: furnaceSupplyPath.totalTicks,
    furnaceSupplyPath,
    depositionStarvationTicks: contributor("deposition-1")?.evidence.starvationTicks ?? 0,
    inspectionStarvationTicks: contributor("inspection-1")?.evidence.starvationTicks ?? 0,
  };
}

function subtractLoss(
  incumbent: ReturnType<typeof summarizeLoss>,
  candidate: ReturnType<typeof summarizeLoss>,
) {
  return {
    inputStarvationScore: candidate.inputStarvationScore - incumbent.inputStarvationScore,
    totalStarvationTicks: candidate.totalStarvationTicks - incumbent.totalStarvationTicks,
    furnaceStarvationTicks: candidate.furnaceStarvationTicks - incumbent.furnaceStarvationTicks,
    furnaceSupplyPath: {
      totalTicks: candidate.furnaceSupplyPath.totalTicks - incumbent.furnaceSupplyPath.totalTicks,
      sourceProcessingTicks:
        candidate.furnaceSupplyPath.sourceProcessingTicks - incumbent.furnaceSupplyPath.sourceProcessingTicks,
      sourceWaitingInputTicks:
        candidate.furnaceSupplyPath.sourceWaitingInputTicks - incumbent.furnaceSupplyPath.sourceWaitingInputTicks,
      transportInFlightTicks:
        candidate.furnaceSupplyPath.transportInFlightTicks - incumbent.furnaceSupplyPath.transportInFlightTicks,
      otherTicks: candidate.furnaceSupplyPath.otherTicks - incumbent.furnaceSupplyPath.otherTicks,
    },
    depositionStarvationTicks: candidate.depositionStarvationTicks - incumbent.depositionStarvationTicks,
    inspectionStarvationTicks: candidate.inspectionStarvationTicks - incumbent.inspectionStarvationTicks,
  };
}

function subtractFurnaceSupplyPath(
  incumbent: FurnaceSupplyPathSummary,
  candidate: FurnaceSupplyPathSummary,
): FurnaceSupplyPathSummary {
  return {
    totalTicks: candidate.totalTicks - incumbent.totalTicks,
    sourceProcessingTicks: candidate.sourceProcessingTicks - incumbent.sourceProcessingTicks,
    sourceWaitingInputTicks: candidate.sourceWaitingInputTicks - incumbent.sourceWaitingInputTicks,
    transportInFlightTicks: candidate.transportInFlightTicks - incumbent.transportInFlightTicks,
    otherTicks: candidate.otherTicks - incumbent.otherTicks,
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
  const mixed = result.cases.find((item) => item.id === "mixed-quality");
  if (!mixed) throw new Error(`${variant.id} is missing mixed-quality`);
  const lossDelta = subtractLoss(incumbent.mixedQualityLoss, result.mixedQualityLoss);
  const furnaceShortageReduced = lossDelta.furnaceStarvationTicks < -1e-9;
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
    ...(!furnaceShortageReduced
      ? [`furnace shortage delta ${lossDelta.furnaceStarvationTicks} ticks is not below zero`] : []),
  ];
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
    furnaceShortageReduced,
    promotable:
      benchmarkAccepted
      && aggregateDeltaFromIncumbent > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9
      && furnaceShortageReduced,
    reasons,
    mixedQualityScoreBreakdownDelta: subtractScoreBreakdown(
      incumbentMixed.metrics.scoreBreakdown,
      mixed.metrics.scoreBreakdown,
    ),
    mixedQualityLoss: result.mixedQualityLoss,
    mixedQualityLossDeltaFromIncumbent: lossDelta,
    mixedQualityFurnaceSupplyPathDeltaFromReference: subtractFurnaceSupplyPath(
      referenceFurnaceSupplyPath,
      result.mixedQualityLoss.furnaceSupplyPath,
    ),
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
          totalBuildCost: item.metrics.totalBuildCost,
          occupiedArea: item.metrics.occupiedArea,
          infeasibleReason: item.metrics.infeasibleReason,
        },
        cadenceControl: item.metrics.cadenceControl.devices[depositionDeviceId] ?? null,
      };
    }),
  });
}

process.stdout.write(`${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  sourceEvidence: "087-simulate",
  referenceEvidence: {
    run: "086-simulate",
    furnaceSupplyPath: referenceFurnaceSupplyPath,
  },
  incumbent: {
    aggregateScore: incumbentAggregate,
    mixedQualityLoss: incumbent.mixedQualityLoss,
  },
  rows,
}, 2)}\n`);
