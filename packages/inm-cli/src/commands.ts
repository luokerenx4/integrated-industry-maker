import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  CandidateChangeSetError, DesignRunError, InmValidationError, WORKSPACE_MANIFEST, analyzeProduction, analyzeProjectOperation, applyCandidateOperation, atomicWriteJson, buildDesignProgramBrief, compareFactoryBlueprints, compileFactoryProject, continueDesignRun, evaluateBenchmarkOperation, listDesignPrograms, listDesignRuns, listProjectArtifactSchemaKinds, listRuns, listWorkspaceProjects, loadDesignRun, loadFactoryProject, loadWorkspace, lockBlueprintBenchmark, manifestSchema, openFactoryProject, openProjectWorkbenchSnapshot, pathExists, planProjectOperation, previewCandidateOperation, projectArtifactJsonSchema, promoteDesignRun, readJson, runDesignProgram, simulateProjectOperation, validateProjectOperation,
  planProductionCapacity,
  researchFactory, runUntil, stableStringify, synthesizeProjectBlueprint, ExternalCommandResearchAgent,
  type DesignRunIteration, type DesignRunProgress, type DesignRunResult, type DesignSearchExhaustionEvidence, type FactoryEvent, type FactoryMetrics, type InmManifest, type InmWorkspaceManifest, type ProjectSelection,
} from "@inm/core";
import { CLI_COMMANDS } from "./capabilities";
import {
  CliCommandError, cliError, cliProgress, cliSuccess, compiledProjectContext, manifestProjectContext, operationProjectContext, workbenchContext, workspaceContext,
  type CliNextAction, type CliSuccessOptions,
} from "./contract";

export interface OutputOptions { json?: boolean; section?: string }
const write = (value: unknown, json: boolean) => process.stdout.write(json ? `${stableStringify(value, 2)}\n` : String(value));
const writeSuccess = (command: string, data: unknown, options: CliSuccessOptions = {}) => write(cliSuccess(command, data, options), true);

type DesignProgressMode = "off" | "human" | "ndjson";

function designDecisionDetail(evidence: NonNullable<DesignRunIteration["decisionEvidence"]>): string {
  const limiting = evidence.cases.find((item) => item.id === evidence.limitingCase)!;
  const violation = evidence.guardrail.violations.length
    ? evidence.cases.find((item) => item.id === evidence.guardrail.violations[0])!
    : null;
  const basis = evidence.basis === "current-best-improvement"
    ? "improves current best"
    : evidence.basis === "benchmark-gate"
      ? "fails locked gate"
      : evidence.basis === "current-best-case-guardrail" ? "fails current-best case guardrail" : "does not improve current best";
  const gate = evidence.gateReasons?.[0] ? ` · ${evidence.gateReasons[0]}` : "";
  if (evidence.basis === "current-best-case-guardrail" && violation) return `${basis} · ${violation.id} ${signed(violation.scoreDelta, 6)} · allowed regression ${violation.maximumScoreRegression!.toFixed(6)}`;
  return `${basis}${gate} · limiting ${limiting.id} ${signed(limiting.scoreDelta, 6)}`;
}

function designPromotionBoundaryDetail(boundary: DesignRunIteration["promotionBoundary"]): string {
  if (boundary.promotable) return "promotion-ready leader";
  const blocker = boundary.cases.find((item) => item.id === boundary.guardrail.violations[0]);
  if (blocker) return `blocked by ${blocker.id} ${signed(blocker.scoreDelta, 6)} · allowed regression ${blocker.maximumScoreRegression!.toFixed(6)}`;
  return `alternative vs leader ${signed(boundary.aggregate.scoreDelta, 6)}`;
}

function writeDesignProgress(progress: DesignRunProgress, mode: DesignProgressMode): void {
  if (mode === "off") return;
  if (mode === "ndjson") {
    process.stderr.write(`${stableStringify(cliProgress("design", progress))}\n`);
    return;
  }
  const work = `${progress.work.completedSimulations}/${progress.work.plannedSimulations}`;
  let line: string;
  if (progress.phase === "run-started") line = `DESIGN  ${work}  ${progress.continuation ? `continuing ${progress.continuation.sourceResultHash.slice(0, 12)} after ${progress.continuation.reusedIterations} iterations` : "preparing"} · ${progress.caseCount} locked cases`;
  else if (progress.phase === "case-started") line = `CASE    ${work}  ${progress.evaluation.kind} ${progress.case.index}/${progress.case.total} ${progress.case.id}`;
  else if (progress.phase === "case-completed") line = `DONE    ${work}  ${progress.evaluation.kind} ${progress.case.id}${progress.candidateScore === undefined ? ` · baseline ${progress.baselineScore?.toFixed(6)}` : ` · score ${progress.candidateScore.toFixed(6)} · Δ ${(progress.scoreDelta ?? 0).toFixed(6)}`}`;
  else if (progress.phase === "proposal-started") line = `DIAGNOSE ${work}  iteration ${progress.iteration} · ${progress.branch.role} ${progress.branch.nodeId} · ${designPromotionBoundaryDetail(progress.promotionBoundary)} · ${progress.driverEvidence.fabLoss?.chain.join(" → ") ?? "no tracked fab loss"}`;
  else if (progress.phase === "proposal-completed") line = `PROPOSE ${work}  ${progress.branch.nodeId} → ${progress.strategy}${progress.addressedCase ? ` · repairs ${progress.addressedCase}` : progress.addressedLoss ? ` · addresses ${progress.addressedLoss}` : ""}`;
  else if (progress.phase === "node-exhausted") line = `EXHAUST ${work}  ${progress.exhaustion.node.role} ${progress.exhaustion.node.nodeId} · proposal portfolio exhausted · next ${progress.exhaustion.nextNodeId ?? "none"}`;
  else if (progress.phase === "candidate-completed") line = `DECIDE  ${work}  iteration ${progress.iteration} ${progress.decision} · ${progress.frontierEvidence.parent.nodeId} → ${progress.frontierEvidence.outcome}${progress.addressedCase ? ` · repaired ${progress.addressedCase}` : ""}${!progress.decisionEvidence ? ` · ${progress.error}` : ` · score ${progress.decisionEvidence.aggregate.candidateScore.toFixed(6)} · leader Δ ${signed(progress.decisionEvidence.aggregate.scoreDelta, 6)} · ${designDecisionDetail(progress.decisionEvidence)}`}`;
  else if (progress.phase === "run-completed") line = `RESULT  ${work}  ${progress.resultHash.slice(0, 12)} · best iteration ${progress.best.iteration}`;
  else return;
  process.stderr.write(`${line}\n`);
}

function designExhaustionLine(exhaustion: DesignSearchExhaustionEvidence): string {
  return `  X${String(exhaustion.sequence).padStart(2, "0")} EXHAUST ${exhaustion.node.role} ${exhaustion.node.nodeId} before iteration ${exhaustion.beforeIteration} · next ${exhaustion.nextNodeId ?? "none"}`;
}

function designIterationLine(iteration: DesignRunIteration): string {
  const lossChain = iteration.driverEvidence.fabLoss?.chain.join(" → ") ?? "no tracked fab loss";
  const lineage = `${iteration.frontierEvidence.parent.nodeId} → ${iteration.frontierEvidence.candidateNodeId ?? "invalid"} · ${iteration.frontierEvidence.outcome}`;
  const target = iteration.addressedCase ? `repairs ${iteration.addressedCase}` : iteration.addressedLoss ? `addresses ${iteration.addressedLoss}` : "no explicit target";
  return `  ${String(iteration.iteration).padStart(3, "0")} ${iteration.decision.padEnd(6)} ${iteration.strategy} · ${lineage} · before ${designPromotionBoundaryDetail(iteration.promotionBoundary)} · ${!iteration.decisionEvidence ? iteration.error : `leader ${signed(iteration.decisionEvidence.aggregate.scoreDelta, 6)} · parent ${signed(iteration.frontierEvidence.parentScoreDelta ?? 0, 6)} · ${designDecisionDetail(iteration.decisionEvidence)}`} · ${target} · observed ${lossChain}`;
}

function sectionResult(command: string, options: OutputOptions, builders: Record<string, () => unknown>): { section: string; result: unknown } {
  if (options.section && !options.json) throw new CliCommandError("cli.section-requires-json", `--section requires --json for '${command}'.`);
  const section = options.section ?? "summary";
  if (!builders[section]) throw new CliCommandError("cli.invalid-section", `Unknown ${command} section '${section}'. Expected one of: ${Object.keys(builders).join(", ")}`);
  return { section, result: builders[section]() };
}

function requireJsonSection(command: string, options: OutputOptions): void {
  if (options.section && !options.json) throw new CliCommandError("cli.section-requires-json", `--section requires --json for '${command}'.`);
}

function rejectSection(command: string, options: OutputOptions): void {
  if (options.section) throw new CliCommandError("cli.invalid-section", `'${command}' does not expose selectable output sections.`);
}

async function projectDirectoryContext(projectDir: string) {
  const rootDir = resolve(projectDir);
  const manifest = manifestSchema.parse(await readJson(join(rootDir, "inm.json")));
  return manifestProjectContext(rootDir, manifest);
}

function nextAction(id: string, description: string, argv: string[], effect: CliNextAction["effect"] = "read-only"): CliNextAction {
  return { id, description, argv, effect };
}

function operationMetadata<T extends { data: unknown }>(operation: T): Omit<T, "data"> {
  const { data: _, ...metadata } = operation;
  return metadata;
}

function selectionArgs(selection: { world: string; blueprint: string; scenario: string; objective: string }): string[] {
  return ["--world", selection.world, "--blueprint", selection.blueprint, "--scenario", selection.scenario, "--objective", selection.objective];
}

function workbenchNextActions(snapshot: Awaited<ReturnType<typeof openProjectWorkbenchSnapshot>>): CliNextAction[] {
  return [snapshot.nextAction];
}

export function helpCommand(options: OutputOptions): void {
  if (options.json) writeSuccess("help", { name: "inm", description: "Integrated Industry Maker", commands: CLI_COMMANDS });
  else write(`${CLI_COMMANDS.map((command) => `${command.usage}\n  ${command.description}`).join("\n\n")}\n`, false);
}

export function schemaCommand(kind: string | undefined, options: OutputOptions): void {
  const kinds = listProjectArtifactSchemaKinds();
  if (!kind) {
    if (options.json) writeSuccess("schema", { kinds });
    else write(`Project artifact schema kinds:\n${kinds.map((item) => `  ${item}`).join("\n")}\n`, false);
    return;
  }
  if (!kinds.includes(kind as (typeof kinds)[number])) throw new CliCommandError("schema.unknown-kind", `Unknown project artifact schema '${kind}'. Expected one of: ${kinds.join(", ")}`);
  const schema = projectArtifactJsonSchema(kind as (typeof kinds)[number]);
  if (options.json) writeSuccess("schema", { kind, schema });
  else write(`${stableStringify(schema, 2)}\n`, false);
}

function signed(value: number, digits = 3): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function fieldValue(value: unknown, field: string): unknown {
  return field.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined, value);
}

function compactValue(value: unknown): string {
  if (value === undefined) return "∅";
  const serialized = stableStringify(value);
  return serialized.length > 90 ? `${serialized.slice(0, 87)}…` : serialized;
}

function materialTreatmentSummary(metrics: FactoryMetrics): string[] {
  const treated = Object.entries(metrics.materialTreatment.treated)
    .flatMap(([resource, levels]) => Object.entries(levels).map(([level, count]) => `${count} ${resource}@${level}`));
  const agents = Object.entries(metrics.materialTreatment.agentsConsumed)
    .map(([resource, count]) => `${count} ${resource}`);
  return [
    `Material treatment: ${treated.join(" + ") || "none"}`,
    `Treatment agents consumed: ${agents.join(" + ") || "none"}`,
  ];
}

