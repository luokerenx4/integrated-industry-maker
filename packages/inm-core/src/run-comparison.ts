import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listRuns, type RunManifest, type RunSummary } from "./artifacts";
import {
  compareBlueprintSemantics,
  createJsonPatch,
  factoryMetricDelta,
  factoryMetricSnapshot,
  type BlueprintMetricDelta,
  type BlueprintMetricSnapshot,
  type BlueprintSemanticChange,
} from "./blueprint-comparison";
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { sameProjectEvidenceIdentity } from "./execution-identity";
import {
  analyzeFabLosses,
  type FabLossAttribution,
  type FabLossBucket,
  type FabLossBucketId,
  type FabLossContributor,
} from "./fab-loss-analysis";
import { loadFactoryProject } from "./loader";
import { blueprintSchema } from "./schema";
import type {
  Blueprint,
  CompiledFactoryProject,
  FactoryEvent,
  FactoryMetrics,
  FactoryState,
  ProductionPlan,
  ProjectEvidenceHashes,
} from "./types";
import { hashValue, stableStringify } from "./utils";

export type RunComparisonErrorCode =
  | "run-comparison.same-run"
  | "run-comparison.unknown-run"
  | "run-comparison.invalid-evidence"
  | "run-comparison.incompatible";

export class RunComparisonError extends Error {
  constructor(
    public readonly code: RunComparisonErrorCode,
    message: string,
    public readonly details: Record<string, string> = {},
  ) {
    super(message);
  }
}

export interface FactoryRunEvidence {
  run: {
    id: string;
    resultHash: string;
    runKey: string;
    decision: RunManifest["decision"];
    createdAt: string;
    seed: number;
  };
  selection: RunManifest["selection"];
  hashes: ProjectEvidenceHashes;
  finalTick: number;
  metrics: BlueprintMetricSnapshot;
  capacityPlan: ProductionCapacityPlan;
  losses: FabLossAttribution | null;
}

export interface FactoryRunLossSide {
  score: number;
  summary: string;
  evidence: Record<string, number>;
  leadingContributor: Pick<FabLossContributor, "id" | "label" | "mechanism" | "evidence"> | null;
}

export interface FactoryRunLossDelta {
  id: FabLossBucketId;
  label: string;
  from: FactoryRunLossSide | null;
  to: FactoryRunLossSide | null;
  scoreDelta: number;
  leadingContributorChanged: boolean;
}

export interface FactoryRunComparisonNavigation {
  studioRoute: string;
  fromFactoryRoute: string;
  toFactoryRoute: string;
  changedSubjects: Array<{
    kind: "device" | "connection";
    id: string;
    fromFactoryRoute: string | null;
    toFactoryRoute: string | null;
  }>;
}

export interface FactoryRunInterventionSide {
  id: string;
  hash: string;
}

export type FactoryRunIntervention =
  | {
      kind: "blueprint";
      from: FactoryRunInterventionSide;
      to: FactoryRunInterventionSide;
    }
  | {
      kind: "production-plan";
      from: FactoryRunInterventionSide;
      to: FactoryRunInterventionSide;
    };

export interface ProductionPlanSemanticChange {
  kind: "lot-release" | "material-delivery" | "production-plan";
  id: string;
  action: "added" | "removed" | "changed";
  fields: string[];
  before?: unknown;
  after?: unknown;
}

export type FactoryRunSemanticChange = BlueprintSemanticChange | ProductionPlanSemanticChange;

export interface FactoryRunComparison {
  version: 2;
  project: { id: string; name: string; rootDir: string };
  context: {
    engineVersion: string;
    resourceCatalogHash: string;
    processCatalogHash: string;
    routeCatalogHash: string;
    deviceCatalogHash: string;
    worldHash: string;
    blueprintHash: string | null;
    productionPlanHash: string | null;
    scenarioHash: string;
    objectiveHash: string;
    seed: number;
    durationTicks: number;
  };
  intervention: FactoryRunIntervention;
  from: FactoryRunEvidence;
  to: FactoryRunEvidence;
  patch: ReturnType<typeof createJsonPatch>;
  changes: FactoryRunSemanticChange[];
  delta: BlueprintMetricDelta;
  losses: {
    primaryChanged: boolean;
    chainChanged: boolean;
    buckets: FactoryRunLossDelta[];
  };
  verdict: "IMPROVED" | "REGRESSED" | "UNCHANGED";
  navigation: FactoryRunComparisonNavigation;
}

