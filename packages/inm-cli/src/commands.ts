import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  InmValidationError, WORKSPACE_MANIFEST, analyzeProduction, atomicWriteJson, compareFactoryBlueprints, compileFactoryProject, evaluateBlueprintBenchmark, findCachedRun, listRuns, listWorkspaceProjects, loadFactoryProject, loadWorkspace, lockBlueprintBenchmark, openFactoryProject, pathExists,
  planProductionCapacity,
  researchFactory, runUntil, stableStringify, synthesizeFactoryBlueprint, writeRunArtifact, ExternalCommandResearchAgent,
  type FactoryEvent, type FactoryMetrics, type InmManifest, type InmWorkspaceManifest, type ProjectSelection,
} from "@inm/core";

export interface OutputOptions { json?: boolean }
const write = (value: unknown, json: boolean) => process.stdout.write(json ? `${stableStringify(value, 2)}\n` : String(value));

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
  if (options.json) write({ command: "workspace.init", workspaceDir: target, manifest }, true);
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
  if (options.json) write({ command: "project.create", workspaceDir: workspace.rootDir, projectDir: target, id, name: projectManifest.name, isDefault: workspace.manifest.defaultProject === id }, true);
  else write(`Created project '${id}' at ${target}${workspace.manifest.defaultProject === id ? " (default)" : ""}\n`, false);
}

export async function projectListCommand(workspaceDir: string, options: OutputOptions): Promise<void> {
  const workspace = await loadWorkspace(workspaceDir); const projects = await listWorkspaceProjects(workspace.rootDir);
  if (options.json) write({ workspace: workspace.manifest.name, workspaceDir: workspace.rootDir, defaultProject: workspace.manifest.defaultProject, projects }, true);
  else if (!projects.length) write(`No projects in ${workspace.rootDir}\n`, false);
  else write(`${projects.map((project) => `${project.isDefault ? "*" : " "} ${project.id.padEnd(24)} ${project.name}  ${project.path}`).join("\n")}\n`, false);
}

export async function projectDefaultCommand(workspaceDir: string, id: string, options: OutputOptions): Promise<void> {
  const workspace = await loadWorkspace(workspaceDir); const projects = await listWorkspaceProjects(workspace.rootDir);
  if (!projects.some((project) => project.id === id)) throw new Error(`Unknown workspace project '${id}'`);
  workspace.manifest.defaultProject = id;
  await atomicWriteJson(join(workspace.rootDir, WORKSPACE_MANIFEST), workspace.manifest);
  if (options.json) write({ command: "project.default", workspaceDir: workspace.rootDir, defaultProject: id }, true);
  else write(`Default project is now '${id}'\n`, false);
}

export async function validateCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const summary = {
    valid: true, project: project.manifest.name, blueprintHash: project.hashes.blueprintHash,
    regions: Object.keys(project.regions).length,
    resourceNodes: Object.keys(project.resourceNodes).length,
    devices: Object.keys(project.devices).length,
    connections: Object.keys(project.connections).length,
    logisticsNetworks: Object.keys(project.logisticsNetworks).length,
    logisticsRoutes: Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.routes.length, 0),
  };
  if (options.json) write(summary, true);
  else write(`✓ ${summary.project}: valid (${summary.regions} ${summary.regions === 1 ? "region" : "regions"}, ${summary.resourceNodes} finite resource ${summary.resourceNodes === 1 ? "node" : "nodes"}, ${summary.devices} devices, ${summary.connections} local connections, ${summary.logisticsNetworks} station ${summary.logisticsNetworks === 1 ? "network" : "networks"} / ${summary.logisticsRoutes} ${summary.logisticsRoutes === 1 ? "route" : "routes"})\nWorld ${project.hashes.worldHash.slice(0, 12)} · Blueprint ${summary.blueprintHash.slice(0, 12)}\n`, false);
}