async function requireEmptyTarget(target: string): Promise<void> {
  try {
    const entries = await readdir(target);
    if (entries.length) throw new Error(`Target directory is not empty: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function workspaceInitCommand(directory: string, options: { name?: string; json: boolean }): Promise<void> {
  const target = resolve(directory); await requireEmptyTarget(target);
  const manifest: InmWorkspaceManifest = { version: 1, name: options.name ?? basename(target), projectsDirectory: "projects", defaultProject: null };
  await mkdir(join(target, manifest.projectsDirectory), { recursive: true });
  await atomicWriteJson(join(target, WORKSPACE_MANIFEST), manifest);
  if (options.json) writeSuccess("workspace.init", { workspaceDir: target, manifest }, {
    context: workspaceContext(manifest.name, target, manifest.defaultProject),
    artifacts: [{ kind: "workspace", id: manifest.name, path: join(target, WORKSPACE_MANIFEST), immutable: false }],
  });
  else write(`Initialized INM workspace at ${target}\n`, false);
}

export async function projectCreateCommand(workspaceDir: string, id: string, options: { name?: string; json: boolean }): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("Project id must use lowercase kebab-case");
  const workspace = await loadWorkspace(workspaceDir); const target = join(workspace.projectsDir, id);
  if (await pathExists(target)) throw new Error(`Project directory already exists: ${target}`);
  const template = resolve(import.meta.dir, "../../..", "examples/ironworks");
  await mkdir(workspace.projectsDir, { recursive: true });
  await cp(template, target, { recursive: true, errorOnExist: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  const projectManifest = JSON.parse(await readFile(join(target, "inm.json"), "utf8")) as InmManifest;
  projectManifest.id = id; projectManifest.name = options.name ?? id;
  await atomicWriteJson(join(target, "inm.json"), projectManifest);
  if (workspace.manifest.defaultProject === null) {
    workspace.manifest.defaultProject = id;
    await atomicWriteJson(join(workspace.rootDir, WORKSPACE_MANIFEST), workspace.manifest);
  }
  if (options.json) writeSuccess("project.create", { workspaceDir: workspace.rootDir, projectDir: target, id, name: projectManifest.name, isDefault: workspace.manifest.defaultProject === id }, {
    context: manifestProjectContext(target, projectManifest),
    artifacts: [{ kind: "project", id, path: target, immutable: false }],
  });
  else write(`Created project '${id}' at ${target}${workspace.manifest.defaultProject === id ? " (default)" : ""}\n`, false);
}

export async function projectListCommand(workspaceDir: string, options: OutputOptions): Promise<void> {
  const workspace = await loadWorkspace(workspaceDir); const projects = await listWorkspaceProjects(workspace.rootDir);
  if (options.json) writeSuccess("project.list", { projects }, { context: workspaceContext(workspace.manifest.name, workspace.rootDir, workspace.manifest.defaultProject) });
  else if (!projects.length) write(`No projects in ${workspace.rootDir}\n`, false);
  else write(`${projects.map((project) => `${project.isDefault ? "*" : " "} ${project.id.padEnd(24)} ${project.name}  ${project.path}`).join("\n")}\n`, false);
}

export async function projectDefaultCommand(workspaceDir: string, id: string, options: OutputOptions): Promise<void> {
  const workspace = await loadWorkspace(workspaceDir); const projects = await listWorkspaceProjects(workspace.rootDir);
  if (!projects.some((project) => project.id === id)) throw new Error(`Unknown workspace project '${id}'`);
  workspace.manifest.defaultProject = id;
  await atomicWriteJson(join(workspace.rootDir, WORKSPACE_MANIFEST), workspace.manifest);
  if (options.json) writeSuccess("project.default", { defaultProject: id }, {
    context: workspaceContext(workspace.manifest.name, workspace.rootDir, id),
    artifacts: [{ kind: "workspace", id: workspace.manifest.name, path: join(workspace.rootDir, WORKSPACE_MANIFEST), immutable: false }],
  });
  else write(`Default project is now '${id}'\n`, false);
}

export async function validateCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  rejectSection("validate", options);
  const operation = await validateProjectOperation(projectDir, selection);
  const summary = operation.data;
  if (options.json) writeSuccess("validate", { ...summary, operation: operationMetadata(operation) }, {
    context: operationProjectContext(operation.context),
    nextActions: [nextAction("inspect", "Read the shared project workbench snapshot.", ["inm", "inspect", operation.context.project.rootDir, ...selectionArgs(operation.context.selection), "--json"])],
  });
  else write(`✓ ${summary.project}: valid (${summary.regions} ${summary.regions === 1 ? "region" : "regions"}, ${summary.resourceNodes} finite resource ${summary.resourceNodes === 1 ? "node" : "nodes"}, ${summary.devices} devices, ${summary.connections} local connections, ${summary.logisticsNetworks} station ${summary.logisticsNetworks === 1 ? "network" : "networks"} / ${summary.logisticsRoutes} ${summary.logisticsRoutes === 1 ? "route" : "routes"})\nWorld ${operation.context.hashes.worldHash.slice(0, 12)} · Blueprint ${summary.blueprintHash.slice(0, 12)}\n`, false);
}

export async function inspectCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  requireJsonSection("inspect", options);
  const snapshot = await openProjectWorkbenchSnapshot(projectDir, selection);
  const qTimeContributors = snapshot.lossAttribution?.buckets
    .find((bucket) => bucket.id === "q-time")?.contributors ?? [];
  const inputStarvationContributors = snapshot.lossAttribution?.buckets
    .find((bucket) => bucket.id === "input-starvation")?.contributors ?? [];
  const qualityContributors = snapshot.lossAttribution?.buckets
    .find((bucket) => bucket.id === "yield-quality")?.contributors ?? [];
  if (options.json) {
    const data = sectionResult("inspect", options, {
      summary: () => ({ version: snapshot.version, project: snapshot.project, selection: snapshot.selection, hashes: snapshot.hashes, objective: snapshot.objective, status: snapshot.status, lossAttribution: snapshot.lossAttribution ? { run: snapshot.lossAttribution.run, outcome: snapshot.lossAttribution.outcome, primary: snapshot.lossAttribution.primary, chain: snapshot.lossAttribution.chain, caveat: snapshot.lossAttribution.caveat } : null, nextAction: snapshot.nextAction, counts: snapshot.counts }),
      "next-action": () => snapshot.nextAction,
      diagnostics: () => snapshot.diagnostics,
      losses: () => snapshot.lossAttribution,
      catalog: () => snapshot.catalog,
      runs: () => snapshot.runs,
      experiments: () => snapshot.experiments,
      candidates: () => snapshot.candidates,
      operations: () => snapshot.operations,
      all: () => snapshot,
    });
    writeSuccess("inspect", data, {
      context: workbenchContext(snapshot),
      diagnostics: data.section === "diagnostics" || data.section === "all" ? snapshot.diagnostics : data.section === "summary" ? snapshot.diagnostics.slice(0, 5) : [],
      nextActions: workbenchNextActions(snapshot),
    });
  }
  else write([
    `${snapshot.project.name} · project workbench`,
    `Project: ${snapshot.project.rootDir}`,
    `Selection: ${snapshot.selection.world.id} / ${snapshot.selection.blueprint.id} / ${snapshot.selection.scenario.id} / ${snapshot.selection.objective.id}`,
    `Hashes: World ${snapshot.hashes.worldHash.slice(0, 12)} · Blueprint ${snapshot.hashes.blueprintHash.slice(0, 12)} · Scenario ${snapshot.hashes.scenarioHash.slice(0, 12)} · Objective ${snapshot.hashes.objectiveHash.slice(0, 12)}`,
    `Objective: ${snapshot.objective.targetRatePerMinute} ${snapshot.objective.targetResource}/min @ ${snapshot.objective.targetRegion}`,
    `Contracts: ${snapshot.objective.deliveryContracts.map((contract) => `${contract.id}=${contract.demandPerMinute} ${contract.resource}/min @ ${contract.region}`).join("; ")}`,
    `Status: capacity ${snapshot.status.capacity.state.toUpperCase()}${snapshot.status.capacity.gapCount ? ` (${snapshot.status.capacity.gapCount} gaps)` : ""} · flow ${snapshot.status.flow.state.toUpperCase()}${snapshot.status.flow.warningCount ? ` (${snapshot.status.flow.warningCount} warnings)` : ""} · review ${snapshot.status.review.state.toUpperCase()}${snapshot.status.review.pendingCount ? ` (${snapshot.status.review.pendingCount} pending)` : snapshot.status.review.staleCount ? ` (${snapshot.status.review.staleCount} stale)` : ""} · evidence ${snapshot.status.evidence.state.toUpperCase()}`,
    `Factory: zones ${snapshot.counts.regions} · devices ${snapshot.counts.deviceInstances} · local links ${snapshot.counts.connections} / belt cells ${snapshot.counts.transportCells} · station nets ${snapshot.counts.logisticsNetworks} / routes ${snapshot.counts.logisticsRoutes}`,
    `Catalog: resources ${snapshot.counts.resourceAssets} · processes ${snapshot.counts.processes} · product routes ${snapshot.counts.routes} · device assets ${snapshot.counts.deviceAssets}`,
    `Evidence: runs ${snapshot.counts.runs} · experiments ${snapshot.counts.experiments} · candidates ${snapshot.counts.candidates}`,
    ...(snapshot.lossAttribution?.primary ? [
      `Realized fab loss: ${snapshot.lossAttribution.primary.label} · signal ${snapshot.lossAttribution.primary.score.toFixed(4)} · run ${snapshot.lossAttribution.run.id}`,
      `Loss chain: ${snapshot.lossAttribution.chain.join(" → ")}`,
      ...(qualityContributors.length ? [
        "Quality-origin contributors:",
        ...qualityContributors.slice(0, 5).map((contributor) => {
          const devices = contributor.subjects.filter((subject) => subject.kind === "device").map((subject) => subject.id).join("+");
          const lotCount = contributor.evidence.introducedLots;
          const defectCount = contributor.evidence.introducedDefectInstances;
          return `  ${contributor.label} · ${contributor.mechanism} · ${lotCount} ${lotCount === 1 ? "lot" : "lots"} / ${defectCount} ${defectCount === 1 ? "defect instance" : "defect instances"} · ${contributor.evidence.reworkAttemptedLots} rework / ${contributor.evidence.repairedLots} repaired / ${contributor.evidence.persistentLots} persistent · ${contributor.evidence.scrappedLots} scrap / ${contributor.evidence.escapedLots} escape · ${contributor.defects.join("+")} · ${devices}`;
        }),
        ...(qualityContributors.length > 5 ? [`  … ${qualityContributors.length - 5} more in --section losses --json`] : []),
      ] : []),
      ...(inputStarvationContributors.length ? [
        "Input-starvation contributors:",
        ...inputStarvationContributors.slice(0, 5).map((contributor) =>
          `  ${contributor.label} · ${contributor.mechanism} · ${(contributor.evidence.starvationTicks! / 1000).toFixed(1)}s input gap / ${(contributor.evidence.opportunityWindowTicks! / 1000).toFixed(1)}s opportunity · ${contributor.evidence.jobs} jobs · ${(contributor.evidence.unavailableGapTicks! / 1000).toFixed(1)}s separately unavailable · ${contributor.processes.join("+")}`),
        ...(inputStarvationContributors.length > 5 ? [`  … ${inputStarvationContributors.length - 5} more in --section losses --json`] : []),
      ] : []),
      ...(qTimeContributors.length ? [
        "Q-time contributors:",
        ...qTimeContributors.map((contributor) => {
          const devices = contributor.subjects.filter((subject) => subject.kind === "device").map((subject) => subject.id).join("+");
          const lotCount = contributor.evidence.violatedLots;
          const visitCount = contributor.evidence.violations;
          return `  ${contributor.step ?? contributor.label} · ${contributor.mechanism} · ${lotCount} ${lotCount === 1 ? "lot" : "lots"} / ${visitCount} ${visitCount === 1 ? "visit" : "visits"} · mean ${(contributor.evidence.meanQueueTicks! / 1000).toFixed(1)}s / ${(contributor.evidence.limitTicks! / 1000).toFixed(1)}s limit · +${(contributor.evidence.totalOverrunTicks! / 1000).toFixed(1)}s overrun · ${devices}`;
        }),
      ] : []),
    ] : []),
    "",
    `Next action: ${snapshot.nextAction.title}`,
    `  ${snapshot.nextAction.reason}`,
    `  Effect: ${snapshot.nextAction.effect}${snapshot.nextAction.requiresConfirmation ? " · CONFIRMATION REQUIRED" : ""}`,
    `  CLI argv: ${stableStringify(snapshot.nextAction.argv)}`,
    `  Studio: ${snapshot.nextAction.studioRoute}`,
    "",
    `Priority diagnostics (${snapshot.diagnostics.length})`,
    ...(snapshot.diagnostics.length ? snapshot.diagnostics.slice(0, 12).map((diagnostic) => `  ${diagnostic.severity.toUpperCase().padEnd(8)} [${diagnostic.code}] ${diagnostic.message}`) : ["  none"]),
    ...(snapshot.diagnostics.length > 12 ? [`  … ${snapshot.diagnostics.length - 12} more; use --json for the complete set`] : []),
    "",
    "Available operations",
    ...snapshot.operations.map((operation) => `  ${operation.availability.state === "available" ? "✓" : operation.availability.state === "conditional" ? "?" : "·"} ${operation.id.padEnd(20)} ${operation.effect} · ${operation.description}${operation.availability.reasons.length ? ` [${operation.availability.reasons.join("; ")}]` : ""}`),
    "",
  ].join("\n"), false);
}

export async function analyzeCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  requireJsonSection("analyze", options);
  const operation = await analyzeProjectOperation(projectDir, selection);
  const analysis = operation.data;
  if (options.json) {
    const data = sectionResult("analyze", options, {
      summary: () => ({
        powerAllocation: analysis.powerAllocation, declarativeDevices: analysis.declarativeDevices, opaqueDevices: analysis.opaqueDevices,
        target: analysis.productionGraph.targetResource,
        counts: { devices: analysis.devices.length, extraction: analysis.extractionDevices.length, treatment: analysis.treatmentDevices.length, connections: analysis.connections.length, stationNetworks: analysis.stationNetworks.length, powerGrids: analysis.powerGrids.length, diagnostics: analysis.diagnostics.length },
      }),
      diagnostics: () => analysis.diagnostics,
      devices: () => ({ devices: analysis.devices, extractionDevices: analysis.extractionDevices, treatmentDevices: analysis.treatmentDevices, generationDevices: analysis.generationDevices, storageDevices: analysis.storageDevices, recipeOptions: analysis.recipeOptions }),
      contracts: () => ({ productionGraph: analysis.productionGraph, bufferContracts: analysis.bufferContracts, portContracts: analysis.portContracts, toolingProviders: analysis.toolingProviders, utilityProviders: analysis.utilityProviders, resources: analysis.resources, resourceNodes: analysis.resourceNodes }),
      logistics: () => ({ connections: analysis.connections, transportCells: analysis.transportCells, stationNetworks: analysis.stationNetworks }),
      power: () => ({ generationDevices: analysis.generationDevices, storageDevices: analysis.storageDevices, powerGrids: analysis.powerGrids }),
      all: () => analysis,
    });
    writeSuccess("analyze", { ...data, operation: operationMetadata(operation) }, {
      context: operationProjectContext(operation.context), diagnostics: data.section === "diagnostics" || data.section === "all" ? analysis.diagnostics : data.section === "summary" ? analysis.diagnostics.slice(0, 5) : [],
      nextActions: [nextAction("plan", "Plan installed capacity for this exact selection.", ["inm", "plan", operation.context.project.rootDir, ...selectionArgs(operation.context.selection), "--json"])],
    });
    return;
  }
  const lines = [
    `${operation.context.project.name} · nominal production analysis`,
    `Coverage: ${analysis.declarativeDevices} declarative industrial devices, ${analysis.opaqueDevices} opaque/boundary devices`,
    `Power allocation: ${analysis.powerAllocation}`,
    "",
    "Device rates",
    ...analysis.extractionDevices.map((device) => `  ${device.device.padEnd(24)} extract ${device.resource.padEnd(15)} ${device.itemsPerMinute.toFixed(3)} items/min from ${device.nodes.join(", ")} · P${device.powerPriority} · ${(device.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(device.powerMilliWatts / 1000).toFixed(3)} W active`),
    ...analysis.devices.flatMap((device) => [
      `  ${device.device.padEnd(24)} ${`${device.process}/${device.mode}`.padEnd(32)} ${device.cyclesPerMinute.toFixed(3)} jobs/min · P${device.powerPriority} · ${(device.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(device.powerMilliWatts / 1000).toFixed(3)} W active${device.sleepIdleMilliWatts !== undefined ? ` · sleep ${(device.sleepIdleMilliWatts / 1000).toFixed(3)} W after ${device.sleepAfterTicks ?? "OFF"} ms / wake ${device.wakeDurationTicks} ms @ ${((device.wakePowerMilliWatts ?? 0) / 1000).toFixed(3)} W` : ""}${device.minimumInputTreatmentLevel ? ` · inputs @${device.minimumInputTreatmentLevel}+` : ""}${device.setupGroup ? ` · setup ${device.setupGroup}${device.changeoverTransitions?.length ? ` / ${Math.min(...device.changeoverTransitions.map((transition) => transition.durationTicks))}-${Math.max(...device.changeoverTransitions.map((transition) => transition.durationTicks))} ms matrix` : ""}` : ""}${device.tooling?.length ? ` · reusable tooling ${device.tooling.map((tool) => `${tool.count} ${tool.resource}`).join(" + ")} via ${device.toolingProviders?.map((provider) => provider.device).join("/") || "uncovered"}` : ""}${device.utilities?.length ? ` · utilities ${device.utilities.map((utility) => `${utility.units} ${utility.utility}`).join(" + ")} via ${Object.entries(device.utilityProviders ?? {}).map(([utility, providers]) => `${utility}:${providers.map((provider) => provider.device).join("/")}`).join(", ")}` : ""}${device.maintenanceMaximumJobs ? ` · maintenance ${device.maintenanceOpportunisticAfterJobs !== undefined || device.maintenanceOpportunisticAfterQualificationTicks !== undefined ? `${device.maintenanceOpportunisticAfterJobs ?? "—"} jobs / ${device.maintenanceOpportunisticAfterQualificationTicks ?? "—"} ms opportunistic · ` : ""}${device.maintenancePlannedAfterJobs !== undefined || device.maintenancePlannedAfterQualificationTicks !== undefined ? `${device.maintenancePlannedAfterJobs ?? "—"} jobs / ${device.maintenancePlannedAfterQualificationTicks ?? "—"} ms planned · ` : ""}${device.maintenanceMaximumJobs} jobs / ${device.maintenanceMaximumQualificationTicks} ms asset limit · service ${device.maintenanceDurationTicks} ms @ ${((device.maintenancePowerMilliWatts ?? 0) / 1000).toFixed(1)} W · ${device.maintenanceServiceCrews}× ${device.maintenanceServiceSkill} via ${device.maintenanceProviders?.map((provider) => provider.device).join("/") || "uncovered"} · ${device.maintenanceServiceInputs?.map((input) => `${input.count} ${input.resource}`).join(" + ") || "no consumables"} · qualification ${device.qualificationDurationTicks} ms @ ${((device.qualificationPowerMilliWatts ?? 0) / 1000).toFixed(1)} W · ${device.qualificationServiceCrews}× ${device.qualificationServiceSkill} via ${device.qualificationProviders?.map((provider) => provider.device).join("/") || "uncovered"} · ${device.qualificationServiceInputs?.map((input) => `${input.count} ${input.resource}`).join(" + ") || "no consumables"}` : ""}`,
      `    ports   ${Object.entries(device.inputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")}  ⇒  ${Object.entries(device.outputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")}${device.lotTermination ? ` · tracked lot → ${device.lotTermination.terminal.toUpperCase()}` : ""}`,
    ]),
    "",
    "Reusable tooling providers",
    ...analysis.toolingProviders.map((provider) => `  ${provider.device.padEnd(24)} ${provider.stock.map((tool) => `${tool.count} ${tool.resource}`).join(" + ")} · radius ${provider.serviceRadius} · inventory ${provider.inventoryBuffer} · cost ${provider.buildCost} · area ${provider.occupiedArea}`),
    ...(analysis.toolingProviders.length ? [] : ["  none"]),
    "",
    "Facility utility providers",
    ...analysis.utilityProviders.map((provider) => `  ${provider.device.padEnd(24)} ${provider.capacities.map((capacity) => `${capacity.units} ${capacity.utility}`).join(" + ")} · radius ${provider.serviceRadius} · cost ${provider.buildCost} · area ${provider.occupiedArea}`),
    ...(analysis.utilityProviders.length ? [] : ["  none"]),
    "",
    "Instance buffer contracts",
    ...analysis.bufferContracts.flatMap((device) => device.buffers.map((buffer) => `  ${device.device.padEnd(24)} ${buffer.buffer.padEnd(18)} ${buffer.role.padEnd(8)} cap ${buffer.capacity.toString().padStart(4)}  accepts ${buffer.accepts.map((resource) => buffer.resourceCapacities?.[resource] === undefined ? resource : `${resource}≤${buffer.resourceCapacities[resource]}`).join(", ") || "nothing"}`)),
    "",
    "Instance port contracts",
    ...analysis.portContracts.flatMap((device) => device.ports.map((port) => `  ${device.device.padEnd(24)} ${port.port.padEnd(18)} ${port.direction.padEnd(8)} → ${port.buffer.padEnd(18)} carries ${port.accepts.join(", ") || "nothing"}`)),
    "",
    `Production graph · 1 ${analysis.productionGraph.targetResource}`,
    `  raw inputs  ${Object.entries(analysis.productionGraph.rawInputsPerTarget).map(([resource, amount]) => `${amount.toFixed(3)} ${resource}`).join(" + ") || "none"}`,
    ...analysis.productionGraph.steps.map((step) => `  ${step.device.padEnd(24)} ${`${step.process}/${step.mode}`.padEnd(32)} ${step.cyclesPerTarget.toFixed(3)} jobs`),
    "",
    "Recipe alternatives",
    ...analysis.recipeOptions.filter((option) => !option.selected).map((option) => `  ${option.device.padEnd(24)} ${`${option.process}/${option.mode}`.padEnd(32)} ${option.targetOutputPerMinute.toFixed(3)} ${analysis.productionGraph.targetResource}/min · P${option.powerPriority} · ${(option.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(option.powerMilliWatts / 1000).toFixed(3)} W active${option.minimumInputTreatmentLevel ? ` · inputs @${option.minimumInputTreatmentLevel}+` : ""}  ${Object.entries(option.inputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")} ⇒ ${Object.entries(option.outputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")}`),
    ...(analysis.recipeOptions.some((option) => !option.selected) ? [] : ["  none"]),
    "",
    "Material treatment",
    ...analysis.treatmentDevices.map((device) => `  ${device.device.padEnd(24)} ${`${device.mode} → @${device.level}`.padEnd(20)} ${device.itemsPerMinute.toFixed(3)} items/min  agent ${device.agentPerMinute.toFixed(3)} ${device.agentResource}/min · P${device.powerPriority} · ${(device.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(device.powerMilliWatts / 1000).toFixed(3)} W active`),
    ...(analysis.treatmentDevices.length ? [] : ["  none"]),
    "",
    "Power generation",
    ...analysis.generationDevices.map((device) => `  ${device.device.padEnd(24)} ${device.kind.padEnd(10)} ${(device.outputMilliWatts / 1000).toFixed(3).padStart(9)} W${device.fuelResource ? `  burn ${device.fuelPerMinute!.toFixed(3)} ${device.fuelResource}/min · ${device.burnTicks} ms/unit` : ""}`),
    ...(analysis.generationDevices.length ? [] : ["  none"]),
    "",
    "Power storage",
    ...analysis.storageDevices.map((device) => `  ${device.device.padEnd(24)} ${(device.initialMilliJoules / 1e6).toFixed(3).padStart(8)}/${(device.capacityMilliJoules / 1e6).toFixed(3)} MJ initial  charge ${(device.chargeMilliWatts / 1000).toFixed(3).padStart(9)} W  discharge ${(device.dischargeMilliWatts / 1000).toFixed(3).padStart(9)} W`),
    ...(analysis.storageDevices.length ? [] : ["  none"]),
    "",
    "Finite resource nodes",
    ...analysis.resourceNodes.map((node) => `  ${node.node.padEnd(24)} [${node.region}] ${node.amount.toString().padStart(7)} ${node.resource}  miners ${node.miners.join(", ") || "none"}  depletion ${node.estimatedDepletionMinutes === null ? "never" : `${node.estimatedDepletionMinutes.toFixed(3)} min`}`),
    "",
    "Material balance",
    ...analysis.resources.map((resource) => `  ${resource.resource.padEnd(20)} produce ${resource.producedPerMinute.toFixed(3).padStart(9)}/min  consume ${resource.consumedPerMinute.toFixed(3).padStart(9)}/min  net ${resource.netPerMinute.toFixed(3).padStart(9)}/min${resource.hasBoundarySupply ? "  [boundary supply]" : ""}${resource.hasBoundaryDemand ? "  [boundary demand]" : ""}`),
    "",
    "Power grids",
    ...analysis.powerGrids.map((grid) => `  ${grid.grid.padEnd(38)} [${grid.region}] generate ${(grid.productionMilliWatts / 1000).toFixed(3).padStart(9)} W  idle ${(grid.idleConsumptionMilliWatts / 1000).toFixed(3).padStart(9)} W  rated ${(grid.ratedConsumptionMilliWatts / 1000).toFixed(3).padStart(9)} W  headroom ${(grid.headroomMilliWatts / 1000).toFixed(3).padStart(9)} W${grid.storageCapacityMilliJoules ? `  storage ${(grid.initialStoredMilliJoules / 1e6).toFixed(3)}/${(grid.storageCapacityMilliJoules / 1e6).toFixed(3)} MJ @ +${(grid.storageChargeMilliWatts / 1000).toFixed(0)}/-${(grid.storageDischargeMilliWatts / 1000).toFixed(0)} W` : ""}  (${grid.members.length} devices + ${grid.transportStages.length} transport stages)`),
    "",
    "Logistics links",
    ...analysis.connections.map((connection) => `  ${connection.connection.padEnd(24)} [${connection.resources.join(" + ")}]  ${connection.capacityItemsPerMinute.toFixed(3).padStart(9)} items/min  stack×${connection.maxStackSize}  dispatch ${connection.dispatchPolicy}${connection.dispatchPolicy === "shortage-first" ? ` (${connection.dispatchProfiles.map((profile) => `${profile.resource}${profile.minimumTreatmentLevel ? `@${profile.minimumTreatmentLevel}+` : ""}:${profile.targetKind}/batch${profile.coverageUnit}/d${profile.criticalDepth ?? "-"}`).join(", ")})` : ""}  ${connection.travelTicks.toString().padStart(5)} ms  ${connection.pathCells} belt cells${connection.maxLevel ? ` / L${connection.maxLevel}` : ""}${connection.sharedCells ? ` / ${connection.sharedCells} shared` : ""}  ${connection.stages.map((stage) => `${stage.stage}:${stage.device ? `${stage.device}=` : ""}${stage.asset}[${stage.distance} cells, ${stage.capacity} cargo, stack×${stage.stackCapacity}, P${stage.powerPriority}]${stage.powerMilliWatts ? `@${stage.powerGrid ?? "NO-GRID"}/${(stage.idlePowerMilliWatts / 1000).toFixed(1)}→${(stage.powerMilliWatts / 1000).toFixed(1)}W` : ""}`).join(" → ")}`),
    "",
    "Station networks",
    ...analysis.stationNetworks.flatMap((network) => [
      `  ${network.network}  ${network.kind}  dispatch ${network.dispatchPolicy}  ${network.stations} stations  estimated load ${network.estimatedCarrierLoad.toFixed(3)}`,
      ...network.fleets.map((fleet) => `    DEPOT ${fleet.station}@${fleet.region}  ${fleet.count}× ${fleet.carrierAsset}  estimated load ${fleet.estimatedLoad.toFixed(3)}`),
      ...network.stationEnergy.map((station) => `    charge ${station.device}@${station.region}  ${(station.capacityMilliJoules / 1_000_000).toFixed(3)} MJ buffer  ${(station.chargeMilliWatts / 1_000).toFixed(3)} W configured`),
      ...network.routes.map((route) => `    ${route.resource.padEnd(18)} ${route.from}@${route.fromRegion} [${route.fromSlotCapacity}, keep ${route.supplyReserve}] → ${route.to}@${route.toRegion} [${route.toSlotCapacity}, target ${route.demandTarget}]  P${route.demandPriority}/${route.supplyPriority}  coverage ${route.dispatchProfile.targetKind}/batch${route.dispatchProfile.coverageUnit}/d${route.dispatchProfile.criticalDepth ?? "-"}${route.dispatchProfile.minimumTreatmentLevel ? `/@${route.dispatchProfile.minimumTreatmentLevel}+` : ""}${route.dispatchProfile.downstreamConnections.length ? ` via ${route.dispatchProfile.downstreamConnections.join("+")}` : ""}  depot ${route.fleetSize}×${route.carrierAsset}  batch ${route.minimumBatch}-${route.batchCapacity}${route.carrierBatchCapacity !== route.batchCapacity ? ` / carrier ${route.carrierBatchCapacity}` : ""}  ${route.travelTicks} ms out / ${route.roundTripTicks} ms round trip  ${(route.missionEnergyMilliJoules / 1_000_000).toFixed(3)} MJ/mission${route.highSpeed ? `  HIGH-SPEED ${route.highSpeed.enabled ? "ON" : "OFF"} (${route.standardRoundTripTicks}→${route.highSpeed.roundTripTicks} ms round trip, ${(route.standardMissionEnergyMilliJoules / 1e6).toFixed(3)}→${(route.highSpeed.missionEnergyMilliJoules / 1e6).toFixed(3)} MJ)` : ""}  ${route.capacityItemsPerMinute.toFixed(3)} items/min/carrier · ${route.energyLimitedItemsPerMinute.toFixed(3)} energy-limited items/min`),
    ]),
    ...(analysis.stationNetworks.length ? [] : ["  none"]),
    "",
    analysis.diagnostics.length ? "Diagnostics" : "Diagnostics: none",
    ...analysis.diagnostics.map((diagnostic) => `  ${diagnostic.severity === "warning" ? "!" : "·"} [${diagnostic.code}] ${diagnostic.message}`),
    "",
  ];
  write(lines.join("\n"), false);
}

export async function planCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  requireJsonSection("plan", options);
  const operation = await planProjectOperation(projectDir, selection);
  const plan = operation.data;
  if (options.json) {
    const data = sectionResult("plan", options, {
      summary: () => ({ targetResource: plan.targetResource, targetRatePerMinute: plan.targetRatePerMinute, deliveryTargets: plan.deliveryTargets, scenarioMinutes: plan.scenarioMinutes, targetItemsForScenario: plan.targetItemsForScenario, ready: plan.ready, gapCount: plan.gaps.length }),
      gaps: () => plan.gaps,
      processes: () => ({ processes: plan.processes, toolsets: plan.toolsets, treatments: plan.treatments }),
      materials: () => ({ deliveryTargets: plan.deliveryTargets, rawResources: plan.rawResources }),
      logistics: () => ({ transport: plan.transport, stationNetworks: plan.stationNetworks }),
      power: () => plan.power,
      all: () => plan,
    });
    writeSuccess("plan", { ...data, operation: operationMetadata(operation) }, {
      context: operationProjectContext(operation.context), diagnostics: data.section === "gaps" || data.section === "all" ? plan.gaps : data.section === "summary" ? plan.gaps.slice(0, 5) : [],
      nextActions: [nextAction("simulate", "Run deterministic simulation for this exact selection.", ["inm", "simulate", operation.context.project.rootDir, ...selectionArgs(operation.context.selection), "--json"], "creates-artifact")],
    });
    return;
  }
  write([
    `${operation.context.project.name} · target-rate capacity plan`,
    `Primary target: ${plan.targetRatePerMinute.toFixed(3)} ${plan.targetResource}/min · ${plan.targetItemsForScenario.toFixed(3)} items over ${plan.scenarioMinutes.toFixed(3)} min`,
    "Delivery portfolio",
    ...plan.deliveryTargets.map((target) => `  ${target.id.padEnd(24)} ${target.ratePerMinute.toFixed(3).padStart(8)} ${target.resource}/min @ ${target.region} · ${target.itemsForScenario.toFixed(3)} items`),
    `Status: ${plan.ready ? "READY" : `${plan.gaps.length} GAP${plan.gaps.length === 1 ? "" : "S"}`}`, "",
    "Process capacity",
    ...plan.processes.map((process) => `  ${`${process.process}/${process.mode}`.padEnd(32)} ${Object.entries(process.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(3)} ${resource}/min`).join(" + ")}  ${process.configuredMachines}/${process.requiredMachines} ${process.asset}  primary capacity ${process.configuredCapacityPerMinute.toFixed(3)}/min${process.additionalMachines ? `  ADD ${process.additionalMachines}` : ""}`),
    "", "Qualified toolset allocation",
    ...(plan.toolsets.length ? plan.toolsets.map((toolset) => `  ${toolset.id.padEnd(32)} ${(toolset.requiredDeviceTicksPerMinute / 60_000).toFixed(3)} required / ${(toolset.allocatedDeviceTicksPerMinute / 60_000).toFixed(3)} allocated machine-equivalents  ${(toolset.utilization * 100).toFixed(1)}% installed load${toolset.minimumAdditionalDevices ? `  ADD ${toolset.minimumAdditionalDevices}` : ""}\n${toolset.operations.map((operation) => `    ${`${operation.process}/${operation.mode}`.padEnd(30)} ${(operation.allocatedDeviceTicksPerMinute / 60_000).toFixed(3)}/${(operation.requiredDeviceTicksPerMinute / 60_000).toFixed(3)} machine-equivalents · ${operation.qualifiedDevices.join(", ")}`).join("\n")}`) : ["  none"]),
    "", "Treatment capacity",
    ...(plan.treatments.length ? plan.treatments.map((treatment) => `  ${`${treatment.process}/${treatment.treatmentMode}`.padEnd(32)} ${treatment.resource}@${treatment.minimumLevel}+ ${treatment.requiredItemsPerMinute.toFixed(3)}/min  ${treatment.configuredDevices}/${treatment.requiredDevices} ${treatment.asset}  agent ${treatment.requiredAgentPerMinute.toFixed(3)} ${treatment.agentResource}/min${treatment.additionalDevices ? `  ADD ${treatment.additionalDevices}` : ""}`) : ["  none"]),
    "", "Raw resources",
    ...plan.rawResources.map((resource) => `  ${resource.resource.padEnd(18)} need ${resource.totalDemandPerMinute.toFixed(3).padStart(8)}/min  extraction ${resource.configuredExtractionPerMinute.toFixed(3).padStart(8)}/min  scheduled ${resource.scheduledSupplyPerMinute.toFixed(3).padStart(8)}/min (${resource.scheduledSupply} units)  Scenario balance ${resource.scenarioBalance.toFixed(3)}`),
    "", "Transport envelopes",
    ...plan.transport.map((flow) => `  ${flow.process.padEnd(22)} ${flow.direction.padEnd(6)} ${flow.resource.padEnd(16)} ${flow.requiredItemsPerMinute.toFixed(3).padStart(8)}/${flow.configuredCapacityPerMinute.toFixed(3)} items/min  ${flow.connections.join(", ") || "NO CONNECTION"}`),
    "", "Station fleets",
    ...(plan.stationNetworks.length ? plan.stationNetworks.map((network) => `  ${network.network.padEnd(24)} ${network.resource.padEnd(16)} ${network.requiredCarriers}/${network.configuredCarriers} carriers  ${network.requiredItemsPerMinute.toFixed(3)} required / ${network.configuredItemsPerMinute.toFixed(3)} configured items/min · ${network.energyLimitedItemsPerMinute.toFixed(3)} energy cap`) : ["  none"]),
    "", "Regional power",
    ...plan.power.map((power) => `  ${power.region.padEnd(24)} need ${(power.requiredMilliWatts / 1000).toFixed(3).padStart(9)} W  generation ${(power.configuredGenerationMilliWatts / 1000).toFixed(3).padStart(9)} W  headroom ${(power.headroomMilliWatts / 1000).toFixed(3)} W  Scenario ${(power.scenarioGeneratedMilliJoules / 1e6).toFixed(3)}/${(power.scenarioDemandMilliJoules / 1e6).toFixed(3)} MJ  unserved ${(power.scenarioUnservedMilliJoules / 1e6).toFixed(3)} MJ  storage ${(power.configuredStorageCapacityMilliJoules / 1e6).toFixed(3)}/${(power.requiredStorageCapacityMilliJoules / 1e6).toFixed(3)} MJ`),
    "", plan.gaps.length ? "Plan gaps" : "Plan gaps: none",
    ...plan.gaps.map((gap) => `  ! [${gap.kind}] ${gap.message}`), "",
  ].join("\n"), false);
}

export async function compareCommand(
  projectDir: string,
  selection: Omit<ProjectSelection, "blueprint">,
  options: { fromBlueprint: string; toBlueprint: string; seed: number; json: boolean; section?: string },
): Promise<void> {
  requireJsonSection("compare", options);
  if (options.fromBlueprint === options.toBlueprint) throw new Error("Compared Blueprint ids must be different");
  const from = await openFactoryProject(projectDir, { ...selection, blueprint: options.fromBlueprint });
  const to = await openFactoryProject(projectDir, { ...selection, blueprint: options.toBlueprint });
  const comparison = compareFactoryBlueprints(from, to, { seed: options.seed, fromLabel: options.fromBlueprint, toLabel: options.toBlueprint });
  if (options.json) {
    const data = sectionResult("compare", options, {
      summary: () => ({
        seed: comparison.seed, verdict: comparison.verdict,
        from: { label: comparison.from.label, blueprintHash: comparison.from.blueprintHash, score: comparison.from.metrics.score, throughputPerMinute: comparison.from.metrics.throughputPerMinute, capacityReady: comparison.from.capacityPlan.ready },
        to: { label: comparison.to.label, blueprintHash: comparison.to.blueprintHash, score: comparison.to.metrics.score, throughputPerMinute: comparison.to.metrics.throughputPerMinute, capacityReady: comparison.to.capacityPlan.ready },
        delta: { score: comparison.delta.score, throughputPerMinute: comparison.delta.throughputPerMinute },
        patchOperations: comparison.patch.length, semanticChanges: comparison.changes.length,
      }),
      changes: () => ({ patch: comparison.patch, changes: comparison.changes }),
      evaluation: () => ({ from: comparison.from, to: comparison.to, delta: comparison.delta, verdict: comparison.verdict }),
      all: () => comparison,
    });
    writeSuccess("compare", data, { context: compiledProjectContext(from) });
    return;
  }
  const changeLines = comparison.changes.flatMap((change) => {
    const marker = change.action === "added" ? "+" : change.action === "removed" ? "-" : "~";
    if (change.action !== "changed") return [`  ${marker} ${change.kind.padEnd(18)} ${change.id}`];
    const details = change.fields.map((field) => `${field}: ${compactValue(fieldValue(change.before, field))} → ${compactValue(fieldValue(change.after, field))}`);
    return [`  ${marker} ${change.kind.padEnd(18)} ${change.id}`, ...details.map((detail) => `      ${detail}`)];
  });
  const patchLines = comparison.patch.map((operation) => `  ${operation.op.padEnd(7)} ${operation.path}${operation.op === "remove" ? "" : ` = ${compactValue(operation.value)}`}`);
  const fromMetrics = comparison.from.metrics; const toMetrics = comparison.to.metrics;
  write([
    `${from.manifest.name} · Blueprint comparison`,
    `FROM ${comparison.from.label} ${comparison.from.blueprintHash.slice(0, 12)} → TO ${comparison.to.label} ${comparison.to.blueprintHash.slice(0, 12)}`,
    `Benchmark: ${from.world.id} / ${from.scenario.id} / ${from.objective.id} · seed ${comparison.seed}`, "",
    `Semantic changes (${comparison.changes.length})`, ...(changeLines.length ? changeLines : ["  none"]), "",
    `Replayable RFC 6902 patch (${comparison.patch.length})`, ...(patchLines.length ? patchLines : ["  none"]), "",
    "Target-rate capacity",
    `  FROM ${comparison.from.capacityPlan.ready ? "READY" : `${comparison.from.capacityPlan.gaps.length} GAPS`} · TO ${comparison.to.capacityPlan.ready ? "READY" : `${comparison.to.capacityPlan.gaps.length} GAPS`}`,
    ...comparison.to.capacityPlan.gaps.map((gap) => `  ! TO [${gap.kind}] ${gap.message}`),
    ...(comparison.to.capacityPlan.gaps.length ? [] : ["  TO has no capacity gaps"]), "",
    "Deterministic evaluation",
    `  score              ${fromMetrics.score.toFixed(3).padStart(12)} → ${toMetrics.score.toFixed(3).padStart(12)}  Δ ${signed(comparison.delta.score)}`,
    `  throughput/min     ${fromMetrics.throughputPerMinute.toFixed(3).padStart(12)} → ${toMetrics.throughputPerMinute.toFixed(3).padStart(12)}  Δ ${signed(comparison.delta.throughputPerMinute)}`,
    `  target attainment  ${(fromMetrics.objectiveAttainment * 100).toFixed(1).padStart(11)}% → ${(toMetrics.objectiveAttainment * 100).toFixed(1).padStart(11)}%  Δ ${signed(comparison.delta.objectiveAttainment * 100, 1)}pp`,
    ...(fromMetrics.completedLots || toMetrics.completedLots ? [
      `  released lots      ${`${fromMetrics.releasedLots}/${fromMetrics.scheduledLots}`.padStart(12)} → ${`${toMetrics.releasedLots}/${toMetrics.scheduledLots}`.padStart(12)}  Δ ${signed(comparison.delta.releasedLots, 0)}`,
      `  release interval   ${(fromMetrics.meanActualReleaseIntervalTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanActualReleaseIntervalTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanActualReleaseIntervalTicks / 1000)} s`,
      `  release delay      ${(fromMetrics.meanReleaseDelayTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanReleaseDelayTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanReleaseDelayTicks / 1000)} s`,
      `  peak active lots   ${fromMetrics.peakActiveLots.toFixed(0).padStart(12)} → ${toMetrics.peakActiveLots.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.peakActiveLots, 0)}`,
      `  control blocked    ${`${fromMetrics.controlBlockedLots}/${(fromMetrics.controlBlockedTicks / 1000).toFixed(1)}s`.padStart(12)} → ${`${toMetrics.controlBlockedLots}/${(toMetrics.controlBlockedTicks / 1000).toFixed(1)}s`.padStart(12)}`,
      `  service openings   ${fromMetrics.serviceLevelOpenings.toFixed(0).padStart(12)} → ${toMetrics.serviceLevelOpenings.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.serviceLevelOpenings, 0)}`,
      `  completed lots     ${fromMetrics.completedLots.toFixed(0).padStart(12)} → ${toMetrics.completedLots.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.completedLots, 0)}`,
      `  scrapped lots      ${fromMetrics.scrappedLots.toFixed(0).padStart(12)} → ${toMetrics.scrappedLots.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.scrappedLots, 0)}`,
      `  on-time lots       ${fromMetrics.onTimeLots.toFixed(0).padStart(12)} → ${toMetrics.onTimeLots.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.onTimeLots, 0)}`,
      `  good / FP yield    ${(fromMetrics.goodYield * 100).toFixed(1).padStart(5)}%/${(fromMetrics.firstPassYield * 100).toFixed(1)}% → ${(toMetrics.goodYield * 100).toFixed(1).padStart(5)}%/${(toMetrics.firstPassYield * 100).toFixed(1)}%`,
      `  escapes / rework   ${`${fromMetrics.qualityEscapes}/${fromMetrics.reworkCycles}`.padStart(12)} → ${`${toMetrics.qualityEscapes}/${toMetrics.reworkCycles}`.padStart(12)}`,
      `  Q-time late/lots   ${`${fromMetrics.queueTimeViolations}/${fromMetrics.queueTimeViolatedLots}`.padStart(12)} → ${`${toMetrics.queueTimeViolations}/${toMetrics.queueTimeViolatedLots}`.padStart(12)} · max overrun ${(fromMetrics.maximumQueueTimeOverrunTicks / 1000).toFixed(3)} → ${(toMetrics.maximumQueueTimeOverrunTicks / 1000).toFixed(3)} s`,
      `  mean cycle         ${(fromMetrics.meanCycleTimeTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanCycleTimeTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanCycleTimeTicks / 1000)} s`,
      `  p95 cycle          ${(fromMetrics.p95CycleTimeTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.p95CycleTimeTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.p95CycleTimeTicks / 1000)} s`,
      `  mean queue         ${(fromMetrics.meanQueueTimeTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanQueueTimeTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanQueueTimeTicks / 1000)} s`,
      `  mean tardiness     ${(fromMetrics.meanTardinessTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanTardinessTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanTardinessTicks / 1000)} s`,
      `  changeovers        ${fromMetrics.totalChangeovers.toFixed(0).padStart(12)} → ${toMetrics.totalChangeovers.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.totalChangeovers, 0)}`,
      `  setup work         ${(fromMetrics.totalSetupTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.totalSetupTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.totalSetupTicks / 1000)} s`,
      `  campaign holds     ${`${fromMetrics.totalCampaignHolds}/${(fromMetrics.totalCampaignHoldTicks / 1000).toFixed(1)}s`.padStart(12)} → ${`${toMetrics.totalCampaignHolds}/${(toMetrics.totalCampaignHoldTicks / 1000).toFixed(1)}s`.padStart(12)}`,
    ] : []),
    `  energy             ${(fromMetrics.energyConsumedMilliJoules / 1e6).toFixed(3).padStart(12)} → ${(toMetrics.energyConsumedMilliJoules / 1e6).toFixed(3).padStart(12)} MJ  Δ ${signed(comparison.delta.energyConsumedMilliJoules / 1e6)} MJ`,
    `  electricity cost   ${(fromMetrics.electricityTotalCostMicroCurrency / 1e6).toFixed(6).padStart(12)} → ${(toMetrics.electricityTotalCostMicroCurrency / 1e6).toFixed(6).padStart(12)} currency  Δ ${signed(comparison.delta.electricityTotalCostMicroCurrency / 1e6, 6)}`,
    `  stored energy      ${(fromMetrics.storedMilliJoules / 1e6).toFixed(3).padStart(12)} → ${(toMetrics.storedMilliJoules / 1e6).toFixed(3).padStart(12)} MJ  Δ ${signed(comparison.delta.storedMilliJoules / 1e6)} MJ`,
    `  unserved energy    ${(fromMetrics.unservedMilliJoules / 1e6).toFixed(3).padStart(12)} → ${(toMetrics.unservedMilliJoules / 1e6).toFixed(3).padStart(12)} MJ  Δ ${signed(comparison.delta.unservedMilliJoules / 1e6)} MJ`,
    `  curtailed energy   ${(fromMetrics.curtailedMilliJoules / 1e6).toFixed(3).padStart(12)} → ${(toMetrics.curtailedMilliJoules / 1e6).toFixed(3).padStart(12)} MJ  Δ ${signed(comparison.delta.curtailedMilliJoules / 1e6)} MJ`,
    `  unpowered time     ${fromMetrics.unpoweredTicks.toFixed(0).padStart(12)} → ${toMetrics.unpoweredTicks.toFixed(0).padStart(12)} ticks  Δ ${signed(comparison.delta.unpoweredTicks, 0)}`,
    `  build cost         ${fromMetrics.totalBuildCost.toFixed(0).padStart(12)} → ${toMetrics.totalBuildCost.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.totalBuildCost, 0)}`,
    `  occupied area      ${fromMetrics.occupiedArea.toFixed(0).padStart(12)} → ${toMetrics.occupiedArea.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.occupiedArea, 0)}`,
    `  blocked belt items ${fromMetrics.averageBlockedBeltItems.toFixed(3).padStart(12)} → ${toMetrics.averageBlockedBeltItems.toFixed(3).padStart(12)}  Δ ${signed(comparison.delta.averageBlockedBeltItems)}`,
    `  bottleneck         ${(fromMetrics.bottleneckEntity ?? "none").padStart(12)} → ${(toMetrics.bottleneckEntity ?? "none").padStart(12)}`, "",
    `VERDICT: ${comparison.verdict} (${signed(comparison.delta.score)} objective score)`,
    "No run artifact was written; compare is a read-only evaluation.", "",
  ].join("\n"), false);
}

export async function synthesizeCommand(projectDir: string, selection: ProjectSelection, options: { output: string; json: boolean; section?: string }): Promise<void> {
  requireJsonSection("synthesize", options);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.output)) throw new Error("Output blueprint id must use lowercase kebab-case");
  const loaded = await loadFactoryProject(projectDir, selection);
  const synthesis = await synthesizeProjectBlueprint(loaded);
  const outputPath = join(loaded.rootDir, "blueprints", `${options.output}.blueprint.json`);
  if (await pathExists(outputPath)) throw new Error(`Blueprint already exists: ${outputPath}`);
  const verificationScenario = synthesis.method === "project-strategy" ? loaded.scenario : {
    ...loaded.scenario,
    initialBuffers: {},
    lotReleases: [],
    initialSetups: {},
    initialEnergyMilliJoules: {},
    failures: [],
  };
  const project = compileFactoryProject({
    ...loaded,
    selection: { ...loaded.selection, blueprint: options.output },
    blueprint: synthesis.blueprint,
    scenario: verificationScenario,
  });
  const plan = planProductionCapacity(project); const simulation = runUntil(project);
  if (synthesis.method === "project-strategy" && !plan.ready) throw new Error(
    `Project synthesis strategy '${synthesis.strategy.entry}' returned a Blueprint with ${plan.gaps.length} target-rate capacity gap(s)`,
  );
  if (synthesis.method === "project-strategy" && simulation.metrics.infeasibleReason) throw new Error(
    `Project synthesis strategy '${synthesis.strategy.entry}' failed its selected operating Scenario: ${simulation.metrics.infeasibleReason}`,
  );
  await atomicWriteJson(outputPath, synthesis.blueprint);
  const flow = synthesis.method === "fungible-flow" ? synthesis.result : null;
  const summary = {
    output: options.output, outputPath, method: synthesis.method,
    strategy: synthesis.method === "project-strategy" ? synthesis.strategy : null,
    target: flow?.target ?? { resource: loaded.objective.targetResource, region: loaded.objective.targetRegion, ratePerMinute: loaded.objective.targetRatePerMinute },
    devices: synthesis.blueprint.devices.length, connections: synthesis.blueprint.connections.length,
    pathCells: synthesis.blueprint.connections.reduce((sum, connection) => sum + connection.path.length, 0),
    stationNetworks: flow?.stationNetworks ?? [], plannedTransports: flow?.plannedTransports ?? [], optimization: flow?.optimization ?? null,
    localLogistics: flow?.localLogistics ?? [],
    selectedProcesses: flow?.selectedProcesses ?? [], extraction: flow?.extraction ?? [], power: flow?.power ?? [],
    planReady: plan.ready, planGaps: plan.gaps, measured: {
      throughputPerMinute: simulation.metrics.throughputPerMinute, occupiedArea: simulation.metrics.occupiedArea,
      totalBuildCost: simulation.metrics.totalBuildCost, finalScore: simulation.metrics.finalScore, infeasibleReason: simulation.metrics.infeasibleReason,
      releasedLots: simulation.metrics.lotFlow.released, completedLots: simulation.metrics.lotFlow.completed,
    },
  };
  if (options.json) writeSuccess("synthesize", sectionResult("synthesize", options, {
    summary: () => ({ output: summary.output, outputPath: summary.outputPath, method: summary.method, strategy: summary.strategy, target: summary.target, devices: summary.devices, connections: summary.connections, pathCells: summary.pathCells, stationNetworks: summary.stationNetworks.length, planReady: summary.planReady, planGaps: summary.planGaps, measured: summary.measured }),
    topology: () => ({ devices: summary.devices, connections: summary.connections, pathCells: summary.pathCells, stationNetworks: summary.stationNetworks, plannedTransports: summary.plannedTransports, localLogistics: summary.localLogistics, power: summary.power }),
    optimization: () => ({ target: summary.target, optimization: summary.optimization, selectedProcesses: summary.selectedProcesses, extraction: summary.extraction }),
    all: () => summary,
  }), {
    context: compiledProjectContext(project), diagnostics: plan.gaps,
    artifacts: [{ kind: "blueprint", id: options.output, path: outputPath, immutable: false }],
    nextActions: [nextAction("validate", "Validate the generated Blueprint in the selected project context.", ["inm", "validate", project.rootDir, "--world", project.selection.world, "--blueprint", options.output, "--scenario", project.selection.scenario, "--objective", project.selection.objective, "--json"])],
  });
  else write([
    `Synthesized '${options.output}' from project-local recipes and assets`, `Blueprint: ${outputPath}`,
    `Method: ${summary.method}${summary.strategy ? ` · ${summary.strategy.entry}` : ""}`,
    ...(summary.strategy ? [summary.strategy.summary.title, ...summary.strategy.summary.notes.map((note) => `  ${note}`)] : []),
    `Target: ${summary.target.ratePerMinute.toFixed(3)} ${summary.target.resource}/min @ ${summary.target.region}`,
    ...(flow ? [
      "Optimized process mix:",
      ...flow.selectedProcesses.map((process) => `  ${`${process.process}/${process.mode}`.padEnd(32)} ${process.requiredCyclesPerMinute.toFixed(3)} jobs/min · ${Object.entries(process.inputsPerMinute).map(([resource, rate]) => `${rate.toFixed(3)} ${resource}`).join(" + ") || "no inputs"} → ${Object.entries(process.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(3)} ${resource}`).join(" + ")}`),
      ...(flow.plannedTransports.length ? ["Optimized inter-region flows:", ...flow.plannedTransports.map((item) => `  ${item.resource.padEnd(18)} ${item.requiredPerMinute.toFixed(3)}/min · ${item.fromRegion} → ${item.toRegion}`)] : []),
      "Capacity-aware local logistics:",
      ...flow.localLogistics.map((item) => `  ${item.resource.padEnd(18)} ${item.requiredPerMinute.toFixed(3).padStart(8)}/${item.capacityPerMinute.toFixed(3)} items/min · stack×${item.stackSize} · ${item.loader}@${item.loaderDistance} → ${item.line} → ${item.unloader}@${item.unloaderDistance}`),
      "Spatial power networks:",
      ...flow.power.map((power) => `  ${power.region.padEnd(18)} ${power.devices} ${power.asset} (${power.capacityDevices} rated minimum, ${power.coverageTargets} targets)${power.storageDevices ? ` + ${power.storageDevices} ${power.storageAsset}` : ""} · ${(power.generationMilliWatts / 1000).toFixed(3)}/${(power.ratedLoadMilliWatts / 1000).toFixed(3)} W · Scenario ${(power.scenarioGeneratedMilliJoules / 1e6).toFixed(3)}/${(power.scenarioDemandMilliJoules / 1e6).toFixed(3)} MJ${power.profileApplied ? " profiled" : ""}`),
    ] : []),
    `Factory: ${summary.devices} devices · ${summary.connections} connections / ${summary.pathCells} belt cells · ${summary.stationNetworks.length} station network${summary.stationNetworks.length === 1 ? "" : "s"}`,
    `Capacity plan: ${plan.ready ? "READY" : `${plan.gaps.length} GAP${plan.gaps.length === 1 ? "" : "S"}`}`,
    `${synthesis.method === "project-strategy" ? "Locked-case" : "Cold-start"} measurement: ${simulation.metrics.throughputPerMinute.toFixed(3)} ${summary.target.resource}/min · ${simulation.metrics.lotFlow.completed}/${simulation.metrics.lotFlow.released} tracked lots completed/released · area ${simulation.metrics.occupiedArea} · build cost ${simulation.metrics.totalBuildCost} · score ${simulation.metrics.finalScore.toFixed(3)}`,
    ...(simulation.metrics.infeasibleReason ? [`Constraint: ${simulation.metrics.infeasibleReason}`] : []), "",
  ].join("\n"), false);
}

export async function simulateCommand(projectDir: string, selection: ProjectSelection, options: { seed: number; untilTick?: number; maxEvents?: number; json: boolean; section?: string }): Promise<void> {
  requireJsonSection("simulate", options);
  const operation = await simulateProjectOperation(projectDir, selection, { seed: options.seed, ...(options.untilTick === undefined ? {} : { untilTick: options.untilTick }), ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }) });
  const result = { metrics: operation.data.metrics, resultHash: operation.data.resultHash, runKey: operation.data.runKey };
  const cached = operation.data.cached;
  const run = operation.data.run;
  const summary = { cached, run: run.path, resultHash: result.resultHash, runKey: result.runKey, metrics: result.metrics };
  if (options.json) {
    const data = sectionResult("simulate", options, {
    summary: () => ({ cached: summary.cached, run: summary.run, resultHash: summary.resultHash, runKey: summary.runKey, metrics: {
      finalScore: result.metrics.finalScore, throughputPerMinute: result.metrics.throughputPerMinute, demandAttainment: result.metrics.deliveryPortfolio.fulfillment,
      bottleneckEntity: result.metrics.bottleneckEntity, deliveryPortfolio: result.metrics.deliveryPortfolio,
      energyConsumedMilliJoules: result.metrics.energyConsumedMilliJoules, totalBuildCost: result.metrics.totalBuildCost, occupiedArea: result.metrics.occupiedArea,
    } }),
    artifact: () => ({ cached: summary.cached, run: summary.run, resultHash: summary.resultHash, runKey: summary.runKey }),
    metrics: () => summary.metrics,
    all: () => summary,
    });
    writeSuccess("simulate", { ...data, operation: operationMetadata(operation) }, {
      context: operationProjectContext(operation.context),
      artifacts: operation.artifacts.map((artifact) => ({ kind: "run" as const, id: artifact.id, path: artifact.path, immutable: artifact.immutable })),
      nextActions: [nextAction("runs", "List completed immutable runs.", ["inm", "runs", operation.context.project.rootDir, "--json"])],
    });
  }
  else {
    const flowLines = Object.entries(result.metrics.transportFlows).sort(([, a], [, b]) => b.utilization - a.utilization || b.blockedItemTicks - a.blockedItemTicks).map(([connection, flow]) => {
      const resources = Object.entries(flow.deliveredByResource).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "no deliveries";
      return `  ${connection.padEnd(32)} ${flow.deliveredItemsPerMinute.toFixed(3).padStart(8)}/${flow.capacityItemsPerMinute.toFixed(3)} items/min  ${(flow.utilization * 100).toFixed(1).padStart(5)}%  blocked ${flow.blockedItemTicks} item-ticks  ${resources}`;
    });
    write([
    `Simulation ${cached ? "reproduced (cached artifact)" : "completed"}`, `Run: ${run.path}`, `Score: ${result.metrics.finalScore.toFixed(3)}`,
    `Throughput: ${result.metrics.throughputPerMinute.toFixed(3)} contracted product units/min`,
    `Contracts: ${(result.metrics.deliveryPortfolio.fulfillment * 100).toFixed(1)}% demand attainment · ${result.metrics.deliveryPortfolio.valued.toFixed(3)}/${result.metrics.deliveryPortfolio.demanded.toFixed(3)} valued · ${result.metrics.deliveryPortfolio.overflow.toFixed(3)} above demand · ${result.metrics.deliveryPortfolio.netValuePerMinute.toFixed(3)} net value/min`,
    ...Object.entries(result.metrics.deliveryPortfolio.contracts).map(([id, contract]) => `  ${id}: ${contract.delivered.toFixed(3)}/${contract.demand.toFixed(3)} ${contract.resource} · ${(contract.fulfillment * 100).toFixed(1)}% · net ${contract.netValue.toFixed(3)}`),
    `Bottleneck: ${result.metrics.bottleneckEntity ?? "none"}`,
    ...(result.metrics.lotFlow.family ? [
      `Lots: ${result.metrics.lotFlow.completed}/${result.metrics.lotFlow.released}/${result.metrics.lotFlow.scheduled} completed/released/scheduled · ${result.metrics.lotFlow.scrapped} scrapped · ${result.metrics.lotFlow.onTimeCompleted} on time · ${(result.metrics.lotFlow.meanCycleTimeTicks / 1000).toFixed(3)} s mean cycle · ${(result.metrics.lotFlow.p95CycleTimeTicks / 1000).toFixed(3)} s p95`,
      `Release flow: ${(result.metrics.releaseFlow.meanPlannedIntervalTicks / 1000).toFixed(3)} s planned interval · ${(result.metrics.releaseFlow.meanActualIntervalTicks / 1000).toFixed(3)} s actual · ${(result.metrics.releaseFlow.meanReleaseDelayTicks / 1000).toFixed(3)} s mean delay · ${result.metrics.releaseFlow.pending} pending`,
      `Release control: ${result.metrics.releaseFlow.control}${result.metrics.releaseFlow.maximumWip === null ? "" : ` max ${result.metrics.releaseFlow.maximumWip} / reopen ${result.metrics.releaseFlow.reopenAtWip} / ${result.metrics.releaseFlow.dispatch}${result.metrics.releaseFlow.maximumReleaseDelayPolicyTicks === null ? "" : ` / max delay ${(result.metrics.releaseFlow.maximumReleaseDelayPolicyTicks / 1000).toFixed(3)} s`}`} · ${result.metrics.releaseFlow.peakActiveLots} peak active · ${result.metrics.releaseFlow.controlBlockedLots} control-blocked lots / ${(result.metrics.releaseFlow.controlBlockedTicks / 1000).toFixed(3)} lot-s · ${result.metrics.releaseFlow.serviceLevelOpenings} service openings`,
      `Lot time: ${(result.metrics.lotFlow.meanQueueTimeTicks / 1000).toFixed(3)} s queue · ${(result.metrics.lotFlow.meanProcessTimeTicks / 1000).toFixed(3)} s processing · ${(result.metrics.lotFlow.meanTransportTimeTicks / 1000).toFixed(3)} s transport · ${(result.metrics.lotFlow.meanTardinessTicks / 1000).toFixed(3)} s tardiness`,
      `Quality: ${(result.metrics.qualityFlow.goodYield * 100).toFixed(1)}% good yield · ${(result.metrics.qualityFlow.firstPassYield * 100).toFixed(1)}% first-pass · ${result.metrics.qualityFlow.totalInspections} inspections · ${result.metrics.qualityFlow.totalReworkCycles} rework · ${result.metrics.qualityFlow.scrapDispositions} scrap dispositions · ${result.metrics.qualityFlow.escapedDefects} escapes`,
      ...(result.metrics.lotOutputFlow.jobs ? [`Lot-derived output: ${result.metrics.lotOutputFlow.actualUnits}/${result.metrics.lotOutputFlow.nominalUnits} units · ${(result.metrics.lotOutputFlow.outputRatio * 100).toFixed(1)}% realization · ${result.metrics.lotOutputFlow.lostUnits} lost · ${Object.entries(result.metrics.lotOutputFlow.processes).map(([process, flow]) => `${process}=${flow.actualUnits}/${flow.nominalUnits} (${Object.entries(flow.profiles).map(([profile, jobs]) => `${profile}:${jobs}`).join(", ")})`).join(" · ")}`] : []),
      ...Object.entries(result.metrics.routeFlow).flatMap(([route, flow]) => [
        `Route ${route}: ${flow.transitions} transitions · ${flow.reentrantTransitions} re-entrant · ${flow.completed} complete · ${flow.scrapped} scrap · ${flow.inProgress} in progress · ${flow.queueTimeViolations} Q-time violations across ${flow.violatedLots} lots`,
        ...Object.entries(flow.steps).filter(([, step]) => step.queueTimeMaximumTicks !== null).map(([stepId, step]) =>
          `  Q-time ${stepId}: ${(step.meanQueueTicks / 1000).toFixed(3)} s mean · ${(step.maximumQueueTicks / 1000).toFixed(3)} s max / ${(step.queueTimeMaximumTicks! / 1000).toFixed(3)} s window · ${step.queueTimeViolations} violations`),
      ]),
      ...(result.metrics.batchFlow.batchOperations ? [`Batch processing: ${result.metrics.batchFlow.jobs} jobs · ${result.metrics.batchFlow.lots} lots · ${result.metrics.batchFlow.averageLotsPerJob.toFixed(2)} lots/job · ${(result.metrics.batchFlow.meanQueueWaitTicksPerLot / 1000).toFixed(3)} s mean device wait/lot · ${result.metrics.batchFlow.formationHolds} formation holds / ${(result.metrics.batchFlow.formationHoldTicks / 1000).toFixed(3)} s (${result.metrics.batchFlow.preferredReleases} full-batch / ${result.metrics.batchFlow.timeoutReleases} timeout)`] : []),
    ] : []),
    `Equipment setup: ${result.metrics.equipmentSetups.totalChangeovers} changeovers · ${(result.metrics.equipmentSetups.totalSetupTicks / 1000).toFixed(3)} s work · ${result.metrics.equipmentSetups.totalCampaignHolds} campaign holds / ${(result.metrics.equipmentSetups.totalCampaignHoldTicks / 1000).toFixed(3)} s (${result.metrics.equipmentSetups.campaignMinimumLotReleases} lot-ready / ${result.metrics.equipmentSetups.campaignMaximumHoldReleases} timeout)${Object.entries(result.metrics.equipmentSetups.devices).length ? ` · ${Object.entries(result.metrics.equipmentSetups.devices).map(([device, setup]) => `${device}=${setup.group ?? "unconfigured"}/${setup.changeovers}`).join(", ")}` : ""}`,
    `Reusable tooling: ${result.metrics.productionTooling.totalAllocations} allocations / ${result.metrics.productionTooling.totalCompleted} completed / ${result.metrics.productionTooling.totalCancelled} cancelled · ${(result.metrics.productionTooling.totalOccupiedTicks / 1000).toFixed(3)} equipment-s / ${(result.metrics.productionTooling.totalUnitTicks / 1000).toFixed(3)} unit-s · ${(result.metrics.productionTooling.totalInputWaitTicks / 1000).toFixed(3)} s wait / ${result.metrics.productionTooling.totalInputBlocks} blocks · ${Object.entries(result.metrics.productionTooling.resources).map(([resource, measured]) => `${resource}=${measured.unitsAllocated} allocations/${(measured.unitTicks / 1000).toFixed(3)} unit-s`).join(" · ") || "none"}`,
    `Facility utilities: ${result.metrics.productionUtilities.totalAllocations} jobs / ${result.metrics.productionUtilities.totalCompleted} completed / ${result.metrics.productionUtilities.totalCancelled} cancelled / ${result.metrics.productionUtilities.totalProviderInterruptions} provider trips · ${(result.metrics.productionUtilities.totalOccupiedTicks / 1000).toFixed(3)} job-s / ${(result.metrics.productionUtilities.totalUnitTicks / 1000).toFixed(3)} capacity-s · ${(result.metrics.productionUtilities.totalInputWaitTicks / 1000).toFixed(3)} s wait / ${result.metrics.productionUtilities.totalInputBlocks} blocks · ${Object.entries(result.metrics.productionUtilities.utilities).map(([utility, measured]) => `${utility}=${measured.unitsAllocated} units/${(measured.unitTicks / 1000).toFixed(3)} unit-s`).join(" · ") || "none"}`,
    `Equipment maintenance: ${result.metrics.equipmentMaintenance.totalCompleted} released (${result.metrics.equipmentMaintenance.totalAssetLimit} asset-limit / ${result.metrics.equipmentMaintenance.totalPlannedBoundary} planned-boundary / ${result.metrics.equipmentMaintenance.totalOpportunistic} opportunistic · ${result.metrics.equipmentMaintenance.totalUsageTriggered} usage / ${result.metrics.equipmentMaintenance.totalCalendarTriggered} calendar) · ${result.metrics.equipmentMaintenance.totalCancelled} service cancelled · ${(result.metrics.equipmentMaintenance.totalMaintenanceTicks / 1000).toFixed(3)} s equipment work / ${(result.metrics.equipmentMaintenance.totalServiceCrewTicks / 1000).toFixed(3)} crew-s · qualification ${result.metrics.equipmentMaintenance.totalQualificationCompleted} completed / ${result.metrics.equipmentMaintenance.totalQualificationCancelled} cancelled / ${(result.metrics.equipmentMaintenance.totalQualificationTicks / 1000).toFixed(3)} s / ${(result.metrics.equipmentMaintenance.totalQualificationCrewTicks / 1000).toFixed(3)} crew-s · ${(result.metrics.equipmentMaintenance.totalInputWaitTicks / 1000).toFixed(3)} s consumable wait / ${(result.metrics.equipmentMaintenance.totalCrewWaitTicks / 1000).toFixed(3)} s crew wait · service ${Object.entries(result.metrics.equipmentMaintenance.serviceConsumables).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "no consumables"} · qualification ${Object.entries(result.metrics.equipmentMaintenance.qualificationConsumables).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "no consumables"} · ${result.metrics.equipmentMaintenance.totalDriftedJobs} drifted jobs / ${result.metrics.equipmentMaintenance.totalDriftedLots} lots / ${result.metrics.equipmentMaintenance.totalDriftDefects} defects${Object.entries(result.metrics.equipmentMaintenance.devices).length ? ` · ${Object.entries(result.metrics.equipmentMaintenance.devices).map(([device, maintenance]) => `${device}=${maintenance.jobsSinceMaintenance} jobs/${(maintenance.qualificationAgeTicks / 1000).toFixed(1)} s age${maintenance.qualificationPending ? `/awaiting ${maintenance.qualificationPending.cause}` : ""}`).join(", ")}` : ""}`,
    `Equipment energy states: ${result.metrics.equipmentEnergyManagement.totalSleeps} sleeps / ${result.metrics.equipmentEnergyManagement.totalWakeups} wakeups · ${(result.metrics.equipmentEnergyManagement.totalSleepingTicks / 1000).toFixed(3)} equipment-s sleeping · ${(result.metrics.equipmentEnergyManagement.totalWakeTicks / 1000).toFixed(3)} equipment-s waking${Object.entries(result.metrics.equipmentEnergyManagement.devices).length ? ` · ${Object.entries(result.metrics.equipmentEnergyManagement.devices).map(([device, energy]) => `${device}=${energy.mode}/${energy.sleeps}/${energy.wakeups}`).join(", ")}` : ""}`,
    `Electricity cost: ${(result.metrics.electricityCosts.totalMicroCurrency / 1e6).toFixed(6)} currency · energy ${(result.metrics.electricityCosts.energyChargeMicroCurrency / 1e6).toFixed(6)} · demand ${(result.metrics.electricityCosts.demandChargeMicroCurrency / 1e6).toFixed(6)}${Object.entries(result.metrics.electricityCosts.regions).length ? ` · ${Object.entries(result.metrics.electricityCosts.regions).map(([region, cost]) => `${region}=${(cost.totalMicroCurrency / 1e6).toFixed(6)}@${(cost.peakDemandMilliWatts / 1e6).toFixed(3)}kW`).join(", ")}` : ""}`,
    `Belts: ${(result.metrics.beltCellUtilization * 100).toFixed(1)}% average occupancy · ${result.metrics.averageBlockedBeltItems.toFixed(2)} blocked items · ${result.metrics.peakBeltItems} peak items`,
    ...materialTreatmentSummary(result.metrics),
    "Measured transport flows:", ...flowLines,
    `Transport endpoints: ${(result.metrics.transportEnergyConsumedMilliJoules / 1_000).toFixed(3)} J consumed`,
    `High-speed carrier missions: ${result.metrics.highSpeedMissions}`,
    `Carrier missions / completed returns: ${result.metrics.carrierMissions} / ${result.metrics.carrierReturns}`,
    ...Object.entries(result.metrics.powerGrids).map(([grid, power]) => `Power ${grid}: generated ${(power.generatedMilliJoules / 1e6).toFixed(3)} MJ · demand ${(power.demandMilliJoules / 1e6).toFixed(3)} MJ · unserved ${(power.unservedMilliJoules / 1e6).toFixed(3)} MJ · satisfaction avg ${(power.averageSatisfactionPpm / 10_000).toFixed(1)}% / min ${(power.minimumSatisfactionPpm / 10_000).toFixed(1)}% · curtailed ${(power.curtailedMilliJoules / 1e6).toFixed(3)} MJ · peak deficit ${(power.peakDeficitMilliWatts / 1000).toFixed(3)} W · storage envelope ${(power.requiredStorageCapacityMilliJoules / 1e6).toFixed(3)} MJ`),
    ...Object.entries(result.metrics.energyStorage).filter(([, storage]) => storage.capacityMilliJoules > 0).map(([grid, storage]) => `Storage ${grid}: ${(storage.storedMilliJoules / 1e6).toFixed(3)}/${(storage.capacityMilliJoules / 1e6).toFixed(3)} MJ · charged ${(storage.chargedMilliJoules / 1e6).toFixed(3)} MJ · discharged ${(storage.dischargedMilliJoules / 1e6).toFixed(3)} MJ`),
    ...Object.entries(result.metrics.stationEnergy).map(([device, energy]) => `Station energy ${device}: ${(energy.storedMilliJoules / 1e6).toFixed(3)}/${(energy.capacityMilliJoules / 1e6).toFixed(3)} MJ · charge cap ${(energy.configuredChargeMilliWatts / 1000).toFixed(3)} W · charged ${(energy.chargedMilliJoules / 1e6).toFixed(3)} MJ · missions ${(energy.spentMilliJoules / 1e6).toFixed(3)} MJ`),
    `Result hash: ${result.resultHash}`, "",
    ].join("\n"), false);
  }
}

interface MetricAssertion { kind: "metric"; path: string; min?: number; max?: number; equals?: unknown }
interface EventAssertion { kind: "event"; type: FactoryEvent["type"]; present: boolean }
interface Fixture { name: string; world?: string; blueprint?: string; scenario?: string; objective?: string; seed?: number; untilTick?: number; assertions: Array<MetricAssertion | EventAssertion> }
function getPath(value: unknown, path: string): unknown { return path.split(".").reduce((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value); }
function assertFixture(fixture: Fixture, metrics: FactoryMetrics, events: FactoryEvent[]): string[] {
  const failures: string[] = [];
  for (const assertion of fixture.assertions) {
    if (assertion.kind === "event") {
      const present = events.some((event) => event.type === assertion.type);
      if (present !== assertion.present) failures.push(`event ${assertion.type} present=${present}, expected ${assertion.present}`);
    } else {
      const actual = getPath(metrics, assertion.path);
      if (typeof assertion.min === "number" && (!(typeof actual === "number") || actual < assertion.min)) failures.push(`${assertion.path}=${String(actual)}, expected >= ${assertion.min}`);
      if (typeof assertion.max === "number" && (!(typeof actual === "number") || actual > assertion.max)) failures.push(`${assertion.path}=${String(actual)}, expected <= ${assertion.max}`);
      if ("equals" in assertion && actual !== assertion.equals) failures.push(`${assertion.path}=${String(actual)}, expected ${String(assertion.equals)}`);
    }
  }
  return failures;
}

export async function testCommand(projectDir: string, options: OutputOptions): Promise<void> {
  const root = resolve(projectDir); const testDir = join(root, "tests");
  const files = (await readdir(testDir)).filter((file) => file.endsWith(".fixture.json") || file.endsWith(".fixture.yaml") || file.endsWith(".fixture.yml")).sort();
  if (!files.length) throw new Error(`No fixtures found in ${testDir}`);
  const results: Array<{ name: string; passed: boolean; failures: string[]; resultHash: string }> = [];
  for (const file of files) {
    const contents = await readFile(join(testDir, file), "utf8");
    const fixture = (file.endsWith(".json") ? JSON.parse(contents) : parseYaml(contents)) as Fixture;
    const project = await openFactoryProject(root, { world: fixture.world, blueprint: fixture.blueprint, scenario: fixture.scenario, objective: fixture.objective });
    const first = runUntil(project, undefined, { seed: fixture.seed ?? 0, ...(fixture.untilTick ? { untilTick: fixture.untilTick } : {}) });
    const second = runUntil(project, undefined, { seed: fixture.seed ?? 0, ...(fixture.untilTick ? { untilTick: fixture.untilTick } : {}) });
    const failures = assertFixture(fixture, first.metrics, first.events);
    if (first.resultHash !== second.resultHash) failures.push("determinism check failed: identical inputs produced different hashes");
    results.push({ name: fixture.name, passed: failures.length === 0, failures, resultHash: first.resultHash });
  }
  const passed = results.filter((result) => result.passed).length;
  const context = await projectDirectoryContext(root);
  if (options.json) {
    if (passed !== results.length) throw new CliCommandError("test.failed", `${results.length - passed} fixture(s) failed`, {
      context,
      issues: results.flatMap((result) => result.failures.map((message) => ({ path: result.name, code: "fixture.assertion", message }))),
    });
    writeSuccess("test", { passed, total: results.length, results }, { context });
  } else for (const result of results) write(`${result.passed ? "✓" : "✗"} ${result.name}${result.failures.length ? `\n  ${result.failures.join("\n  ")}` : ""}\n`, false);
  if (passed !== results.length) throw new Error(`${results.length - passed} fixture(s) failed`);
}

export async function runsCommand(projectDir: string, options: OutputOptions): Promise<void> {
  const runs = await listRuns(resolve(projectDir));
  if (options.json) writeSuccess("runs", { runs: runs.map((run) => ({ name: run.name, path: run.path, score: run.score, decision: run.manifest.decision, resultHash: run.manifest.resultHash })) }, { context: await projectDirectoryContext(projectDir) });
  else if (!runs.length) write("No completed runs.\n", false);
  else write(`${runs.map((run) => `${run.name.padEnd(52)} ${run.manifest.decision.padEnd(8)} score ${run.score.toFixed(3)}`).join("\n")}\n`, false);
}

export async function benchmarkCommand(projectDir: string, benchmarkId: string, options: { json: boolean; lock: boolean; section?: string }): Promise<void> {
  requireJsonSection("benchmark", options);
  if (options.lock) {
    if (options.section) throw new CliCommandError("cli.invalid-section", "--section is not supported with benchmark --lock.");
    const benchmark = await lockBlueprintBenchmark(projectDir, benchmarkId);
    if (options.json) writeSuccess("benchmark", { action: "lock", benchmark: benchmark.id, lock: benchmark.lock }, {
      context: await projectDirectoryContext(projectDir),
      artifacts: [{ kind: "benchmark-lock", id: benchmark.id, path: join(resolve(projectDir), "benchmarks", `${benchmark.id}.benchmark.json`), immutable: false }],
    });
    else write(`Locked Blueprint benchmark '${benchmark.id}' across ${benchmark.cases.length} deterministic case(s).\n`, false);
    return;
  }
  const operation = await evaluateBenchmarkOperation(projectDir, benchmarkId);
  const result = operation.data;
  if (options.json) {
    const data = sectionResult("benchmark", options, {
      summary: () => ({ action: "evaluate", benchmark: result.benchmark, name: result.name, baselineBlueprint: result.baselineBlueprint, candidateBlueprint: result.candidateBlueprint, baselineBlueprintHash: result.baselineBlueprintHash, candidateBlueprintHash: result.candidateBlueprintHash, baselineScore: result.baselineScore, candidateScore: result.candidateScore, scoreDelta: result.scoreDelta, verdict: result.verdict, accepted: result.accepted, reasons: result.reasons, totalSimulationTicks: result.totalSimulationTicks, caseCount: result.cases.length, patchOperations: result.patch.length, semanticChanges: result.changes.length }),
      cases: () => result.cases,
      changes: () => ({ patch: result.patch, changes: result.changes }),
      all: () => ({ action: "evaluate", ...result }),
    });
    writeSuccess("benchmark", { ...data, operation: operationMetadata(operation) }, { context: operationProjectContext(operation.context), diagnostics: result.reasons }); return;
  }
  write([
    `${result.name} · coding-agent Blueprint benchmark`,
    `BASELINE ${result.baselineBlueprint} ${result.baselineBlueprintHash.slice(0, 12)} → CANDIDATE ${result.candidateBlueprint} ${result.candidateBlueprintHash.slice(0, 12)}`,
    `Fixed work: ${result.cases.length} cases · ${result.totalSimulationTicks} simulated ticks (baseline + candidate)`, "",
    ...result.cases.flatMap((item) => [
      `  ${item.id.padEnd(24)} ${item.baselineScore.toFixed(3).padStart(10)} → ${item.candidateScore.toFixed(3).padStart(10)}  Δ ${signed(item.scoreDelta)}  ×${item.weight}  ${item.candidateCapacityReady ? "READY" : `${item.candidateCapacityGaps.length} GAPS`}`,
      `    contracts ${(item.baselineMetrics.contractFulfillment * 100).toFixed(1)}% / ${item.baselineMetrics.deliveryNetValuePerMinute.toFixed(3)} net/min / ${item.baselineMetrics.deliveryOverflow.toFixed(3)} overflow → ${(item.candidateMetrics.contractFulfillment * 100).toFixed(1)}% / ${item.candidateMetrics.deliveryNetValuePerMinute.toFixed(3)} / ${item.candidateMetrics.deliveryOverflow.toFixed(3)}`,
      ...(item.baselineMetrics.completedLots || item.candidateMetrics.completedLots ? [
        `    lots ${item.baselineMetrics.completedLots}/${item.baselineMetrics.onTimeLots} complete/on-time → ${item.candidateMetrics.completedLots}/${item.candidateMetrics.onTimeLots} · mean cycle ${(item.baselineMetrics.meanCycleTimeTicks / 1000).toFixed(3)} → ${(item.candidateMetrics.meanCycleTimeTicks / 1000).toFixed(3)} s · tardiness ${(item.baselineMetrics.meanTardinessTicks / 1000).toFixed(3)} → ${(item.candidateMetrics.meanTardinessTicks / 1000).toFixed(3)} s`,
        `    release ${item.baselineMetrics.releasedLots}/${item.baselineMetrics.scheduledLots} released · ${(item.baselineMetrics.meanActualReleaseIntervalTicks / 1000).toFixed(3)} s interval / ${(item.baselineMetrics.meanReleaseDelayTicks / 1000).toFixed(3)} s delay → ${item.candidateMetrics.releasedLots}/${item.candidateMetrics.scheduledLots} · ${(item.candidateMetrics.meanActualReleaseIntervalTicks / 1000).toFixed(3)} s / ${(item.candidateMetrics.meanReleaseDelayTicks / 1000).toFixed(3)} s`,
        `    release control peak ${item.baselineMetrics.peakActiveLots} / ${item.baselineMetrics.controlBlockedLots} blocked / ${(item.baselineMetrics.controlBlockedTicks / 1000).toFixed(3)} lot-s → ${item.candidateMetrics.peakActiveLots} / ${item.candidateMetrics.controlBlockedLots} / ${(item.candidateMetrics.controlBlockedTicks / 1000).toFixed(3)} lot-s`,
        `    service openings ${item.baselineMetrics.serviceLevelOpenings} → ${item.candidateMetrics.serviceLevelOpenings}`,
        `    quality ${(item.baselineMetrics.goodYield * 100).toFixed(1)}% good / ${(item.baselineMetrics.firstPassYield * 100).toFixed(1)}% FP / ${item.baselineMetrics.qualityEscapes} escapes / ${item.baselineMetrics.reworkCycles} rework → ${(item.candidateMetrics.goodYield * 100).toFixed(1)}% / ${(item.candidateMetrics.firstPassYield * 100).toFixed(1)}% / ${item.candidateMetrics.qualityEscapes} / ${item.candidateMetrics.reworkCycles}`,
        ...(item.baselineMetrics.lotOutputJobs || item.candidateMetrics.lotOutputJobs ? [`    lot output ${(item.baselineMetrics.lotOutputRatio * 100).toFixed(1)}% / ${item.baselineMetrics.lotOutputLostUnits} lost → ${(item.candidateMetrics.lotOutputRatio * 100).toFixed(1)}% / ${item.candidateMetrics.lotOutputLostUnits}`] : []),
        `    Q-time ${item.baselineMetrics.queueTimeViolations} violations / ${item.baselineMetrics.queueTimeViolatedLots} lots / ${(item.baselineMetrics.maximumQueueTimeOverrunTicks / 1000).toFixed(3)} s max overrun → ${item.candidateMetrics.queueTimeViolations} / ${item.candidateMetrics.queueTimeViolatedLots} / ${(item.candidateMetrics.maximumQueueTimeOverrunTicks / 1000).toFixed(3)} s`,
        ...(item.baselineMetrics.batchJobs || item.candidateMetrics.batchJobs ? [`    batch ${item.baselineMetrics.batchJobs} jobs / ${item.baselineMetrics.averageLotsPerBatch.toFixed(2)} lots/job / ${(item.baselineMetrics.meanBatchQueueWaitTicksPerLot / 1000).toFixed(3)} s wait → ${item.candidateMetrics.batchJobs} / ${item.candidateMetrics.averageLotsPerBatch.toFixed(2)} / ${(item.candidateMetrics.meanBatchQueueWaitTicksPerLot / 1000).toFixed(3)} s`] : []),
        ...(item.baselineMetrics.batchFormationHolds || item.candidateMetrics.batchFormationHolds ? [`    batch formation ${item.baselineMetrics.batchFormationHolds} holds / ${(item.baselineMetrics.batchFormationHoldTicks / 1000).toFixed(3)} s / ${item.baselineMetrics.batchPreferredReleases} full / ${item.baselineMetrics.batchTimeoutReleases} timeout → ${item.candidateMetrics.batchFormationHolds} / ${(item.candidateMetrics.batchFormationHoldTicks / 1000).toFixed(3)} / ${item.candidateMetrics.batchPreferredReleases} / ${item.candidateMetrics.batchTimeoutReleases}`] : []),
        `    setup ${item.baselineMetrics.totalChangeovers} changeovers / ${(item.baselineMetrics.totalSetupTicks / 1000).toFixed(3)} s → ${item.candidateMetrics.totalChangeovers} / ${(item.candidateMetrics.totalSetupTicks / 1000).toFixed(3)} s`,
        `    campaigns ${item.baselineMetrics.totalCampaignHolds} holds / ${(item.baselineMetrics.totalCampaignHoldTicks / 1000).toFixed(3)} s → ${item.candidateMetrics.totalCampaignHolds} / ${(item.candidateMetrics.totalCampaignHoldTicks / 1000).toFixed(3)} s`,
        `    tooling ${item.baselineMetrics.totalToolingAllocations} allocations / ${item.baselineMetrics.totalToolingCompleted} complete / ${item.baselineMetrics.totalToolingCancelled} cancelled / ${(item.baselineMetrics.totalToolingUnitTicks / 1000).toFixed(3)} unit-s / ${(item.baselineMetrics.totalToolingInputWaitTicks / 1000).toFixed(3)} s wait → ${item.candidateMetrics.totalToolingAllocations} / ${item.candidateMetrics.totalToolingCompleted} / ${item.candidateMetrics.totalToolingCancelled} / ${(item.candidateMetrics.totalToolingUnitTicks / 1000).toFixed(3)} / ${(item.candidateMetrics.totalToolingInputWaitTicks / 1000).toFixed(3)}`,
        `    utilities ${item.baselineMetrics.totalUtilityAllocations} jobs / ${item.baselineMetrics.totalUtilityCompleted} complete / ${item.baselineMetrics.totalUtilityCancelled} cancelled / ${item.baselineMetrics.totalUtilityProviderInterruptions} provider trips / ${(item.baselineMetrics.totalUtilityUnitTicks / 1000).toFixed(3)} capacity-s / ${(item.baselineMetrics.totalUtilityInputWaitTicks / 1000).toFixed(3)} s wait → ${item.candidateMetrics.totalUtilityAllocations} / ${item.candidateMetrics.totalUtilityCompleted} / ${item.candidateMetrics.totalUtilityCancelled} / ${item.candidateMetrics.totalUtilityProviderInterruptions} / ${(item.candidateMetrics.totalUtilityUnitTicks / 1000).toFixed(3)} / ${(item.candidateMetrics.totalUtilityInputWaitTicks / 1000).toFixed(3)}`,
        `    maintenance ${item.baselineMetrics.totalAssetLimitMaintenance} asset-limit / ${item.baselineMetrics.totalPlannedBoundaryMaintenance} planned / ${item.baselineMetrics.totalOpportunisticMaintenance} opportunistic / ${(item.baselineMetrics.totalMaintenanceTicks / 1000).toFixed(3)} s → ${item.candidateMetrics.totalAssetLimitMaintenance} / ${item.candidateMetrics.totalPlannedBoundaryMaintenance} / ${item.candidateMetrics.totalOpportunisticMaintenance} / ${(item.candidateMetrics.totalMaintenanceTicks / 1000).toFixed(3)} s`,
        `    maintenance triggers ${item.baselineMetrics.totalUsageTriggeredMaintenance} usage / ${item.baselineMetrics.totalCalendarTriggeredMaintenance} calendar → ${item.candidateMetrics.totalUsageTriggeredMaintenance} / ${item.candidateMetrics.totalCalendarTriggeredMaintenance}`,
        `    energy states ${item.baselineMetrics.totalEquipmentSleeps} sleeps / ${item.baselineMetrics.totalEquipmentWakeups} wakes / ${(item.baselineMetrics.totalEquipmentSleepingTicks / 1000).toFixed(3)} sleep-s / ${(item.baselineMetrics.totalEquipmentWakeTicks / 1000).toFixed(3)} wake-s → ${item.candidateMetrics.totalEquipmentSleeps} / ${item.candidateMetrics.totalEquipmentWakeups} / ${(item.candidateMetrics.totalEquipmentSleepingTicks / 1000).toFixed(3)} / ${(item.candidateMetrics.totalEquipmentWakeTicks / 1000).toFixed(3)}`,
        `    electricity ${(item.baselineMetrics.electricityEnergyChargeMicroCurrency / 1e6).toFixed(6)} energy + ${(item.baselineMetrics.electricityDemandChargeMicroCurrency / 1e6).toFixed(6)} demand → ${(item.candidateMetrics.electricityEnergyChargeMicroCurrency / 1e6).toFixed(6)} + ${(item.candidateMetrics.electricityDemandChargeMicroCurrency / 1e6).toFixed(6)} currency`,
        `    qualification ${item.baselineMetrics.totalQualificationCompleted} complete / ${item.baselineMetrics.totalQualificationCancelled} cancelled / ${(item.baselineMetrics.totalQualificationTicks / 1000).toFixed(3)} s → ${item.candidateMetrics.totalQualificationCompleted} / ${item.candidateMetrics.totalQualificationCancelled} / ${(item.candidateMetrics.totalQualificationTicks / 1000).toFixed(3)} s`,
        `    service wait ${(item.baselineMetrics.totalMaintenanceInputWaitTicks / 1000).toFixed(3)} s input / ${(item.baselineMetrics.totalMaintenanceCrewWaitTicks / 1000).toFixed(3)} s crew / ${(item.baselineMetrics.totalMaintenanceServiceCrewTicks / 1000).toFixed(3)} crew-s → ${(item.candidateMetrics.totalMaintenanceInputWaitTicks / 1000).toFixed(3)} / ${(item.candidateMetrics.totalMaintenanceCrewWaitTicks / 1000).toFixed(3)} / ${(item.candidateMetrics.totalMaintenanceServiceCrewTicks / 1000).toFixed(3)}`,
        `    qualification crew ${(item.baselineMetrics.totalMaintenanceQualificationCrewTicks / 1000).toFixed(3)} crew-s → ${(item.candidateMetrics.totalMaintenanceQualificationCrewTicks / 1000).toFixed(3)} crew-s`,
        `    drift ${item.baselineMetrics.totalDriftedJobs} jobs / ${item.baselineMetrics.totalDriftedLots} lots / ${item.baselineMetrics.totalDriftDefects} defects → ${item.candidateMetrics.totalDriftedJobs} / ${item.candidateMetrics.totalDriftedLots} / ${item.candidateMetrics.totalDriftDefects}`,
      ] : []),
    ]),
    "",
    `baseline_score: ${result.baselineScore.toFixed(6)}`,
    `benchmark_score: ${result.candidateScore.toFixed(6)}`,
    `score_delta: ${signed(result.scoreDelta, 6)}`,
    `worst_case_baseline_score: ${result.worstCaseBaselineScore.toFixed(6)}`,
    `worst_case_benchmark_score: ${result.worstCaseCandidateScore.toFixed(6)}`,
    `minimum_case_score_delta: ${signed(result.minimumCaseScoreDelta, 6)}`,
    `patch_operations: ${result.patch.length}`,
    `semantic_changes: ${result.changes.length}`,
    `verdict: ${result.verdict}`,
    ...result.reasons.map((reason) => `gate: ${reason}`), "",
  ].join("\n"), false);
}

export async function candidateCommand(projectDir: string, candidateId: string, options: { json: boolean; apply: boolean; section?: string }): Promise<void> {
  requireJsonSection("candidate", options);
  const previewOperation = await previewCandidateOperation(projectDir, candidateId);
  const preview = previewOperation.data;
  if (options.apply) {
    const operation = await applyCandidateOperation(projectDir, candidateId, preview);
    const applied = operation.data;
    if (options.json) { const data = sectionResult("candidate", options, {
      summary: () => ({ action: "apply", candidate: applied.candidate.id, benchmark: applied.candidate.benchmark, proposalHash: applied.proposalHash, currentCandidateHash: applied.currentCandidateHash, proposedCandidateHash: applied.proposedCandidateHash, verdict: applied.result.verdict, scoreDelta: applied.result.scoreDelta, applied: true, blueprintPath: applied.blueprintPath }),
      proposal: () => ({ action: "apply", candidate: applied.candidate, proposalHash: applied.proposalHash, currentCandidateHash: applied.currentCandidateHash, proposedCandidateHash: applied.proposedCandidateHash, blueprintPath: applied.blueprintPath }),
      evaluation: () => applied.result,
      all: () => ({ action: "apply", ...applied }),
    }); writeSuccess("candidate", { ...data, operation: operationMetadata(operation) }, {
      context: operationProjectContext(operation.context), diagnostics: applied.result.reasons,
      artifacts: [
        ...previewOperation.artifacts.map((artifact) => ({ kind: "candidate-review" as const, id: artifact.id, path: artifact.path, immutable: artifact.immutable })),
        ...operation.artifacts.map((artifact) => ({ kind: "blueprint" as const, id: artifact.id, path: artifact.path, immutable: artifact.immutable })),
      ],
    }); return; }
    write([
      `Applied candidate '${applied.candidate.id}' to ${applied.blueprintPath}`,
      `Reviewed ${applied.currentCandidateHash.slice(0, 12)} → ${applied.proposedCandidateHash.slice(0, 12)} · ${applied.result.verdict} · Δ ${signed(applied.result.scoreDelta, 6)}`,
      "The proposal is now stale by design and cannot be applied twice.", "",
    ].join("\n"), false);
    return;
  }
  if (options.json) { const data = sectionResult("candidate", options, {
    summary: () => ({ action: "preview", candidate: preview.candidate.id, benchmark: preview.candidate.benchmark, hypothesis: preview.candidate.hypothesis, proposalHash: preview.proposalHash, currentCandidateHash: preview.currentCandidateHash, proposedCandidateHash: preview.proposedCandidateHash, verdict: preview.result.verdict, scoreDelta: preview.result.scoreDelta, reasons: preview.result.reasons, patchOperations: preview.candidate.patch.length, semanticChanges: preview.result.changes.length }),
    proposal: () => ({ action: "preview", candidate: preview.candidate, proposalHash: preview.proposalHash, currentCandidateHash: preview.currentCandidateHash, proposedCandidateHash: preview.proposedCandidateHash }),
    evaluation: () => preview.result,
    all: () => ({ action: "preview", ...preview }),
  }); writeSuccess("candidate", { ...data, operation: operationMetadata(previewOperation) }, {
    context: operationProjectContext(previewOperation.context), diagnostics: preview.result.reasons,
    artifacts: previewOperation.artifacts.map((artifact) => ({ kind: "candidate-review" as const, id: artifact.id, path: artifact.path, immutable: artifact.immutable })),
    nextActions: preview.result.verdict === "KEEP" ? [nextAction(
      "candidate.apply", "Re-evaluate and apply this exact Candidate under all hash guards.",
      ["inm", "candidate", resolve(projectDir), "--candidate", preview.candidate.id, "--apply", "--json"], "mutates-project",
    )] : [],
  }); return; }
  write([
    `${preview.candidate.name} · candidate change set`,
    `${preview.candidate.benchmark} · ${preview.currentCandidateHash.slice(0, 12)} → ${preview.proposedCandidateHash.slice(0, 12)}`,
    `Hypothesis: ${preview.candidate.hypothesis}`,
    `Patch: ${preview.candidate.patch.length} authored ops · ${preview.result.changes.length} semantic changes`,
    `Score: ${preview.result.baselineScore.toFixed(6)} → ${preview.result.candidateScore.toFixed(6)} · Δ ${signed(preview.result.scoreDelta, 6)}`,
    `Verdict: ${preview.result.verdict}`,
    ...preview.result.reasons.map((reason) => `Gate: ${reason}`),
    "",
    `Apply only this reviewed result: inm candidate <path> --candidate ${preview.candidate.id} --apply`, "",
  ].join("\n"), false);
}

export async function researchCommand(projectDir: string, selection: ProjectSelection, options: { iterations: number; seed: number; json: boolean; section?: string; agentCommand?: string }): Promise<void> {
  requireJsonSection("research", options);
  const inputProject = await openFactoryProject(projectDir, selection);
  const result = await researchFactory(projectDir, { ...selection, iterations: options.iterations, seed: options.seed, ...(options.agentCommand ? { agent: new ExternalCommandResearchAgent(options.agentCommand) } : {}) });
  const summary = {
    baseline: { run: result.baseline.path, score: result.baseline.score }, bestScore: result.bestScore,
    iterations: result.iterations.map((item) => ({ iteration: item.iteration, decision: item.decision, previousScore: item.previousScore, score: item.score, run: item.run.path, hypothesis: item.proposal.hypothesis })),
  };
  if (options.json) writeSuccess("research", sectionResult("research", options, {
    summary: () => ({ baseline: summary.baseline, bestScore: summary.bestScore, iterations: summary.iterations.length, kept: summary.iterations.filter((iteration) => iteration.decision === "KEEP").length }),
    iterations: () => summary.iterations,
    all: () => summary,
  }), {
    context: compiledProjectContext(inputProject),
    artifacts: [result.baseline, ...result.iterations.map((iteration) => iteration.run)].map((run) => ({ kind: "run" as const, id: run.name, path: run.path, immutable: true })),
  });
  else write([
    `000 baseline  score ${summary.baseline.score.toFixed(3)}`,
    ...summary.iterations.map((item) => `${String(item.iteration).padStart(3, "0")} ${item.hypothesis.slice(0, 45).padEnd(45)} score ${item.score.toFixed(3)} ${item.decision}`),
    `Best score: ${summary.bestScore.toFixed(3)}`, "",
  ].join("\n"), false);
}

export async function designCommand(projectDir: string, programId: string | undefined, options: { run: boolean; runId?: string; continue: boolean; promote?: string; maxCandidates?: number; progress?: string; json: boolean; section?: string }): Promise<void> {
  requireJsonSection("design", options);
  if (options.progress !== undefined && !["off", "human", "ndjson"].includes(options.progress)) throw new CliCommandError(
    "design.invalid-progress",
    `Unknown Design progress mode '${options.progress}'. Expected one of: off, human, ndjson.`,
  );
  const executing = options.run || options.continue;
  if (options.progress !== undefined && !executing) throw new CliCommandError("design.run-required", "--progress requires --run or --continue.");
  if (!programId) {
    if (options.run || options.runId || options.continue || options.promote) throw new CliCommandError("design.program-required", "--run, --run-id, --continue, and --promote require --program <id>.");
    if (options.maxCandidates !== undefined) throw new CliCommandError("design.program-required", "--max-candidates requires --program <id> with --run or --continue.");
    rejectSection("design", options);
    const programs = await listDesignPrograms(projectDir);
    if (options.json) writeSuccess("design", { action: "list", programs }, { context: await projectDirectoryContext(projectDir) });
    else write([
      "Design Programs",
      ...(programs.length ? programs.map((program) => `  ${program.id.padEnd(24)} ${program.locked ? "LOCKED" : "UNLOCKED"} · ${program.budget.maxCandidates} candidates · ${program.name}`) : ["  none"]),
      "",
    ].join("\n"), false);
    return;
  }
  if (options.maxCandidates !== undefined && !executing) throw new CliCommandError("design.run-required", "--max-candidates requires --run or --continue.");
  if (options.run && options.runId) throw new CliCommandError("design.mode-conflict", "--run and --run-id select different Design modes.");
  if (options.continue && !options.runId) throw new CliCommandError("design.run-id-required", "--continue requires --run-id <hash>.");
  if (options.continue && options.run) throw new CliCommandError("design.mode-conflict", "--continue extends --run-id and cannot be combined with --run.");
  if (options.continue && options.promote) throw new CliCommandError("design.mode-conflict", "--continue and --promote select different Design operations.");
  if (options.promote && !options.runId) throw new CliCommandError("design.run-id-required", "--promote requires --run-id <hash>.");
  const brief = await buildDesignProgramBrief(projectDir, programId);
  const seedLabel = brief.program.seed.kind === "synthesis"
    ? `synthesize ${brief.program.seed.inputBlueprint}`
    : `Blueprint ${brief.program.seed.blueprint}`;
  const context = {
    scope: "project" as const,
    project: { ...brief.project },
    selection: { ...brief.driver.selection },
    hashes: { ...brief.driver.hashes },
  };
  const emitExecutedRun = (result: DesignRunResult, action: "run" | "continue"): void => {
    const data = sectionResult("design", options, {
      summary: () => ({
        action,
        program: result.manifest.program,
        benchmark: result.manifest.benchmark,
        seed: result.manifest.seed,
        promotionBase: result.manifest.promotionBase,
        continuation: result.manifest.continuation,
        budget: result.manifest.budget,
        best: result.manifest.best,
        stopReason: result.manifest.stopReason,
        resultHash: result.manifest.resultHash,
      }),
      static: () => brief.staticEvidence,
      iterations: () => result.manifest.iterations,
      frontier: () => ({ ...result.manifest.frontier, exhaustions: result.manifest.exhaustions }),
      best: () => ({ ...result.manifest.best, blueprint: result.bestBlueprint }),
      all: () => result.manifest,
    });
    if (options.json) writeSuccess("design", data, {
      context,
      artifacts: [{ kind: "design-run", id: result.artifact.id, path: result.artifact.path, immutable: true }],
      nextActions: [nextAction(
        `design.open:${result.manifest.resultHash}`,
        "Reopen this immutable Design Run by its content hash.",
        ["inm", "design", brief.project.rootDir, "--program", programId, "--run-id", result.manifest.resultHash, "--json"],
      )],
    });
    else write([
      `${brief.program.name} · Design Run`,
      `Result: ${result.manifest.resultHash}`,
      ...(result.manifest.continuation ? [`Continued from: ${result.manifest.continuation.sourceResultHash} · reused ${result.manifest.continuation.reusedIterations} iterations · +${result.manifest.continuation.additionalCandidateBudget} candidate budget`] : []),
      `Evaluated: ${result.manifest.budget.evaluated}/${result.manifest.budget.maximum} · ${result.manifest.stopReason}`,
      `Best: iteration ${result.manifest.best.iteration} · score ${result.manifest.best.candidateScore.toFixed(6)} · Δ ${signed(result.manifest.best.scoreDelta, 6)} · ${result.manifest.best.verdict}`,
      `Frontier: leader ${result.manifest.frontier.leader} · ${result.manifest.frontier.alternatives.length}/${result.manifest.program.frontier.maximumAlternativeBranches} alternatives · ${result.manifest.frontier.scheduler.searchOrder.length} searchable · ${result.manifest.frontier.scheduler.exhausted.length} exhausted · next ${result.manifest.frontier.scheduler.searchOrder[0] ?? "none"}`,
      ...result.manifest.exhaustions.map(designExhaustionLine),
      ...result.manifest.iterations.map(designIterationLine),
      `Artifact: ${result.artifact.path}`, "",
    ].join("\n"), false);
  };
  if (options.runId) {
    if (options.continue) {
      const progressMode = (options.progress ?? (options.json ? "off" : "human")) as DesignProgressMode;
      const result = await continueDesignRun(projectDir, programId, options.runId, {
        ...(options.maxCandidates !== undefined ? { maxCandidates: options.maxCandidates } : {}),
        onProgress: (progress) => writeDesignProgress(progress, progressMode),
      });
      emitExecutedRun(result, "continue");
      return;
    }
    const result = await loadDesignRun(projectDir, programId, options.runId);
    if (options.promote) {
      rejectSection("design", options);
      const promoted = await promoteDesignRun(projectDir, programId, options.runId, options.promote);
      if (options.json) writeSuccess("design", {
        action: "promote",
        program: programId,
        run: options.runId,
        candidate: promoted.candidate,
      }, {
        context,
        artifacts: [{ kind: "candidate", id: promoted.candidate.id, path: promoted.path, immutable: true }],
        nextActions: [nextAction(
          `candidate.preview:${promoted.candidate.id}`,
          "Re-evaluate the exact promoted Candidate against its locked Benchmark before applying it.",
          ["inm", "candidate", brief.project.rootDir, "--candidate", promoted.candidate.id, "--json"],
          "creates-artifact",
        )],
      });
      else write([
        `${brief.program.name} · promoted Design Run`,
        `Run: ${options.runId}`,
        `Candidate: ${promoted.candidate.id}`,
        `Patch: ${promoted.candidate.patch.length} operations`,
        `Artifact: ${promoted.path}`,
        "",
        `Review: inm candidate <path> --candidate ${promoted.candidate.id}`,
        "",
      ].join("\n"), false);
      return;
    }
    const data = sectionResult("design", options, {
      summary: () => ({ action: "open", program: result.manifest.program, benchmark: result.manifest.benchmark, seed: result.manifest.seed, promotionBase: result.manifest.promotionBase, continuation: result.manifest.continuation, budget: result.manifest.budget, best: result.manifest.best, stopReason: result.manifest.stopReason, resultHash: result.manifest.resultHash }),
      static: () => brief.staticEvidence,
      iterations: () => result.manifest.iterations,
      frontier: () => ({ ...result.manifest.frontier, exhaustions: result.manifest.exhaustions }),
      best: () => ({ ...result.manifest.best, blueprint: result.bestBlueprint }),
      runs: () => [result.manifest],
      all: () => result.manifest,
    });
    const candidateId = `${programId}-${options.runId.slice(0, 8)}`;
    const nextActions: CliNextAction[] = [];
    if (result.manifest.stopReason === "budget-exhausted" && result.manifest.frontier.scheduler.searchOrder.length) nextActions.push(nextAction(
      `design.continue:${options.runId}`,
      `Continue this exact frontier with up to ${brief.program.budget.maxCandidates} additional Candidate evaluations.`,
      ["inm", "design", brief.project.rootDir, "--program", programId, "--run-id", options.runId, "--continue", "--max-candidates", String(brief.program.budget.maxCandidates), "--json"],
      "creates-artifact",
    ));
    if (result.manifest.best.verdict === "KEEP" && result.manifest.best.promotionPatchOperations > 0) nextActions.push(nextAction(
      `design.promote:${options.runId}`,
      "Create an immutable Candidate Change Set reproducing this accepted design from the current promotion base.",
      ["inm", "design", brief.project.rootDir, "--program", programId, "--run-id", options.runId, "--promote", candidateId, "--json"],
      "creates-artifact",
    ));
    if (options.json) writeSuccess("design", data, {
      context,
      artifacts: [{ kind: "design-run", id: result.artifact.id, path: result.artifact.path, immutable: true }],
      nextActions,
    });
    else write([
      `${brief.program.name} · Design Run`,
      `Result: ${result.manifest.resultHash}`,
      ...(result.manifest.continuation ? [`Continued from: ${result.manifest.continuation.sourceResultHash} · reused ${result.manifest.continuation.reusedIterations} iterations · +${result.manifest.continuation.additionalCandidateBudget} candidate budget`] : []),
      `Evaluated: ${result.manifest.budget.evaluated}/${result.manifest.budget.maximum} · ${result.manifest.stopReason}`,
      `Best: iteration ${result.manifest.best.iteration} · score ${result.manifest.best.candidateScore.toFixed(6)} · Δ ${signed(result.manifest.best.scoreDelta, 6)} · ${result.manifest.best.verdict}`,
      `Frontier: leader ${result.manifest.frontier.leader} · ${result.manifest.frontier.alternatives.length}/${result.manifest.program.frontier.maximumAlternativeBranches} alternatives · ${result.manifest.frontier.scheduler.searchOrder.length} searchable · ${result.manifest.frontier.scheduler.exhausted.length} exhausted · next ${result.manifest.frontier.scheduler.searchOrder[0] ?? "none"}`,
      ...result.manifest.exhaustions.map(designExhaustionLine),
      ...result.manifest.iterations.map(designIterationLine),
      `Artifact: ${result.artifact.path}`,
      ...(result.manifest.stopReason === "budget-exhausted" && result.manifest.frontier.scheduler.searchOrder.length ? ["", `Continue: inm design <path> --program ${programId} --run-id ${options.runId} --continue --max-candidates ${brief.program.budget.maxCandidates}`] : []),
      ...(result.manifest.best.verdict === "KEEP" && result.manifest.best.promotionPatchOperations > 0 ? ["", `Promote: inm design <path> --program ${programId} --run-id ${options.runId} --promote ${candidateId}`] : []),
      "",
    ].join("\n"), false);
    return;
  }
  if (!options.run) {
    const runs = await listDesignRuns(projectDir, programId);
    const data = sectionResult("design", options, {
      summary: () => ({ program: brief.program, benchmark: brief.benchmark, seed: brief.seed, promotionBase: brief.promotionBase, driver: brief.driver, staticEvidence: brief.staticEvidence }),
      static: () => brief.staticEvidence,
      iterations: () => [],
      frontier: () => ({ policy: brief.program.frontier, runs: runs.map((run) => ({ id: run.id, continuation: run.continuation, budget: run.budget, best: run.best, stopReason: run.stopReason })) }),
      best: () => null,
      runs: () => runs,
      all: () => ({ ...brief, runs }),
    });
    if (options.json) writeSuccess("design", data, {
      context,
      nextActions: [nextAction(
        `design.run:${programId}`,
        `Evaluate up to ${brief.program.budget.maxCandidates} bounded proposals through locked Benchmark '${brief.benchmark.id}'.`,
        ["inm", "design", brief.project.rootDir, "--program", programId, "--run", "--max-candidates", String(brief.program.budget.maxCandidates), "--json"],
        "creates-artifact",
      )],
    });
    else write([
      `${brief.program.name} · Design Program`,
      `${brief.program.id} · ${brief.benchmark.id} (${brief.benchmark.cases} locked cases)`,
      `Seed: ${seedLabel} · ${brief.seed.synthesis?.method ?? "authored"} · ${brief.seed.blueprintHash.slice(0, 12)}`,
      `Will update: ${brief.promotionBase.blueprint}@${brief.promotionBase.hash.slice(0, 12)} · driver ${brief.driver.case.id}`,
      `Provider: ${brief.program.proposal.kind}${brief.program.proposal.kind === "project-strategy" ? ` · ${brief.program.proposal.entry}` : ""}`,
      `Current-best guardrail: ${brief.program.currentBestGuardrail.kind}${brief.program.currentBestGuardrail.kind === "uniform" ? ` · max ${brief.program.currentBestGuardrail.maximumCaseScoreRegression.toFixed(6)} regression/case` : brief.program.currentBestGuardrail.kind === "case-specific" ? ` · ${Object.keys(brief.program.currentBestGuardrail.maximumCaseScoreRegression).length} case budgets` : ""}`,
      `Frontier: 1 leader + up to ${brief.program.frontier.maximumAlternativeBranches} alternative branch${brief.program.frontier.maximumAlternativeBranches === 1 ? "" : "es"}`,
      `Budget: ${brief.program.budget.maxCandidates} candidates · ${brief.program.proposal.decisionFamilies.join(" + ")}`,
      `Static: capacity ${brief.staticEvidence.capacity.state.toUpperCase()} · ${brief.staticEvidence.flow.warningCount} warnings · ${brief.staticEvidence.devices.declarative}/${brief.staticEvidence.devices.total} declarative Devices`,
      "",
      `Run: inm design <path> --program ${programId} --run`, "",
    ].join("\n"), false);
    return;
  }
  const progressMode = (options.progress ?? (options.json ? "off" : "human")) as DesignProgressMode;
  const result = await runDesignProgram(projectDir, programId, {
    ...(options.maxCandidates !== undefined ? { maxCandidates: options.maxCandidates } : {}),
    onProgress: (progress) => writeDesignProgress(progress, progressMode),
  });
  emitExecutedRun(result, "run");
}

export function formatCliError(error: unknown, json: boolean, command = "unknown"): string {
  if (error instanceof CliCommandError) return json
    ? `${stableStringify(cliError(command, error.code, error.message, error.options), 2)}\n`
    : `Error [${error.code}]: ${error.message}\n`;
  if (error instanceof CandidateChangeSetError) return json
    ? `${stableStringify(cliError(command, error.code, error.message, { hashes: error.hashes }), 2)}\n`
    : `Candidate error [${error.code}]: ${error.message}\n`;
  if (error instanceof DesignRunError) return json
    ? `${stableStringify(cliError(command, error.code, error.message, { hashes: error.hashes }), 2)}\n`
    : `Design error [${error.code}]: ${error.message}\n`;
  if (error instanceof InmValidationError) return json
    ? `${stableStringify(cliError(command, "validation.failed", "Project validation failed.", { issues: error.issues }), 2)}\n`
    : `Validation failed:\n${error.issues.map((issue) => `  ${issue.path} [${issue.code}] ${issue.message}`).join("\n")}\n`;
  const message = error instanceof Error ? error.message : String(error);
  const code = isCliUsageError(error) ? "cli.usage" : "runtime.failed";
  return json ? `${stableStringify(cliError(command, code, message), 2)}\n` : `Error: ${message}\n`;
}

export function isCliUsageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return message.startsWith("Usage:") || message.startsWith("Unknown command '") || code.startsWith("ERR_PARSE_ARGS_");
}