export function factoryRunComparisonEvidenceHash(
  comparison: FactoryRunComparison,
): string {
  const {
    project,
    navigation: _navigation,
    ...evidence
  } = comparison;
  return hashValue({
    ...evidence,
    project: { id: project.id },
  });
}

interface LoadedFactoryRun {
  summary: RunSummary;
  blueprint: Blueprint;
  metrics: FactoryMetrics;
  state: FactoryState;
  events: FactoryEvent[];
  project: CompiledFactoryProject;
}

function changedFields(before: unknown, after: unknown, prefix = ""): string[] {
  if (stableStringify(before) === stableStringify(after)) return [];
  if (Array.isArray(before) || Array.isArray(after)
    || before === null || after === null
    || typeof before !== "object" || typeof after !== "object") return [prefix || "value"];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .flatMap((key) => changedFields(
      left[key],
      right[key],
      prefix ? `${prefix}.${key}` : key,
    ));
}

function comparePlanEntities(
  kind: "lot-release" | "material-delivery",
  before: Array<{ id: string }> = [],
  after: Array<{ id: string }> = [],
): ProductionPlanSemanticChange[] {
  const left = new Map(before.map((item) => [item.id, item]));
  const right = new Map(after.map((item) => [item.id, item]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((id): ProductionPlanSemanticChange[] => {
    const previous = left.get(id);
    const next = right.get(id);
    if (!previous) return [{ kind, id, action: "added" as const, fields: [], after: structuredClone(next) }];
    if (!next) return [{ kind, id, action: "removed" as const, fields: [], before: structuredClone(previous) }];
    const fields = changedFields(previous, next);
    return fields.length
      ? [{ kind, id, action: "changed" as const, fields, before: structuredClone(previous), after: structuredClone(next) }]
      : [];
  });
}

export function compareProductionPlanSemantics(
  before: ProductionPlan,
  after: ProductionPlan,
): ProductionPlanSemanticChange[] {
  const changes = [
    ...comparePlanEntities("lot-release", before.lotReleases, after.lotReleases),
    ...comparePlanEntities("material-delivery", before.materialDeliveries, after.materialDeliveries),
  ];
  const metadataBefore = { version: before.version, id: before.id, name: before.name };
  const metadataAfter = { version: after.version, id: after.id, name: after.name };
  const fields = changedFields(metadataBefore, metadataAfter);
  if (fields.length) changes.push({
    kind: "production-plan",
    id: after.id,
    action: "changed",
    fields,
    before: metadataBefore,
    after: metadataAfter,
  });
  return changes;
}

const runFactoryRoute = (
  projectId: string,
  runId: string,
  subject?: { kind: "device" | "connection"; id: string },
): string => `/${encodeURIComponent(projectId)}/factory${subject
  ? `/${subject.kind === "device" ? "devices" : "connections"}/${encodeURIComponent(subject.id)}`
  : ""}?run=${encodeURIComponent(runId)}`;

function invalidEvidence(
  runId: string,
  message: string,
  details: Record<string, string> = {},
): never {
  throw new RunComparisonError(
    "run-comparison.invalid-evidence",
    `Immutable Run '${runId}' is not valid comparison evidence: ${message}`,
    { runId, ...details },
  );
}

async function loadFactoryRun(
  projectDir: string,
  runId: string,
  knownRuns?: RunSummary[],
): Promise<LoadedFactoryRun> {
  const summary = (knownRuns ?? await listRuns(projectDir)).find((run) => run.name === runId);
  if (!summary) throw new RunComparisonError(
    "run-comparison.unknown-run",
    `Unknown completed immutable Run '${runId}'.`,
    { runId },
  );
  let blueprint: Blueprint;
  let metrics: FactoryMetrics;
  let state: FactoryState;
  let events: FactoryEvent[];
  try {
    blueprint = blueprintSchema.parse(JSON.parse(await readFile(join(summary.path, "blueprint.json"), "utf8")));
    metrics = JSON.parse(await readFile(join(summary.path, "metrics.json"), "utf8")) as FactoryMetrics;
    state = JSON.parse(await readFile(join(summary.path, "final-state.json"), "utf8")) as FactoryState;
    const eventText = (await readFile(join(summary.path, "events.ndjson"), "utf8")).trim();
    events = eventText ? eventText.split("\n").map((line) => JSON.parse(line) as FactoryEvent) : [];
  } catch (error) {
    invalidEvidence(runId, error instanceof Error ? error.message : String(error));
  }
  const expectedResultHash = hashValue({
    runKey: summary.manifest.runKey,
    events,
    state,
    metrics,
  });
  if (expectedResultHash !== summary.manifest.resultHash) invalidEvidence(
    runId,
    "stored result hash does not match its Run key, events, final state, and metrics",
    { expectedResultHash, actualResultHash: summary.manifest.resultHash },
  );
  let project: CompiledFactoryProject;
  try {
    const loaded = await loadFactoryProject(projectDir, summary.manifest.selection);
    project = compileFactoryProject({ ...loaded, blueprint });
  } catch (error) {
    invalidEvidence(runId, `saved Blueprint no longer compiles against its selected project inputs: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!sameProjectEvidenceIdentity(summary.manifest.hashes, project.hashes)) invalidEvidence(
    runId,
    "saved Blueprint compilation does not reproduce the persisted execution identity",
    {
      expectedExecutionHash: summary.manifest.hashes.executionHash,
      actualExecutionHash: project.hashes.executionHash,
    },
  );
  if (stableStringify(summary.manifest.selection) !== stableStringify(project.selection)) invalidEvidence(
    runId,
    "compiled selection does not reproduce the persisted selection",
  );
  return { summary, blueprint, metrics, state, events, project };
}

function lossSide(bucket: FabLossBucket | undefined): FactoryRunLossSide | null {
  if (!bucket) return null;
  const leading = bucket.contributors[0];
  return {
    score: bucket.score,
    summary: bucket.summary,
    evidence: structuredClone(bucket.evidence),
    leadingContributor: leading ? {
      id: leading.id,
      label: leading.label,
      mechanism: leading.mechanism,
      evidence: structuredClone(leading.evidence),
    } : null,
  };
}

function lossDeltas(
  from: FabLossAttribution | null,
  to: FabLossAttribution | null,
): FactoryRunLossDelta[] {
  const fromById = new Map(from?.buckets.map((bucket) => [bucket.id, bucket]) ?? []);
  const toById = new Map(to?.buckets.map((bucket) => [bucket.id, bucket]) ?? []);
  const ids = [...new Set([...fromById.keys(), ...toById.keys()])].sort();
  return ids.map((id) => {
    const before = fromById.get(id);
    const after = toById.get(id);
    return {
      id,
      label: after?.label ?? before?.label ?? id,
      from: lossSide(before),
      to: lossSide(after),
      scoreDelta: (after?.score ?? 0) - (before?.score ?? 0),
      leadingContributorChanged: before?.contributors[0]?.id !== after?.contributors[0]?.id,
    };
  });
}

function runEvidence(run: LoadedFactoryRun): FactoryRunEvidence {
  const losses = analyzeFabLosses(
    run.metrics,
    run.state.tick,
    { id: run.summary.name, resultHash: run.summary.manifest.resultHash },
    run.project,
    run.events,
  );
  return {
    run: {
      id: run.summary.name,
      resultHash: run.summary.manifest.resultHash,
      runKey: run.summary.manifest.runKey,
      decision: run.summary.manifest.decision,
      createdAt: run.summary.manifest.createdAt,
      seed: run.summary.manifest.seed,
    },
    selection: { ...run.summary.manifest.selection },
    hashes: { ...run.summary.manifest.hashes },
    finalTick: run.state.tick,
    metrics: factoryMetricSnapshot(run.metrics),
    capacityPlan: planProductionCapacity(run.project),
    losses,
  };
}

function assertRunComparisonContext(
  from: LoadedFactoryRun,
  to: LoadedFactoryRun,
): FactoryRunIntervention["kind"] {
  const incompatible = (message: string, details: Record<string, string> = {}): never => {
    throw new RunComparisonError(
      "run-comparison.incompatible",
      `Immutable Runs '${from.summary.name}' and '${to.summary.name}' are not comparable: ${message}`,
      { fromRunId: from.summary.name, toRunId: to.summary.name, ...details },
    );
  };
  if (from.summary.manifest.seed !== to.summary.manifest.seed) incompatible("deterministic seeds differ", {
    fromSeed: String(from.summary.manifest.seed),
    toSeed: String(to.summary.manifest.seed),
  });
  for (const field of ["world", "scenario", "objective"] as const) {
    if (from.summary.manifest.selection[field] !== to.summary.manifest.selection[field]) incompatible(
      `${field} selections differ`,
      { [`from${field}`]: from.summary.manifest.selection[field], [`to${field}`]: to.summary.manifest.selection[field] },
    );
  }
  if (from.state.tick !== to.state.tick) incompatible("final simulation ticks differ", {
    fromTick: String(from.state.tick),
    toTick: String(to.state.tick),
  });
  if (from.state.tick !== from.project.scenario.durationTicks || to.state.tick !== to.project.scenario.durationTicks) incompatible(
    "at least one Run is not a complete selected-Scenario execution",
    {
      fromTick: String(from.state.tick),
      fromDuration: String(from.project.scenario.durationTicks),
      toTick: String(to.state.tick),
      toDuration: String(to.project.scenario.durationTicks),
    },
  );
  for (const [name, left, right] of [
    ["engine version", from.project.hashes.engineVersion, to.project.hashes.engineVersion],
    ["Resource catalog", from.project.hashes.resourceCatalogHash, to.project.hashes.resourceCatalogHash],
    ["Process catalog", from.project.hashes.processCatalogHash, to.project.hashes.processCatalogHash],
    ["Route catalog", from.project.hashes.routeCatalogHash, to.project.hashes.routeCatalogHash],
    ["Device catalog", from.project.hashes.deviceCatalogHash, to.project.hashes.deviceCatalogHash],
    ["World", from.project.hashes.worldHash, to.project.hashes.worldHash],
    ["Scenario", from.project.hashes.scenarioHash, to.project.hashes.scenarioHash],
    ["Objective", from.project.hashes.objectiveHash, to.project.hashes.objectiveHash],
  ] as const) {
    if (left !== right) incompatible(`${name} differs`, { fromHash: left, toHash: right });
  }
  const blueprintChanged = from.project.selection.blueprint !== to.project.selection.blueprint
    || from.project.hashes.blueprintHash !== to.project.hashes.blueprintHash;
  const productionPlanChanged = from.project.selection.productionPlan !== to.project.selection.productionPlan
    || from.project.hashes.productionPlanHash !== to.project.hashes.productionPlanHash;
  if (blueprintChanged === productionPlanChanged) incompatible(
    blueprintChanged
      ? "Blueprint and Production Plan both differ; a controlled comparison permits exactly one intervention"
      : "neither Blueprint nor Production Plan differs; no controlled intervention is present",
    {
      fromBlueprint: from.project.selection.blueprint,
      toBlueprint: to.project.selection.blueprint,
      fromProductionPlan: from.project.selection.productionPlan,
      toProductionPlan: to.project.selection.productionPlan,
    },
  );
  return blueprintChanged ? "blueprint" : "production-plan";
}

export async function compareFactoryRuns(
  projectDir: string,
  fromRunId: string,
  toRunId: string,
): Promise<FactoryRunComparison> {
  if (fromRunId === toRunId) throw new RunComparisonError(
    "run-comparison.same-run",
    "Compared immutable Run ids must be different.",
    { fromRunId, toRunId },
  );
  const rootDir = resolve(projectDir);
  const runs = await listRuns(rootDir);
  const [fromRun, toRun] = await Promise.all([
    loadFactoryRun(rootDir, fromRunId, runs),
    loadFactoryRun(rootDir, toRunId, runs),
  ]);
  const interventionKind = assertRunComparisonContext(fromRun, toRun);
  const from = runEvidence(fromRun);
  const to = runEvidence(toRun);
  const delta = factoryMetricDelta(from.metrics, to.metrics);
  const intervention: FactoryRunIntervention = interventionKind === "blueprint"
    ? {
        kind: "blueprint",
        from: { id: fromRun.project.selection.blueprint, hash: fromRun.project.hashes.blueprintHash },
        to: { id: toRun.project.selection.blueprint, hash: toRun.project.hashes.blueprintHash },
      }
    : {
        kind: "production-plan",
        from: { id: fromRun.project.selection.productionPlan, hash: fromRun.project.hashes.productionPlanHash },
        to: { id: toRun.project.selection.productionPlan, hash: toRun.project.hashes.productionPlanHash },
      };
  const changes = interventionKind === "blueprint"
    ? compareBlueprintSemantics(fromRun.blueprint, toRun.blueprint)
    : compareProductionPlanSemantics(fromRun.project.productionPlan, toRun.project.productionPlan);
  const patch = interventionKind === "blueprint"
    ? createJsonPatch(fromRun.blueprint, toRun.blueprint)
    : createJsonPatch(fromRun.project.productionPlan, toRun.project.productionPlan);
  const fromDeviceIds = new Set(fromRun.blueprint.devices.map((device) => device.id));
  const toDeviceIds = new Set(toRun.blueprint.devices.map((device) => device.id));
  const fromConnectionIds = new Set(fromRun.blueprint.connections.map((connection) => connection.id));
  const toConnectionIds = new Set(toRun.blueprint.connections.map((connection) => connection.id));
  const changedSubjects = changes.flatMap((change) => {
    if (change.kind !== "device" && change.kind !== "connection") return [];
    const subject = { kind: change.kind, id: change.id } as const;
    const existsFrom = change.kind === "device" ? fromDeviceIds.has(change.id) : fromConnectionIds.has(change.id);
    const existsTo = change.kind === "device" ? toDeviceIds.has(change.id) : toConnectionIds.has(change.id);
    return [{
      ...subject,
      fromFactoryRoute: existsFrom ? runFactoryRoute(fromRun.project.manifest.id, fromRunId, subject) : null,
      toFactoryRoute: existsTo ? runFactoryRoute(toRun.project.manifest.id, toRunId, subject) : null,
    }];
  });
  const projectId = toRun.project.manifest.id;
  return {
    version: 2,
    project: { id: projectId, name: toRun.project.manifest.name, rootDir },
    context: {
      engineVersion: toRun.project.hashes.engineVersion,
      resourceCatalogHash: toRun.project.hashes.resourceCatalogHash,
      processCatalogHash: toRun.project.hashes.processCatalogHash,
      routeCatalogHash: toRun.project.hashes.routeCatalogHash,
      deviceCatalogHash: toRun.project.hashes.deviceCatalogHash,
      worldHash: toRun.project.hashes.worldHash,
      blueprintHash: interventionKind === "production-plan" ? toRun.project.hashes.blueprintHash : null,
      productionPlanHash: interventionKind === "blueprint" ? toRun.project.hashes.productionPlanHash : null,
      scenarioHash: toRun.project.hashes.scenarioHash,
      objectiveHash: toRun.project.hashes.objectiveHash,
      seed: to.run.seed,
      durationTicks: to.finalTick,
    },
    intervention,
    from,
    to,
    patch,
    changes,
    delta,
    losses: {
      primaryChanged: from.losses?.primary?.id !== to.losses?.primary?.id,
      chainChanged: stableStringify(from.losses?.chain ?? []) !== stableStringify(to.losses?.chain ?? []),
      buckets: lossDeltas(from.losses, to.losses),
    },
    verdict: delta.score > 1e-9 ? "IMPROVED" : delta.score < -1e-9 ? "REGRESSED" : "UNCHANGED",
    navigation: {
      studioRoute: `/${encodeURIComponent(projectId)}/runs?from=${encodeURIComponent(fromRunId)}&to=${encodeURIComponent(toRunId)}`,
      fromFactoryRoute: runFactoryRoute(projectId, fromRunId),
      toFactoryRoute: runFactoryRoute(projectId, toRunId),
      changedSubjects,
    },
  };
}