export async function inspectCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const runs = await listRuns(project.rootDir);
  const capabilityCounts: Record<string, number> = {};
  for (const device of Object.values(project.devices)) for (const capability of device.assetDef.capabilities) capabilityCounts[capability] = (capabilityCounts[capability] ?? 0) + 1;
  const summary = {
    name: project.manifest.name, rootDir: project.rootDir,
    world: { id: project.world.id, name: project.world.name },
    regions: project.world.regions.map((region) => ({ id: region.id, name: region.name, kind: region.kind, coordinates: region.coordinates, bounds: region.bounds })),
    resourceNodes: Object.values(project.resourceNodes).map((node) => ({ id: node.id, region: node.region, resource: node.resource, amount: node.amount, position: node.position })),
    resources: Object.keys(project.resources), processes: Object.keys(project.processes), deviceAssets: Object.keys(project.deviceAssets),
    deviceInstances: Object.keys(project.devices).length, capabilityCounts, connections: Object.keys(project.connections).length,
    logisticsNetworks: Object.keys(project.logisticsNetworks).length,
    logisticsRoutes: Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.routes.length, 0),
    scenario: { id: project.scenario.id, durationTicks: project.scenario.durationTicks }, objective: project.objective,
    hashes: project.hashes, runs: runs.map((run) => ({ name: run.name, score: run.score, decision: run.manifest.decision })),
  };
  if (options.json) write(summary, true);
  else write([
    `${summary.name}`, `Project: ${summary.rootDir}`, `World: ${summary.world.name} [${summary.world.id}] · ${summary.regions.length} ${summary.regions.length === 1 ? "region" : "regions"} · ${summary.resourceNodes.length} finite resource ${summary.resourceNodes.length === 1 ? "node" : "nodes"}`, `Blueprint: ${summary.deviceInstances} devices, ${summary.connections} local connections, ${summary.logisticsNetworks} station ${summary.logisticsNetworks === 1 ? "network" : "networks"} / ${summary.logisticsRoutes} ${summary.logisticsRoutes === 1 ? "route" : "routes"}`,
    `Regions: ${summary.regions.map((region) => `${region.name} [${region.id}] ${region.kind} @ (${region.coordinates.x},${region.coordinates.y},${region.coordinates.z}) ${region.bounds.width}×${region.bounds.height}`).join("; ")}`,
    `Resources: ${summary.resources.join(", ")}`, `Processes: ${summary.processes.join(", ")}`, `Capabilities: ${Object.entries(summary.capabilityCounts).map(([name, count]) => `${name}:${count}`).join(", ")}`, `Scenario: ${summary.scenario.id} (${summary.scenario.durationTicks} ticks)`,
    `Objective: ${summary.objective.name} → ${summary.objective.targetRatePerMinute} ${summary.objective.targetResource}/min @ ${summary.objective.targetRegion}`, `Runs: ${summary.runs.length}`, "",
  ].join("\n"), false);
}

