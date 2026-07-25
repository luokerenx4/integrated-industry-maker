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
  FabLossProfile,
  InputSupplyState,
  LoadedFactoryProject,
  LotDispatchPolicy,
  ScoreBreakdown,
} from "../../../../packages/inm-core/src/index";

interface ModeTechnologyEnvelope {
  kind: "mode";
  id: string;
  name: string;
  selection: "recovery" | "always";
  durationMultiplier: { numerator: number; denominator: number };
  powerMultiplier: { numerator: number; denominator: number };
  preventsDefects: ["latent-electrical"];
  recoverBelowItems?: number;
  minimumCoverageDeficitTicks?: number;
}

interface TransportTechnologyEnvelope {
  kind: "transport";
  id: string;
  name: string;
  targets: Array<"main" | "rework">;
  durationMultiplier: { numerator: number; denominator: number };
  lineBuildCost: number;
  endpointBuildCost: number;
  endpointPower: { idleMilliWatts: number; activeMilliWatts: number };
}

interface CombinedTechnologyEnvelope {
  kind: "combined";
  id: string;
  name: string;
  mode: ModeTechnologyEnvelope;
  transport: TransportTechnologyEnvelope;
}

type TechnologyEnvelope =
  | ModeTechnologyEnvelope
  | TransportTechnologyEnvelope
  | CombinedTechnologyEnvelope;

