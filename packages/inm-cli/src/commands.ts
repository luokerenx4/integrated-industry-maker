import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  InmValidationError, WORKSPACE_MANIFEST, analyzeProduction, atomicWriteJson, findCachedRun, listRuns, listWorkspaceProjects, loadWorkspace, openFactoryProject, pathExists,
  researchFactory, runUntil, stableStringify, writeRunArtifact, ExternalCommandResearchAgent,
  type FactoryEvent, type FactoryMetrics, type InmManifest, type InmWorkspaceManifest, type ProjectSelection,
} from "@inm/core";

export interface OutputOptions { json?: boolean }
const write = (value: unknown, json: boolean) => process.stdout.write(json ? `${stableStringify(value, 2)}\n` : String(value));

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
    `Objective: ${summary.objective.name} → ${summary.objective.targetResource}`, `Runs: ${summary.runs.length}`, "",
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
    "",
    "Device rates",
    ...analysis.extractionDevices.map((device) => `  ${device.device.padEnd(24)} extract ${device.resource.padEnd(15)} ${device.itemsPerMinute.toFixed(3)} items/min from ${device.nodes.join(", ")}`),
    ...analysis.devices.map((device) => `  ${device.device.padEnd(24)} ${device.process.padEnd(20)} ${device.cyclesPerMinute.toFixed(3)} cycles/min`),
    "",
    "Power generation",
    ...analysis.generationDevices.map((device) => `  ${device.device.padEnd(24)} ${device.kind.padEnd(10)} ${(device.outputMilliWatts / 1000).toFixed(3).padStart(9)} W${device.fuelResource ? `  burn ${device.fuelPerMinute!.toFixed(3)} ${device.fuelResource}/min · ${device.burnTicks} ms/unit` : ""}`),
    ...(analysis.generationDevices.length ? [] : ["  none"]),
    "",
    "Finite resource nodes",
    ...analysis.resourceNodes.map((node) => `  ${node.node.padEnd(24)} [${node.region}] ${node.amount.toString().padStart(7)} ${node.resource}  miners ${node.miners.join(", ") || "none"}  depletion ${node.estimatedDepletionMinutes === null ? "never" : `${node.estimatedDepletionMinutes.toFixed(3)} min`}`),
    "",
    "Material balance",
    ...analysis.resources.map((resource) => `  ${resource.resource.padEnd(20)} produce ${resource.producedPerMinute.toFixed(3).padStart(9)}/min  consume ${resource.consumedPerMinute.toFixed(3).padStart(9)}/min  net ${resource.netPerMinute.toFixed(3).padStart(9)}/min${resource.hasBoundarySupply ? "  [boundary supply]" : ""}${resource.hasBoundaryDemand ? "  [boundary demand]" : ""}`),
    "",
    "Power grids",
    ...analysis.powerGrids.map((grid) => `  ${grid.grid.padEnd(38)} [${grid.region}] generate ${(grid.productionMilliWatts / 1000).toFixed(3).padStart(9)} W  rated ${(grid.ratedConsumptionMilliWatts / 1000).toFixed(3).padStart(9)} W  headroom ${(grid.headroomMilliWatts / 1000).toFixed(3).padStart(9)} W  (${grid.members.length} members)`),
    "",
    "Logistics links",
    ...analysis.connections.map((connection) => `  ${connection.connection.padEnd(24)} ${connection.capacityItemsPerMinute.toFixed(3).padStart(9)} items/min  ${connection.travelTicks.toString().padStart(5)} ms  ${connection.pathCells} cells${connection.sharedCells ? ` / ${connection.sharedCells} shared` : ""}  ${connection.stages.map((stage) => `${stage.stage}:${stage.asset}`).join(" → ")}`),
    "",
    "Station networks",
    ...analysis.stationNetworks.flatMap((network) => [
      `  ${network.network}  ${network.kind}  fleet ${network.fleetSize}× ${network.fleetAsset}  ${network.stations} stations  estimated load ${network.estimatedCarrierLoad.toFixed(3)}`,
      ...network.routes.map((route) => `    ${route.resource.padEnd(18)} ${route.from}@${route.fromRegion} → ${route.to}@${route.toRegion}  batch ${route.minimumBatch}-${route.batchCapacity}  ${route.travelTicks} ms  ${route.capacityItemsPerMinute.toFixed(3)} items/min/carrier`),
    ]),
    ...(analysis.stationNetworks.length ? [] : ["  none"]),
    "",
    analysis.diagnostics.length ? "Diagnostics" : "Diagnostics: none",
    ...analysis.diagnostics.map((diagnostic) => `  ${diagnostic.severity === "warning" ? "!" : "·"} [${diagnostic.code}] ${diagnostic.message}`),
    "",
  ];
  write(lines.join("\n"), false);
}

export async function simulateCommand(projectDir: string, selection: ProjectSelection, options: { seed: number; untilTick?: number; maxEvents?: number; json: boolean }): Promise<void> {
  const project = await openFactoryProject(projectDir, selection);
  const result = runUntil(project, undefined, { seed: options.seed, ...(options.untilTick ? { untilTick: options.untilTick } : {}), ...(options.maxEvents ? { maxEvents: options.maxEvents } : {}) });
  const cached = await findCachedRun(project.rootDir, result.runKey);
  const run = cached ?? await writeRunArtifact(project, result, { label: "simulate", seed: options.seed, decision: "BASELINE" });
  const summary = { command: "simulate", cached: Boolean(cached), run: run.path, resultHash: result.resultHash, runKey: result.runKey, metrics: result.metrics };
  if (options.json) write(summary, true);
  else write([
    `Simulation ${cached ? "reproduced (cached artifact)" : "completed"}`, `Run: ${run.path}`, `Score: ${result.metrics.finalScore.toFixed(3)}`,
    `Throughput: ${result.metrics.throughputPerMinute.toFixed(3)} ${project.objective.targetResource}/min`, `Bottleneck: ${result.metrics.bottleneckEntity ?? "none"}`,
    `Result hash: ${result.resultHash}`, "",
  ].join("\n"), false);
}

interface MetricAssertion { kind: "metric"; path: string; min?: number; max?: number; equals?: unknown }
interface EventAssertion { kind: "event"; type: FactoryEvent["type"]; present: boolean }
interface Fixture { name: string; blueprint?: string; scenario?: string; objective?: string; seed?: number; untilTick?: number; assertions: Array<MetricAssertion | EventAssertion> }
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
    const project = await openFactoryProject(root, { blueprint: fixture.blueprint, scenario: fixture.scenario, objective: fixture.objective });
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