export async function analyzeCommand(projectDir: string, selection: ProjectSelection, options: OutputOptions): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const analysis = analyzeProduction(project);
  if (options.json) {
    write({ project: project.manifest.name, blueprintHash: project.hashes.blueprintHash, ...analysis }, true);
    return;
  }
  const lines = [
    `${project.manifest.name} · nominal production analysis`,
    `Coverage: ${analysis.declarativeDevices} declarative industrial devices, ${analysis.opaqueDevices} opaque/boundary devices`,
    `Power allocation: ${analysis.powerAllocation}`,
    "",
    "Device rates",
    ...analysis.extractionDevices.map((device) => `  ${device.device.padEnd(24)} extract ${device.resource.padEnd(15)} ${device.itemsPerMinute.toFixed(3)} items/min from ${device.nodes.join(", ")} · P${device.powerPriority} · ${(device.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(device.powerMilliWatts / 1000).toFixed(3)} W active`),
    ...analysis.devices.flatMap((device) => [
      `  ${device.device.padEnd(24)} ${`${device.process}/${device.mode}`.padEnd(32)} ${device.cyclesPerMinute.toFixed(3)} jobs/min · P${device.powerPriority} · ${(device.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(device.powerMilliWatts / 1000).toFixed(3)} W active${device.minimumInputTreatmentLevel ? ` · inputs @${device.minimumInputTreatmentLevel}+` : ""}${device.setupGroup ? ` · setup ${device.setupGroup}${device.changeoverDurationTicks ? ` / ${device.changeoverDurationTicks} ms @ ${((device.changeoverPowerMilliWatts ?? 0) / 1000).toFixed(1)} W` : ""}` : ""}`,
      `    ports   ${Object.entries(device.inputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")}  ⇒  ${Object.entries(device.outputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")}`,
    ]),
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
    ...analysis.recipeOptions.filter((option) => !option.selected).map((option) => `  ${option.device.padEnd(24)} ${`${option.process}/${option.mode}`.padEnd(32)} ${option.targetOutputPerMinute.toFixed(3)} ${project.objective.targetResource}/min · P${option.powerPriority} · ${(option.idlePowerMilliWatts / 1000).toFixed(3)} W idle / ${(option.powerMilliWatts / 1000).toFixed(3)} W active${option.minimumInputTreatmentLevel ? ` · inputs @${option.minimumInputTreatmentLevel}+` : ""}  ${Object.entries(option.inputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")} ⇒ ${Object.entries(option.outputPorts).map(([resource, port]) => `${resource}→${port}`).join(" + ")}`),
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
  const project = await openFactoryProject(projectDir, selection);
  const plan = planProductionCapacity(project);
  if (options.json) {
    write({ command: "plan", project: project.manifest.name, blueprintHash: project.hashes.blueprintHash, objective: project.objective.id, ...plan }, true);
    return;
  }
  write([
    `${project.manifest.name} · target-rate capacity plan`,
    `Target: ${plan.targetRatePerMinute.toFixed(3)} ${plan.targetResource}/min · ${plan.targetItemsForScenario.toFixed(3)} items over ${plan.scenarioMinutes.toFixed(3)} min`,
    `Status: ${plan.ready ? "READY" : `${plan.gaps.length} GAP${plan.gaps.length === 1 ? "" : "S"}`}`, "",
    "Process capacity",
    ...plan.processes.map((process) => `  ${`${process.process}/${process.mode}`.padEnd(32)} ${Object.entries(process.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(3)} ${resource}/min`).join(" + ")}  ${process.configuredMachines}/${process.requiredMachines} ${process.asset}  primary capacity ${process.configuredCapacityPerMinute.toFixed(3)}/min${process.additionalMachines ? `  ADD ${process.additionalMachines}` : ""}`),
    "", "Treatment capacity",
    ...(plan.treatments.length ? plan.treatments.map((treatment) => `  ${`${treatment.process}/${treatment.treatmentMode}`.padEnd(32)} ${treatment.resource}@${treatment.minimumLevel}+ ${treatment.requiredItemsPerMinute.toFixed(3)}/min  ${treatment.configuredDevices}/${treatment.requiredDevices} ${treatment.asset}  agent ${treatment.requiredAgentPerMinute.toFixed(3)} ${treatment.agentResource}/min${treatment.additionalDevices ? `  ADD ${treatment.additionalDevices}` : ""}`) : ["  none"]),
    "", "Raw resources",
    ...plan.rawResources.map((resource) => `  ${resource.resource.padEnd(18)} need ${resource.totalDemandPerMinute.toFixed(3).padStart(8)}/min  extraction ${resource.configuredExtractionPerMinute.toFixed(3).padStart(8)}/min  reserve ${resource.finiteReserve.toFixed(3)} (${resource.lifetimeMinutes?.toFixed(3) ?? "∞"} min)  after scenario ${resource.reserveAfterScenario.toFixed(3)}`),
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
  options: { fromBlueprint: string; toBlueprint: string; seed: number; json: boolean },
): Promise<void> {
  if (options.fromBlueprint === options.toBlueprint) throw new Error("Compared Blueprint ids must be different");
  const from = await openFactoryProject(projectDir, { ...selection, blueprint: options.fromBlueprint });
  const to = await openFactoryProject(projectDir, { ...selection, blueprint: options.toBlueprint });
  const comparison = compareFactoryBlueprints(from, to, { seed: options.seed, fromLabel: options.fromBlueprint, toLabel: options.toBlueprint });
  if (options.json) {
    write({ command: "compare", project: from.manifest.name, ...comparison }, true);
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
      `  mean cycle         ${(fromMetrics.meanCycleTimeTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanCycleTimeTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanCycleTimeTicks / 1000)} s`,
      `  p95 cycle          ${(fromMetrics.p95CycleTimeTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.p95CycleTimeTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.p95CycleTimeTicks / 1000)} s`,
      `  mean queue         ${(fromMetrics.meanQueueTimeTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanQueueTimeTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanQueueTimeTicks / 1000)} s`,
      `  mean tardiness     ${(fromMetrics.meanTardinessTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.meanTardinessTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.meanTardinessTicks / 1000)} s`,
      `  changeovers        ${fromMetrics.totalChangeovers.toFixed(0).padStart(12)} → ${toMetrics.totalChangeovers.toFixed(0).padStart(12)}  Δ ${signed(comparison.delta.totalChangeovers, 0)}`,
      `  setup work         ${(fromMetrics.totalSetupTicks / 1000).toFixed(3).padStart(12)} → ${(toMetrics.totalSetupTicks / 1000).toFixed(3).padStart(12)} s  Δ ${signed(comparison.delta.totalSetupTicks / 1000)} s`,
      `  campaign holds     ${`${fromMetrics.totalCampaignHolds}/${(fromMetrics.totalCampaignHoldTicks / 1000).toFixed(1)}s`.padStart(12)} → ${`${toMetrics.totalCampaignHolds}/${(toMetrics.totalCampaignHoldTicks / 1000).toFixed(1)}s`.padStart(12)}`,
    ] : []),
    `  energy             ${(fromMetrics.energyConsumedMilliJoules / 1e6).toFixed(3).padStart(12)} → ${(toMetrics.energyConsumedMilliJoules / 1e6).toFixed(3).padStart(12)} MJ  Δ ${signed(comparison.delta.energyConsumedMilliJoules / 1e6)} MJ`,
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

export async function synthesizeCommand(projectDir: string, selection: ProjectSelection, options: { output: string; json: boolean }): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.output)) throw new Error("Output blueprint id must use lowercase kebab-case");
  const loaded = await loadFactoryProject(projectDir, selection);
  const synthesis = synthesizeFactoryBlueprint(loaded);
  const outputPath = join(loaded.rootDir, "blueprints", `${options.output}.blueprint.json`);
  if (await pathExists(outputPath)) throw new Error(`Blueprint already exists: ${outputPath}`);
  const verificationScenario = {
    ...loaded.scenario,
    initialBuffers: {},
    lotReleases: [],
    initialSetups: {},
    initialEnergyMilliJoules: {},
    failures: [],
  };
  const project = compileFactoryProject({ ...loaded, blueprint: synthesis.blueprint, scenario: verificationScenario });
  const plan = planProductionCapacity(project); const simulation = runUntil(project);
  await atomicWriteJson(outputPath, synthesis.blueprint);
  const summary = {
    command: "synthesize", output: options.output, outputPath, target: synthesis.target,
    devices: synthesis.blueprint.devices.length, connections: synthesis.blueprint.connections.length,
    pathCells: synthesis.blueprint.connections.reduce((sum, connection) => sum + connection.path.length, 0),
    stationNetworks: synthesis.stationNetworks, plannedTransports: synthesis.plannedTransports, optimization: synthesis.optimization,
    localLogistics: synthesis.localLogistics,
    selectedProcesses: synthesis.selectedProcesses, extraction: synthesis.extraction, power: synthesis.power,
    planReady: plan.ready, planGaps: plan.gaps, measured: {
      throughputPerMinute: simulation.metrics.throughputPerMinute, occupiedArea: simulation.metrics.occupiedArea,
      totalBuildCost: simulation.metrics.totalBuildCost, finalScore: simulation.metrics.finalScore, infeasibleReason: simulation.metrics.infeasibleReason,
    },
  };
  if (options.json) write(summary, true);
  else write([
    `Synthesized '${options.output}' from project-local recipes and assets`, `Blueprint: ${outputPath}`,
    `Target: ${synthesis.target.ratePerMinute.toFixed(3)} ${synthesis.target.resource}/min @ ${synthesis.target.region}`,
    "Optimized process mix:",
    ...synthesis.selectedProcesses.map((process) => `  ${`${process.process}/${process.mode}`.padEnd(32)} ${process.requiredCyclesPerMinute.toFixed(3)} jobs/min · ${Object.entries(process.inputsPerMinute).map(([resource, rate]) => `${rate.toFixed(3)} ${resource}`).join(" + ") || "no inputs"} → ${Object.entries(process.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(3)} ${resource}`).join(" + ")}`),
    ...(synthesis.plannedTransports.length ? ["Optimized inter-region flows:", ...synthesis.plannedTransports.map((flow) => `  ${flow.resource.padEnd(18)} ${flow.requiredPerMinute.toFixed(3)}/min · ${flow.fromRegion} → ${flow.toRegion}`)] : []),
    "Capacity-aware local logistics:",
    ...synthesis.localLogistics.map((flow) => `  ${flow.resource.padEnd(18)} ${flow.requiredPerMinute.toFixed(3).padStart(8)}/${flow.capacityPerMinute.toFixed(3)} items/min · stack×${flow.stackSize} · ${flow.loader}@${flow.loaderDistance} → ${flow.line} → ${flow.unloader}@${flow.unloaderDistance}`),
    "Spatial power networks:",
    ...synthesis.power.map((power) => `  ${power.region.padEnd(18)} ${power.devices} ${power.asset} (${power.capacityDevices} rated minimum, ${power.coverageTargets} targets)${power.storageDevices ? ` + ${power.storageDevices} ${power.storageAsset}` : ""} · ${(power.generationMilliWatts / 1000).toFixed(3)}/${(power.ratedLoadMilliWatts / 1000).toFixed(3)} W · Scenario ${(power.scenarioGeneratedMilliJoules / 1e6).toFixed(3)}/${(power.scenarioDemandMilliJoules / 1e6).toFixed(3)} MJ${power.profileApplied ? " profiled" : ""}`),
    `Factory: ${summary.devices} devices · ${summary.connections} connections / ${summary.pathCells} belt cells · ${summary.stationNetworks.length} station network${summary.stationNetworks.length === 1 ? "" : "s"}`,
    `Capacity plan: ${plan.ready ? "READY" : `${plan.gaps.length} GAP${plan.gaps.length === 1 ? "" : "S"}`}`,
    `Cold-start measurement: ${simulation.metrics.throughputPerMinute.toFixed(3)} ${synthesis.target.resource}/min · area ${simulation.metrics.occupiedArea} · build cost ${simulation.metrics.totalBuildCost} · score ${simulation.metrics.finalScore.toFixed(3)}`,
    ...(simulation.metrics.infeasibleReason ? [`Constraint: ${simulation.metrics.infeasibleReason}`] : []), "",
  ].join("\n"), false);
}