interface Variant {
  id: string;
  technology: TechnologyEnvelope | null;
  etchLotDispatch?: LotDispatchPolicy;
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

interface SupplyPathSummary {
  totalTicks: number;
  sourceProcessingTicks: number;
  sourceWaitingInputTicks: number;
  transportInFlightTicks: number;
  otherTicks: number;
}

interface ResultRow {
  id: string;
  technology: TechnologyEnvelope | null;
  etchLotDispatch: LotDispatchPolicy | null;
  benchmarkAccepted: boolean;
  hardOutcomesPassed: boolean;
  capacityReady: boolean;
  aggregateScore: number;
  aggregateDeltaFromBaseline: number;
  aggregateDeltaFromIncumbent: number;
  minimumBaselineCaseDelta: number;
  minimumCurrentBestCaseDelta: number;
  currentBestCaseDeltas: Array<{ id: string; delta: number }>;
  inspectionShortageReduced: boolean;
  promotable: boolean;
  reasons: string[];
  mixedQualityScoreBreakdownDelta: ScoreBreakdown;
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
  mixedQualityLossDeltaFromIncumbent: ReturnType<typeof subtractLoss>;
  mixedQualityInspectionMainPathDeltaFromReference: SupplyPathSummary;
  mixedQualityTrace: MixedQualityTrace;
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

interface MixedQualityTrace {
  deliveryPortfolio: {
    demanded: number;
    delivered: number;
    valued: number;
    overflow: number;
    fulfillment: number;
    netValue: number;
    contracts: Record<string, {
      resource: string;
      demand: number;
      delivered: number;
      overflow: number;
      shortfall: number;
      netValue: number;
    }>;
  };
  etchStarts: Array<{
    tick: number;
    mode: string | null;
    lots: string[];
  }>;
  probeOutputs: Array<{
    tick: number;
    lot: string;
    profile: string;
    actualUnits: number;
  }>;
  burnInStarts: Array<{
    tick: number;
    operation: string;
    mode: string | null;
    durationTicks: number;
  }>;
  burnInFinishes: Array<{
    tick: number;
    operation: string;
    mode: string | null;
    products: Record<string, number>;
  }>;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const etchDeviceId = "etch-l2";
const etchAssetId = "closed-loop-plasma-etch-bay";
const inspectionDeviceId = "inspection-1";
const mainConnectionId = "etch-to-inspection";
const reworkConnectionId = "rework-to-inspection";
const conveyorAssetId = "conveyor";
const sorterAssetId = "sorter";
const fastConveyorAssetId = "vacuum-wafer-conveyor";
const fastSorterAssetId = "vacuum-wafer-sorter";
const referenceInspectionMainPath: SupplyPathSummary = {
  totalTicks: 59_584,
  sourceProcessingTicks: 41_240,
  sourceWaitingInputTicks: 9_344,
  transportInFlightTicks: 9_000,
  otherTicks: 0,
};
const referenceInspectionReworkContext: SupplyPathSummary = {
  totalTicks: 59_584,
  sourceProcessingTicks: 1_021,
  sourceWaitingInputTicks: 53_496,
  transportInFlightTicks: 5_067,
  otherTicks: 0,
};

function recoveryModeVariant(
  durationNumerator: number,
  durationDenominator: number,
  powerNumerator: number,
  powerDenominator: number,
  minimumCoverageDeficitTicks: number,
): Variant {
  const id = `closed-loop-fast-${durationNumerator}-${durationDenominator}-after-${minimumCoverageDeficitTicks}`;
  return {
    id,
    technology: {
      kind: "mode",
      id: `closed-loop-fast-${durationNumerator}-${durationDenominator}`,
      name: `Closed-loop fast etch ${durationNumerator}/${durationDenominator}`,
      selection: "recovery",
      durationMultiplier: { numerator: durationNumerator, denominator: durationDenominator },
      powerMultiplier: { numerator: powerNumerator, denominator: powerDenominator },
      preventsDefects: ["latent-electrical"],
      recoverBelowItems: 1,
      minimumCoverageDeficitTicks,
    },
  };
}

function alwaysModeVariant(
  durationNumerator: number,
  durationDenominator: number,
  powerNumerator: number,
  powerDenominator: number,
): Variant {
  return {
    id: `closed-loop-fast-${durationNumerator}-${durationDenominator}-always`,
    technology: {
      kind: "mode",
      id: `closed-loop-fast-${durationNumerator}-${durationDenominator}`,
      name: `Closed-loop fast etch ${durationNumerator}/${durationDenominator}`,
      selection: "always",
      durationMultiplier: { numerator: durationNumerator, denominator: durationDenominator },
      powerMultiplier: { numerator: powerNumerator, denominator: powerDenominator },
      preventsDefects: ["latent-electrical"],
    },
  };
}

function transportVariant(
  id: string,
  name: string,
  targets: TransportTechnologyEnvelope["targets"],
): TransportTechnologyEnvelope {
  return {
    kind: "transport",
    id,
    name,
    targets,
    durationMultiplier: { numerator: 1, denominator: 2 },
    lineBuildCost: 20,
    endpointBuildCost: 80,
    endpointPower: { idleMilliWatts: 750, activeMilliWatts: 3_000 },
  };
}

const dualHandoff = transportVariant(
  "vacuum-dual-wafer-handoff-1-2",
  "Vacuum main and rework wafer handoff",
  ["main", "rework"],
);
const fiveSecondFourFifths = recoveryModeVariant(4, 5, 3, 2, 5_000)
  .technology as ModeTechnologyEnvelope;

const variants: Variant[] = [
  { id: "incumbent", technology: null },
  ...[1, 2_000, 5_000, 10_000].map((ticks) => recoveryModeVariant(4, 5, 3, 2, ticks)),
  ...[2_000, 5_000, 10_000].map((ticks) => recoveryModeVariant(3, 4, 8, 5, ticks)),
  ...[5_000, 10_000].map((ticks) => recoveryModeVariant(2, 3, 9, 5, ticks)),
  alwaysModeVariant(4, 5, 3, 2),
  alwaysModeVariant(3, 4, 8, 5),
  { id: dualHandoff.id, technology: dualHandoff },
  {
    id: "closed-loop-fast-4-5-after-5000-dual-handoff",
    technology: {
      kind: "combined",
      id: "closed-loop-fast-4-5-after-5000-dual-handoff",
      name: "Five-second closed-loop fast etch with dual vacuum handoff",
      mode: fiveSecondFourFifths,
      transport: dualHandoff,
    },
  },
];

const dispatchPolicies: LotDispatchPolicy[] = [
  "earliest-due-date",
  "highest-priority",
];
for (const etchLotDispatch of dispatchPolicies) {
  variants.push({
    id: `etch-${etchLotDispatch}`,
    technology: null,
    etchLotDispatch,
  });
  for (const minimumCoverageDeficitTicks of [1, 2_000, 5_000]) {
    const recovery = recoveryModeVariant(4, 5, 3, 2, minimumCoverageDeficitTicks);
    variants.push({
      ...recovery,
      id: `${recovery.id}-${etchLotDispatch}`,
      etchLotDispatch,
    });
  }
  variants.push({
    ...alwaysModeVariant(4, 5, 3, 2),
    id: `closed-loop-fast-4-5-always-${etchLotDispatch}`,
    etchLotDispatch,
  });
}

function requireCurrentEtchBlueprint(loaded: LoadedFactoryProject) {
  const etch = loaded.blueprint.devices.find((device) => device.id === etchDeviceId);
  if (!etch || etch.asset !== etchAssetId) {
    throw new Error(`${etchDeviceId} is not the expected current ${etchAssetId}`);
  }
  if (
    etch.recipe
    || !etch.recipes
    || etch.recipes.length !== 1
    || etch.recipes[0]?.process !== "etch-cell-layer-2"
    || etch.recipes[0]?.mode !== "closed-loop-control"
    || etch.policy?.cadenceControl
  ) {
    throw new Error(`${etchDeviceId} does not match the strict current closed-loop recipe contract`);
  }
  return { etch, normal: etch.recipes[0] };
}

function researchModeAsset(source: DeviceAsset, technology: ModeTechnologyEnvelope): DeviceAsset {
  if (!source.production) throw new Error(`${etchAssetId} has no production contract`);
  if (!technology.preventsDefects.includes("latent-electrical")) {
    throw new Error(`${technology.id} must preserve latent-electrical prevention`);
  }
  const existing = source.production.modes.find((mode) => mode.id === technology.id);
  if (existing) {
    if (
      stableStringify(existing.durationMultiplier) !== stableStringify(technology.durationMultiplier)
      || stableStringify(existing.powerMultiplier) !== stableStringify(technology.powerMultiplier)
      || !technology.preventsDefects.every((defect) => existing.preventsDefects.includes(defect))
    ) {
      throw new Error(`${technology.id} does not match the project-local qualified mode contract`);
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
          preventsDefects: [...technology.preventsDefects],
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

function withModeTechnology(
  loaded: LoadedFactoryProject,
  technology: ModeTechnologyEnvelope,
): LoadedFactoryProject {
  const source = loaded.deviceAssets[etchAssetId];
  if (!source) throw new Error(`Missing ${etchAssetId}`);
  const blueprint = structuredClone(loaded.blueprint);
  const { etch, normal } = requireCurrentEtchBlueprint({ ...loaded, blueprint });
  if (technology.selection === "recovery") {
    etch.recipes = [
      structuredClone(normal),
      { ...structuredClone(normal), mode: technology.id },
    ];
    delete etch.policy!.recipeDispatch;
    etch.policy = {
      ...etch.policy,
      cadenceControl: {
        kind: "downstream-coverage-recovery",
        process: "etch-cell-layer-2",
        normalMode: "closed-loop-control",
        recoveryMode: technology.id,
        downstreamConnection: mainConnectionId,
        recoverBelowItems: technology.recoverBelowItems ?? 1,
        minimumCoverageDeficitTicks: technology.minimumCoverageDeficitTicks ?? 1,
      },
    };
  } else {
    etch.recipes = [{ ...structuredClone(normal), mode: technology.id }];
  }
  return {
    ...loaded,
    blueprint,
    deviceAssets: {
      ...loaded.deviceAssets,
      [etchAssetId]: researchModeAsset(source, technology),
    },
  };
}

const transportTargets = {
  main: {
    connection: mainConnectionId,
    loader: "etch-to-inspection-loader",
    unloader: "etch-to-inspection-unloader",
  },
  rework: {
    connection: reworkConnectionId,
    loader: "rework-to-inspection-loader",
    unloader: "rework-to-inspection-unloader",
  },
} as const;

function withTransportTechnology(
  loaded: LoadedFactoryProject,
  technology: TransportTechnologyEnvelope,
): LoadedFactoryProject {
  const lineSource = loaded.deviceAssets[conveyorAssetId];
  const endpointSource = loaded.deviceAssets[sorterAssetId];
  const fastLine = loaded.deviceAssets[fastConveyorAssetId];
  const fastEndpoint = loaded.deviceAssets[fastSorterAssetId];
  if (!lineSource || !endpointSource || !fastLine || !fastEndpoint) {
    throw new Error("Missing incumbent or project-local vacuum wafer transport asset");
  }
  if (
    fastLine.economics.buildCost !== technology.lineBuildCost
    || fastEndpoint.economics.buildCost !== technology.endpointBuildCost
    || fastEndpoint.power.idleMilliWatts !== technology.endpointPower.idleMilliWatts
    || fastEndpoint.power.activeMilliWatts !== technology.endpointPower.activeMilliWatts
  ) {
    throw new Error(`${technology.id} does not match the project-local vacuum transport contract`);
  }
  const blueprint = structuredClone(loaded.blueprint);
  for (const targetId of technology.targets) {
    const target = transportTargets[targetId];
    const connection = blueprint.connections.find((item) => item.id === target.connection);
    const loader = blueprint.devices.find((device) => device.id === target.loader);
    const unloader = blueprint.devices.find((device) => device.id === target.unloader);
    if (
      !connection
      || connection.logistics.line.deviceAsset !== conveyorAssetId
      || connection.logistics.loader.device !== target.loader
      || connection.logistics.unloader.device !== target.unloader
      || loader?.asset !== sorterAssetId
      || loader.transportEndpoint?.connection !== target.connection
      || loader.transportEndpoint.stage !== "loader"
      || unloader?.asset !== sorterAssetId
      || unloader.transportEndpoint?.connection !== target.connection
      || unloader.transportEndpoint.stage !== "unloader"
    ) {
      throw new Error(`${target.connection} is not the expected current physical lane`);
    }
    connection.logistics.line.deviceAsset = fastConveyorAssetId;
    loader.asset = fastSorterAssetId;
    unloader.asset = fastSorterAssetId;
  }
  return { ...loaded, blueprint };
}

function withTechnology(loaded: LoadedFactoryProject, variant: Variant): LoadedFactoryProject {
  let result = loaded;
  if (variant.technology?.kind === "mode") {
    result = withModeTechnology(result, variant.technology);
  } else if (variant.technology?.kind === "transport") {
    result = withTransportTechnology(result, variant.technology);
  } else if (variant.technology?.kind === "combined") {
    result = withTransportTechnology(
      withModeTechnology(result, variant.technology.mode),
      variant.technology.transport,
    );
  }
  if (!variant.etchLotDispatch) return result;
  const blueprint = structuredClone(result.blueprint);
  const etch = blueprint.devices.find((device) => device.id === etchDeviceId);
  if (!etch || etch.asset !== etchAssetId || !etch.policy) {
    throw new Error(`${etchDeviceId} is missing its policy during dispatch research`);
  }
  etch.policy = { ...etch.policy, lotDispatch: variant.etchLotDispatch };
  return { ...result, blueprint };
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

function summarizeConnectionState(
  contributor: NonNullable<FabLossProfile["buckets"][number]["contributors"][number]> | undefined,
  connectionId: string,
): SupplyPathSummary {
  const ticksForState = (state: InputSupplyState) =>
    contributor?.inputStates.reduce((sum, inputState) => {
      const supply = inputState.shortages
        .flatMap((shortage) => shortage.supplies)
        .find((item) => item.connection === connectionId);
      return sum + (supply?.state === state ? inputState.starvationTicks : 0);
    }, 0) ?? 0;
  const result: SupplyPathSummary = {
    totalTicks: contributor?.evidence.starvationTicks ?? 0,
    sourceProcessingTicks: ticksForState("source-processing"),
    sourceWaitingInputTicks: ticksForState("source-waiting-input"),
    transportInFlightTicks: ticksForState("transport-in-flight"),
    otherTicks: 0,
  };
  result.otherTicks = result.totalTicks
    - result.sourceProcessingTicks
    - result.sourceWaitingInputTicks
    - result.transportInFlightTicks;
  return result;
}

function summarizeLoss(profile: FabLossProfile | null) {
  const bucket = profile?.buckets.find((item) => item.id === "input-starvation");
  const contributor = (id: string) => bucket?.contributors.find((item) => item.label === id);
  const inspection = contributor(inspectionDeviceId);
  return {
    chain: profile?.chain ?? [],
    inputStarvationScore: bucket?.score ?? 0,
    totalStarvationTicks: bucket?.evidence.starvationTicks ?? 0,
    inspectionStarvationTicks: inspection?.evidence.starvationTicks ?? 0,
    inspectionMainPath: summarizeConnectionState(inspection, mainConnectionId),
    inspectionReworkContext: summarizeConnectionState(inspection, reworkConnectionId),
    etchStarvationTicks: contributor(etchDeviceId)?.evidence.starvationTicks ?? 0,
    reworkStarvationTicks: contributor("rework-1")?.evidence.starvationTicks ?? 0,
  };
}

function subtractSupplyPath(
  incumbent: SupplyPathSummary,
  candidate: SupplyPathSummary,
): SupplyPathSummary {
  return {
    totalTicks: candidate.totalTicks - incumbent.totalTicks,
    sourceProcessingTicks: candidate.sourceProcessingTicks - incumbent.sourceProcessingTicks,
    sourceWaitingInputTicks: candidate.sourceWaitingInputTicks - incumbent.sourceWaitingInputTicks,
    transportInFlightTicks: candidate.transportInFlightTicks - incumbent.transportInFlightTicks,
    otherTicks: candidate.otherTicks - incumbent.otherTicks,
  };
}

function subtractLoss(
  incumbent: ReturnType<typeof summarizeLoss>,
  candidate: ReturnType<typeof summarizeLoss>,
) {
  return {
    inputStarvationScore: candidate.inputStarvationScore - incumbent.inputStarvationScore,
    totalStarvationTicks: candidate.totalStarvationTicks - incumbent.totalStarvationTicks,
    inspectionStarvationTicks: candidate.inspectionStarvationTicks - incumbent.inspectionStarvationTicks,
    inspectionMainPath: subtractSupplyPath(
      incumbent.inspectionMainPath,
      candidate.inspectionMainPath,
    ),
    inspectionReworkContext: subtractSupplyPath(
      incumbent.inspectionReworkContext,
      candidate.inspectionReworkContext,
    ),
    etchStarvationTicks: candidate.etchStarvationTicks - incumbent.etchStarvationTicks,
    reworkStarvationTicks: candidate.reworkStarvationTicks - incumbent.reworkStarvationTicks,
  };
}

async function evaluateVariant(variant: Variant): Promise<{
  cases: CaseResult[];
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
  mixedQualityTrace: MixedQualityTrace;
}> {
  const cases: CaseResult[] = [];
  let mixedQualityLoss: ReturnType<typeof summarizeLoss> | null = null;
  let mixedQualityTrace: MixedQualityTrace | null = null;
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
      mixedQualityTrace = {
        deliveryPortfolio: {
          demanded: run.metrics.deliveryPortfolio.demanded,
          delivered: run.metrics.deliveryPortfolio.delivered,
          valued: run.metrics.deliveryPortfolio.valued,
          overflow: run.metrics.deliveryPortfolio.overflow,
          fulfillment: run.metrics.deliveryPortfolio.fulfillment,
          netValue: run.metrics.deliveryPortfolio.netValue,
          contracts: Object.fromEntries(
            Object.entries(run.metrics.deliveryPortfolio.contracts).map(([id, contract]) => [id, {
              resource: contract.resource,
              demand: contract.demand,
              delivered: contract.delivered,
              overflow: contract.overflow,
              shortfall: contract.shortfall,
              netValue: contract.netValue,
            }]),
          ),
        },
        etchStarts: run.events.flatMap((event) =>
          event.type === "device.start" && event.device === etchDeviceId
            ? [{
                tick: event.tick,
                mode: event.mode ?? null,
                lots: [...(event.lotIds ?? [])],
              }]
            : []),
        probeOutputs: run.events.flatMap((event) =>
          event.type === "lot.output-profile"
            ? [{
                tick: event.tick,
                lot: event.lot,
                profile: event.profile,
                actualUnits: event.actualOutputs.reduce((sum, output) => sum + output.count, 0),
              }]
            : []),
        burnInStarts: run.events.flatMap((event) =>
          event.type === "device.start" && event.device === "burn-in-1"
            ? [{
                tick: event.tick,
                operation: event.operation,
                mode: event.mode ?? null,
                durationTicks: event.durationTicks,
              }]
            : []),
        burnInFinishes: run.events.flatMap((event) =>
          event.type === "device.finish" && event.device === "burn-in-1"
            ? [{
                tick: event.tick,
                operation: event.operation,
                mode: event.mode ?? null,
                products: Object.fromEntries(event.produced.map((output) => [output.resource, output.count])),
              }]
            : []),
      };
    }
  }
  if (!mixedQualityLoss) throw new Error("Benchmark is missing mixed-quality");
  if (!mixedQualityTrace) throw new Error("Benchmark is missing mixed-quality trace");
  return { cases, mixedQualityLoss, mixedQualityTrace };
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<string, Awaited<ReturnType<typeof evaluateVariant>>>();
for (const variant of variants) evaluated.set(variant.id, await evaluateVariant(variant));

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent result");
if (
  stableStringify(incumbent.mixedQualityLoss.inspectionMainPath)
    !== stableStringify(referenceInspectionMainPath)
  || stableStringify(incumbent.mixedQualityLoss.inspectionReworkContext)
    !== stableStringify(referenceInspectionReworkContext)
) {
  throw new Error("Current incumbent no longer conserves Run 088 inspection supply-path evidence");
}
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
  const inspectionShortageReduced = lossDelta.inspectionStarvationTicks < -1e-9;
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
    ...(!inspectionShortageReduced
      ? [`inspection shortage delta ${lossDelta.inspectionStarvationTicks} ticks is not below zero`] : []),
  ];
  rows.push({
    id: variant.id,
    technology: variant.technology,
    etchLotDispatch: variant.etchLotDispatch ?? null,
    benchmarkAccepted,
    hardOutcomesPassed,
    capacityReady,
    aggregateScore,
    aggregateDeltaFromBaseline,
    aggregateDeltaFromIncumbent,
    minimumBaselineCaseDelta,
    minimumCurrentBestCaseDelta,
    currentBestCaseDeltas,
    inspectionShortageReduced,
    promotable:
      benchmarkAccepted
      && aggregateDeltaFromIncumbent > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9
      && inspectionShortageReduced,
    reasons,
    mixedQualityScoreBreakdownDelta: subtractScoreBreakdown(
      incumbentMixed.metrics.scoreBreakdown,
      mixed.metrics.scoreBreakdown,
    ),
    mixedQualityLoss: result.mixedQualityLoss,
    mixedQualityLossDeltaFromIncumbent: lossDelta,
    mixedQualityInspectionMainPathDeltaFromReference: subtractSupplyPath(
      referenceInspectionMainPath,
      result.mixedQualityLoss.inspectionMainPath,
    ),
    mixedQualityTrace: result.mixedQualityTrace,
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
        cadenceControl: item.metrics.cadenceControl.devices[etchDeviceId] ?? null,
      };
    }),
  });
}

process.stdout.write(`${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  sourceEvidence: "089-simulate",
  referenceEvidence: {
    run: "089-simulate",
    inspectionMainPath: referenceInspectionMainPath,
    inspectionReworkContext: referenceInspectionReworkContext,
  },
  incumbent: {
    aggregateScore: incumbentAggregate,
    mixedQualityLoss: incumbent.mixedQualityLoss,
  },
  rows,
}, 2)}\n`);