export async function simulateCommand(projectDir: string, selection: ProjectSelection, options: { seed: number; untilTick?: number; maxEvents?: number; json: boolean }): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const result = runUntil(project, undefined, { seed: options.seed, ...(options.untilTick ? { untilTick: options.untilTick } : {}), ...(options.maxEvents ? { maxEvents: options.maxEvents } : {}) });
  const cached = await findCachedRun(project.rootDir, result.runKey);
  const run = cached ?? await writeRunArtifact(project, result, { label: "simulate", seed: options.seed, decision: "BASELINE" });
  const summary = { command: "simulate", cached: Boolean(cached), run: run.path, resultHash: result.resultHash, runKey: result.runKey, metrics: result.metrics };
  if (options.json) write(summary, true);
  else {
    const flowLines = Object.entries(result.metrics.transportFlows).sort(([, a], [, b]) => b.utilization - a.utilization || b.blockedItemTicks - a.blockedItemTicks).map(([connection, flow]) => {
      const resources = Object.entries(flow.deliveredByResource).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "no deliveries";
      return `  ${connection.padEnd(32)} ${flow.deliveredItemsPerMinute.toFixed(3).padStart(8)}/${flow.capacityItemsPerMinute.toFixed(3)} items/min  ${(flow.utilization * 100).toFixed(1).padStart(5)}%  blocked ${flow.blockedItemTicks} item-ticks  ${resources}`;
    });
    write([
    `Simulation ${cached ? "reproduced (cached artifact)" : "completed"}`, `Run: ${run.path}`, `Score: ${result.metrics.finalScore.toFixed(3)}`,
    `Throughput: ${result.metrics.throughputPerMinute.toFixed(3)} ${project.objective.targetResource}/min`, `Bottleneck: ${result.metrics.bottleneckEntity ?? "none"}`,
    ...(result.metrics.lotFlow.family ? [
      `Lots: ${result.metrics.lotFlow.completed}/${result.metrics.lotFlow.released}/${result.metrics.lotFlow.scheduled} completed/released/scheduled · ${result.metrics.lotFlow.scrapped} scrapped · ${result.metrics.lotFlow.onTimeCompleted} on time · ${(result.metrics.lotFlow.meanCycleTimeTicks / 1000).toFixed(3)} s mean cycle · ${(result.metrics.lotFlow.p95CycleTimeTicks / 1000).toFixed(3)} s p95`,
      `Release flow: ${(result.metrics.releaseFlow.meanPlannedIntervalTicks / 1000).toFixed(3)} s planned interval · ${(result.metrics.releaseFlow.meanActualIntervalTicks / 1000).toFixed(3)} s actual · ${(result.metrics.releaseFlow.meanReleaseDelayTicks / 1000).toFixed(3)} s mean delay · ${result.metrics.releaseFlow.pending} pending`,
      `Release control: ${result.metrics.releaseFlow.control}${result.metrics.releaseFlow.maximumWip === null ? "" : ` max ${result.metrics.releaseFlow.maximumWip} / reopen ${result.metrics.releaseFlow.reopenAtWip} / ${result.metrics.releaseFlow.dispatch}${result.metrics.releaseFlow.maximumReleaseDelayPolicyTicks === null ? "" : ` / max delay ${(result.metrics.releaseFlow.maximumReleaseDelayPolicyTicks / 1000).toFixed(3)} s`}`} · ${result.metrics.releaseFlow.peakActiveLots} peak active · ${result.metrics.releaseFlow.controlBlockedLots} control-blocked lots / ${(result.metrics.releaseFlow.controlBlockedTicks / 1000).toFixed(3)} lot-s · ${result.metrics.releaseFlow.serviceLevelOpenings} service openings`,
      `Lot time: ${(result.metrics.lotFlow.meanQueueTimeTicks / 1000).toFixed(3)} s queue · ${(result.metrics.lotFlow.meanProcessTimeTicks / 1000).toFixed(3)} s processing · ${(result.metrics.lotFlow.meanTransportTimeTicks / 1000).toFixed(3)} s transport · ${(result.metrics.lotFlow.meanTardinessTicks / 1000).toFixed(3)} s tardiness`,
      `Quality: ${(result.metrics.qualityFlow.goodYield * 100).toFixed(1)}% good yield · ${(result.metrics.qualityFlow.firstPassYield * 100).toFixed(1)}% first-pass · ${result.metrics.qualityFlow.totalInspections} inspections · ${result.metrics.qualityFlow.totalReworkCycles} rework · ${result.metrics.qualityFlow.scrapDispositions} scrap dispositions · ${result.metrics.qualityFlow.escapedDefects} escapes`,
      ...(result.metrics.batchFlow.batchOperations ? [`Batch processing: ${result.metrics.batchFlow.jobs} jobs · ${result.metrics.batchFlow.lots} lots · ${result.metrics.batchFlow.averageLotsPerJob.toFixed(2)} lots/job · ${(result.metrics.batchFlow.meanQueueWaitTicksPerLot / 1000).toFixed(3)} s mean device wait/lot`] : []),
    ] : []),
    `Equipment setup: ${result.metrics.equipmentSetups.totalChangeovers} changeovers · ${(result.metrics.equipmentSetups.totalSetupTicks / 1000).toFixed(3)} s work · ${result.metrics.equipmentSetups.totalCampaignHolds} campaign holds / ${(result.metrics.equipmentSetups.totalCampaignHoldTicks / 1000).toFixed(3)} s (${result.metrics.equipmentSetups.campaignMinimumLotReleases} lot-ready / ${result.metrics.equipmentSetups.campaignMaximumHoldReleases} timeout)${Object.entries(result.metrics.equipmentSetups.devices).length ? ` · ${Object.entries(result.metrics.equipmentSetups.devices).map(([device, setup]) => `${device}=${setup.group ?? "unconfigured"}/${setup.changeovers}`).join(", ")}` : ""}`,
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
  if (options.json) write({ passed, total: results.length, results }, true);
  else for (const result of results) write(`${result.passed ? "✓" : "✗"} ${result.name}${result.failures.length ? `\n  ${result.failures.join("\n  ")}` : ""}\n`, false);
  if (passed !== results.length) throw new Error(`${results.length - passed} fixture(s) failed`);
}

export async function runsCommand(projectDir: string, options: OutputOptions): Promise<void> {
  const runs = await listRuns(resolve(projectDir));
  if (options.json) write(runs.map((run) => ({ name: run.name, path: run.path, score: run.score, decision: run.manifest.decision, resultHash: run.manifest.resultHash })), true);
  else if (!runs.length) write("No completed runs.\n", false);
  else write(`${runs.map((run) => `${run.name.padEnd(52)} ${run.manifest.decision.padEnd(8)} score ${run.score.toFixed(3)}`).join("\n")}\n`, false);
}

export async function benchmarkCommand(projectDir: string, benchmarkId: string, options: { json: boolean; lock: boolean }): Promise<void> {
  if (options.lock) {
    const benchmark = await lockBlueprintBenchmark(projectDir, benchmarkId);
    if (options.json) write({ command: "benchmark", action: "lock", benchmark: benchmark.id, lock: benchmark.lock }, true);
    else write(`Locked Blueprint benchmark '${benchmark.id}' across ${benchmark.cases.length} deterministic case(s).\n`, false);
    return;
  }
  const result = await evaluateBlueprintBenchmark(projectDir, benchmarkId);
  if (options.json) { write({ command: "benchmark", ...result }, true); return; }
  write([
    `${result.name} · coding-agent Blueprint benchmark`,
    `BASELINE ${result.baselineBlueprint} ${result.baselineBlueprintHash.slice(0, 12)} → CANDIDATE ${result.candidateBlueprint} ${result.candidateBlueprintHash.slice(0, 12)}`,
    `Fixed work: ${result.cases.length} cases · ${result.totalSimulationTicks} simulated ticks (baseline + candidate)`, "",
    ...result.cases.flatMap((item) => [
      `  ${item.id.padEnd(24)} ${item.baselineScore.toFixed(3).padStart(10)} → ${item.candidateScore.toFixed(3).padStart(10)}  Δ ${signed(item.scoreDelta)}  ×${item.weight}  ${item.candidateCapacityReady ? "READY" : `${item.candidateCapacityGaps.length} GAPS`}`,
      ...(item.baselineMetrics.completedLots || item.candidateMetrics.completedLots ? [
        `    lots ${item.baselineMetrics.completedLots}/${item.baselineMetrics.onTimeLots} complete/on-time → ${item.candidateMetrics.completedLots}/${item.candidateMetrics.onTimeLots} · mean cycle ${(item.baselineMetrics.meanCycleTimeTicks / 1000).toFixed(3)} → ${(item.candidateMetrics.meanCycleTimeTicks / 1000).toFixed(3)} s · tardiness ${(item.baselineMetrics.meanTardinessTicks / 1000).toFixed(3)} → ${(item.candidateMetrics.meanTardinessTicks / 1000).toFixed(3)} s`,
        `    release ${item.baselineMetrics.releasedLots}/${item.baselineMetrics.scheduledLots} released · ${(item.baselineMetrics.meanActualReleaseIntervalTicks / 1000).toFixed(3)} s interval / ${(item.baselineMetrics.meanReleaseDelayTicks / 1000).toFixed(3)} s delay → ${item.candidateMetrics.releasedLots}/${item.candidateMetrics.scheduledLots} · ${(item.candidateMetrics.meanActualReleaseIntervalTicks / 1000).toFixed(3)} s / ${(item.candidateMetrics.meanReleaseDelayTicks / 1000).toFixed(3)} s`,
        `    release control peak ${item.baselineMetrics.peakActiveLots} / ${item.baselineMetrics.controlBlockedLots} blocked / ${(item.baselineMetrics.controlBlockedTicks / 1000).toFixed(3)} lot-s → ${item.candidateMetrics.peakActiveLots} / ${item.candidateMetrics.controlBlockedLots} / ${(item.candidateMetrics.controlBlockedTicks / 1000).toFixed(3)} lot-s`,
        `    service openings ${item.baselineMetrics.serviceLevelOpenings} → ${item.candidateMetrics.serviceLevelOpenings}`,
        `    quality ${(item.baselineMetrics.goodYield * 100).toFixed(1)}% good / ${(item.baselineMetrics.firstPassYield * 100).toFixed(1)}% FP / ${item.baselineMetrics.qualityEscapes} escapes / ${item.baselineMetrics.reworkCycles} rework → ${(item.candidateMetrics.goodYield * 100).toFixed(1)}% / ${(item.candidateMetrics.firstPassYield * 100).toFixed(1)}% / ${item.candidateMetrics.qualityEscapes} / ${item.candidateMetrics.reworkCycles}`,
        ...(item.baselineMetrics.batchJobs || item.candidateMetrics.batchJobs ? [`    batch ${item.baselineMetrics.batchJobs} jobs / ${item.baselineMetrics.averageLotsPerBatch.toFixed(2)} lots/job / ${(item.baselineMetrics.meanBatchQueueWaitTicksPerLot / 1000).toFixed(3)} s wait → ${item.candidateMetrics.batchJobs} / ${item.candidateMetrics.averageLotsPerBatch.toFixed(2)} / ${(item.candidateMetrics.meanBatchQueueWaitTicksPerLot / 1000).toFixed(3)} s`] : []),
        `    setup ${item.baselineMetrics.totalChangeovers} changeovers / ${(item.baselineMetrics.totalSetupTicks / 1000).toFixed(3)} s → ${item.candidateMetrics.totalChangeovers} / ${(item.candidateMetrics.totalSetupTicks / 1000).toFixed(3)} s`,
        `    campaigns ${item.baselineMetrics.totalCampaignHolds} holds / ${(item.baselineMetrics.totalCampaignHoldTicks / 1000).toFixed(3)} s → ${item.candidateMetrics.totalCampaignHolds} / ${(item.candidateMetrics.totalCampaignHoldTicks / 1000).toFixed(3)} s`,
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

export async function researchCommand(projectDir: string, selection: ProjectSelection, options: { iterations: number; seed: number; json: boolean; agentCommand?: string }): Promise<void> {
  const result = await researchFactory(projectDir, { ...selection, iterations: options.iterations, seed: options.seed, ...(options.agentCommand ? { agent: new ExternalCommandResearchAgent(options.agentCommand) } : {}) });
  const summary = {
    baseline: { run: result.baseline.path, score: result.baseline.score }, bestScore: result.bestScore,
    iterations: result.iterations.map((item) => ({ iteration: item.iteration, decision: item.decision, previousScore: item.previousScore, score: item.score, run: item.run.path, hypothesis: item.proposal.hypothesis })),
  };
  if (options.json) write(summary, true);
  else write([
    `000 baseline  score ${summary.baseline.score.toFixed(3)}`,
    ...summary.iterations.map((item) => `${String(item.iteration).padStart(3, "0")} ${item.hypothesis.slice(0, 45).padEnd(45)} score ${item.score.toFixed(3)} ${item.decision}`),
    `Best score: ${summary.bestScore.toFixed(3)}`, "",
  ].join("\n"), false);
}

export function formatCliError(error: unknown, json: boolean): string {
  if (error instanceof InmValidationError) return json ? `${stableStringify({ error: "validation", issues: error.issues }, 2)}\n` : `Validation failed:\n${error.issues.map((issue) => `  ${issue.path} [${issue.code}] ${issue.message}`).join("\n")}\n`;
  const message = error instanceof Error ? error.message : String(error);
  return json ? `${stableStringify({ error: "runtime", message }, 2)}\n` : `Error: ${message}\n`;
}
