import { join } from "node:path";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { Blueprint, CompiledFactoryProject, FactoryMetrics } from "./types";
import type { JsonPatchOperation, RunSummary } from "./artifacts";
import { writeRunArtifact } from "./artifacts";
import { compileFactoryProject } from "./compiler";
import { planDeviceTransport } from "./device-runtime";
import type { LoadedFactoryProject } from "./loader";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import { runUntil } from "./simulator";
import { analyzeProduction, type ProductionAnalysis } from "./production-analysis";
import { atomicWriteJson, hashValue } from "./utils";

export interface ResearchInput {
  iteration: number;
  project: CompiledFactoryProject;
  blueprint: Blueprint;
  metrics: FactoryMetrics;
  production: ProductionAnalysis;
  history: ResearchHistoryEntry[];
}
export interface ResearchHistoryEntry {
  iteration: number;
  strategy: string;
  hypothesis: string;
  decision: "KEEP" | "REVERT";
  score: number;
  scoreDelta: number;
}
export interface ResearchProposal { hypothesis: string; patch: JsonPatchOperation[]; expectedEffect?: string; strategy?: string }
export interface BlueprintResearchAgent { propose(input: ResearchInput): Promise<ResearchProposal> }
export interface LlmResearchProvider {
  complete(input: { system: string; project: ResearchInput }): Promise<ResearchProposal>;
}

export class ProviderResearchAgent implements BlueprintResearchAgent {
  constructor(private readonly provider: LlmResearchProvider) {}
  propose(input: ResearchInput): Promise<ResearchProposal> {
    return this.provider.complete({
      system: "Return a hypothesis and an RFC 6902 patch. Read static production diagnostics and experiment history, address a concrete material/logistics/power bottleneck, and do not repeat a reverted strategy. You may modify only blueprint devices, connections, logisticsNetworks, and policies. Never modify assets, scenarios, objectives, simulator, or evaluator.",
      project: input,
    });
  }
}

export class ExternalCommandResearchAgent implements BlueprintResearchAgent {
  constructor(private readonly command: string) {
    if (!command.trim()) throw new Error("External research agent command cannot be empty");
  }
  async propose(input: ResearchInput): Promise<ResearchProposal> {
    const shell = process.env.SHELL || "/bin/sh";
    const child = spawn(shell, ["-lc", this.command], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end(JSON.stringify(input));
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    const exitCode = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("close", (code) => resolve(code ?? 1)); });
    if (exitCode !== 0) throw new Error(`External research agent exited with ${exitCode}: ${Buffer.concat(stderr).toString("utf8").trim()}`);
    let proposal: unknown;
    try { proposal = JSON.parse(Buffer.concat(stdout).toString("utf8")); } catch (error) { throw new Error(`External research agent returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
    if (!proposal || typeof proposal !== "object" || typeof (proposal as ResearchProposal).hypothesis !== "string" || !Array.isArray((proposal as ResearchProposal).patch)) throw new Error("External research agent response must contain hypothesis and patch");
    validateResearchPatch((proposal as ResearchProposal).patch);
    return proposal as ResearchProposal;
  }
}

const allowedRoots = new Set(["devices", "connections", "logisticsNetworks", "policies"]);
export function validateResearchPatch(patch: JsonPatchOperation[]): void {
  if (!Array.isArray(patch) || patch.length === 0) throw new Error("Research patch must contain at least one operation");
  for (const [index, operation] of patch.entries()) {
    if (!(["add", "remove", "replace"] as string[]).includes(operation.op)) throw new Error(`Patch operation ${index} uses unsupported op '${operation.op}'`);
    if (!operation.path.startsWith("/")) throw new Error(`Patch operation ${index} path must be an absolute JSON pointer`);
    const root = operation.path.split("/")[1];
    if (!root || !allowedRoots.has(root)) throw new Error(`Patch operation ${index} cannot modify '${operation.path}'. Research may only edit /devices, /connections, /logisticsNetworks, or /policies`);
    if (operation.path.includes("/__proto__") || operation.path.includes("/constructor") || operation.path.includes("/prototype")) throw new Error(`Patch operation ${index} uses an unsafe path`);
  }
}

function decodePointer(value: string): string { return value.replace(/~1/g, "/").replace(/~0/g, "~"); }
export function applyResearchPatch(blueprint: Blueprint, patch: JsonPatchOperation[]): Blueprint {
  validateResearchPatch(patch);
  const candidate = structuredClone(blueprint) as unknown as Record<string, unknown>;
  for (const operation of patch) {
    const segments = operation.path.slice(1).split("/").map(decodePointer);
    let parent: unknown = candidate;
    for (const segment of segments.slice(0, -1)) {
      if (!parent || typeof parent !== "object") throw new Error(`Patch path does not exist: ${operation.path}`);
      parent = (parent as Record<string, unknown>)[segment];
    }
    const key = segments.at(-1)!;
    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : Number.parseInt(key, 10);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`Invalid array index in patch path: ${operation.path}`);
      if (operation.op === "add") parent.splice(index, 0, structuredClone(operation.value));
      else if (operation.op === "remove") { if (index >= parent.length) throw new Error(`Patch path does not exist: ${operation.path}`); parent.splice(index, 1); }
      else { if (index >= parent.length) throw new Error(`Patch path does not exist: ${operation.path}`); parent[index] = structuredClone(operation.value); }
    } else if (parent && typeof parent === "object") {
      const record = parent as Record<string, unknown>;
      if (operation.op === "remove") { if (!(key in record)) throw new Error(`Patch path does not exist: ${operation.path}`); delete record[key]; }
      else { if (operation.op === "replace" && !(key in record)) throw new Error(`Patch path does not exist: ${operation.path}`); record[key] = structuredClone(operation.value); }
    } else throw new Error(`Patch path does not exist: ${operation.path}`);
  }
  return candidate as unknown as Blueprint;
}

function overlaps(blueprint: Blueprint, device: Blueprint["devices"][number], project: CompiledFactoryProject): boolean {
  const asset = project.deviceAssets[device.asset]!;
  const width = device.rotation === 90 || device.rotation === 270 ? asset.geometry.footprint.height : asset.geometry.footprint.width;
  const height = device.rotation === 90 || device.rotation === 270 ? asset.geometry.footprint.width : asset.geometry.footprint.height;
  const region = project.regions[device.region];
  if (!region || device.position.x + width > region.bounds.width || device.position.y + height > region.bounds.height) return true;
  return blueprint.devices.some((other) => {
    if (other.region !== device.region) return false;
    const otherAsset = project.deviceAssets[other.asset]!;
    const ow = other.rotation === 90 || other.rotation === 270 ? otherAsset.geometry.footprint.height : otherAsset.geometry.footprint.width;
    const oh = other.rotation === 90 || other.rotation === 270 ? otherAsset.geometry.footprint.width : otherAsset.geometry.footprint.height;
    return device.position.x < other.position.x + ow && device.position.x + width > other.position.x && device.position.y < other.position.y + oh && device.position.y + height > other.position.y;
  });
}

interface StrategyCandidate { key: string; proposal: ResearchProposal }

function uniqueDeviceId(blueprint: Blueprint, base: string): string {
  let suffix = 1; let id = base;
  while (blueprint.devices.some((device) => device.id === id)) id = `${base}-${++suffix}`;
  return id;
}

function placeDevice(blueprint: Blueprint, device: Blueprint["devices"][number], project: CompiledFactoryProject, preferred?: { x: number; y: number }): boolean {
  const bounds = project.regions[device.region]?.bounds;
  if (!bounds) return false;
  const positions = Array.from({ length: bounds.width * bounds.height }, (_, index) => ({
    x: index % bounds.width, y: Math.floor(index / bounds.width),
  }));
  if (preferred) positions.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y) || a.y - b.y || a.x - b.x);
  for (const position of positions) {
    device.position = position;
    if (!overlaps(blueprint, device, project)) return true;
  }
  return false;
}

function duplicateProcessorCandidate(input: ResearchInput, original: CompiledFactoryProject["devices"][string], reason: string): StrategyCandidate | null {
  const instance = input.blueprint.devices.find((device) => device.id === original.id);
  if (!instance) return null;
  const id = uniqueDeviceId(input.blueprint, `${original.id}-parallel`);
  const clone = structuredClone(instance); clone.id = id;
  if (!placeDevice(input.blueprint, clone, input.project, original.position)) return null;
  const patch: JsonPatchOperation[] = [{ op: "add", path: "/devices/-", value: clone }];
  const grid = original.powerGrid ? input.production.powerGrids.find((item) => item.grid === original.powerGrid) : undefined;
  const needsPowerSupport = original.assetDef.power.consumptionMilliWatts > (grid?.headroomMilliWatts ?? 0);
  let powerSupport: Blueprint["devices"][number] | undefined;
  if (needsPowerSupport) {
    const generator = Object.values(input.project.deviceAssets)
      .filter((asset) => asset.power.productionMilliWatts > asset.power.consumptionMilliWatts && asset.power.distribution)
      .sort((a, b) => (b.power.productionMilliWatts - b.power.consumptionMilliWatts) - (a.power.productionMilliWatts - a.power.consumptionMilliWatts) || a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
    if (!generator) return null;
    powerSupport = { id: uniqueDeviceId(input.blueprint, `${generator.id}-support`), asset: generator.id, region: original.region, position: { x: 0, y: 0 }, rotation: 0 };
    const candidateBlueprint = structuredClone(input.blueprint);
    candidateBlueprint.devices.push(clone);
    if (!placeDevice(candidateBlueprint, powerSupport, input.project, original.position)) return null;
    patch.push({ op: "add", path: "/devices/-", value: powerSupport });
  }
  const adjacent = input.blueprint.connections.filter((connection) => connection.to.device === original.id || connection.from.device === original.id);
  for (const connection of adjacent) {
    const copy = structuredClone(connection); copy.id = `${connection.id}-${id}`;
    if (copy.to.device === original.id) copy.to.device = id;
    if (copy.from.device === original.id) copy.from.device = id;
    patch.push({ op: "add", path: "/connections/-", value: copy });
  }
  return {
    key: `capacity:${original.id}`,
    proposal: {
      strategy: `capacity:${original.id}`,
      hypothesis: `Duplicate processor \`${original.id}\` as \`${id}\`${powerSupport ? ` with regional power support \`${powerSupport.id}\`` : ""} because ${reason}.`,
      expectedEffect: "Increase process capacity while preserving the existing resource, regional power, and logistics contracts.",
      patch,
    },
  };
}

function powerCandidates(input: ResearchInput): StrategyCandidate[] {
  const generators = Object.values(input.project.deviceAssets).filter((asset) => asset.power.productionMilliWatts > 0 && asset.power.distribution).sort((a, b) => b.power.productionMilliWatts - a.power.productionMilliWatts || a.id.localeCompare(b.id));
  const generator = generators[0]; if (!generator) return [];
  const candidates: StrategyCandidate[] = [];
  for (const diagnostic of input.production.diagnostics.filter((item) => item.code === "power-disconnected" || item.code === "power-deficit")) {
    const target = diagnostic.device ? input.project.devices[diagnostic.device] : undefined;
    const grid = diagnostic.code === "power-deficit" ? input.production.powerGrids.find((item) => diagnostic.message.startsWith(item.grid)) : undefined;
    const anchorId = target?.id ?? grid?.distributors[0]; const anchor = anchorId ? input.project.devices[anchorId] : undefined;
    const id = uniqueDeviceId(input.blueprint, `${generator.id}-support`);
    const device: Blueprint["devices"][number] = { id, asset: generator.id, region: anchor?.region ?? input.project.world.regions[0]!.id, position: { x: 0, y: 0 }, rotation: 0 };
    if (!placeDevice(input.blueprint, device, input.project, anchor?.position)) continue;
    const key = `power:${diagnostic.code}:${anchorId ?? "factory"}`;
    candidates.push({ key, proposal: {
      strategy: key,
      hypothesis: `Add \`${id}\` near \`${anchorId ?? "the constrained grid"}\` to resolve ${diagnostic.code}.`,
      expectedEffect: "Extend electrical coverage or generation without changing process semantics.",
      patch: [{ op: "add", path: "/devices/-", value: device }],
    } });
  }
  return candidates;
}

function logisticsCandidates(input: ResearchInput): StrategyCandidate[] {
  const candidates: StrategyCandidate[] = [];
  for (const diagnostic of input.production.diagnostics.filter((item) => item.code === "input-logistics" || item.code === "output-logistics")) {
    const links = input.production.connections.filter((connection) => diagnostic.code === "input-logistics" ? connection.to === diagnostic.device : connection.from === diagnostic.device);
    for (const link of links) {
      const connectionIndex = input.blueprint.connections.findIndex((connection) => connection.id === link.connection);
      const compiled = input.project.connections[link.connection]; if (connectionIndex < 0 || !compiled) continue;
      const stageIntervals = compiled.logisticsStages.map((stage) => ({ stage, interval: Math.ceil(stage.durationTicks / stage.capacity) }));
      const currentInterval = Math.max(...stageIntervals.map((item) => item.interval));
      const bottlenecks = stageIntervals.filter((item) => item.interval === currentInterval);
      const upgrades = bottlenecks.flatMap(({ stage }) => {
        const alternatives = Object.values(input.project.deviceAssets).filter((asset) => asset.logistics?.roles.includes(stage.stage) && asset.id !== stage.asset.id).flatMap((asset) => {
          const plan = planDeviceTransport(asset.id, asset.program, { apiVersion: 1, connection: compiled.id, stage: stage.stage, distance: stage.distance });
          const interval = Math.ceil(plan.durationTicks / plan.capacity);
          return interval < currentInterval ? [{ asset, interval }] : [];
        }).sort((a, b) => a.interval - b.interval || a.asset.economics.buildCost - b.asset.economics.buildCost || a.asset.id.localeCompare(b.asset.id));
        return alternatives[0] ? [{ stage, replacement: alternatives[0] }] : [];
      });
      if (upgrades.length !== bottlenecks.length) continue;
      const nextInterval = Math.max(
        ...stageIntervals.filter((item) => item.interval < currentInterval).map((item) => item.interval),
        ...upgrades.map((upgrade) => upgrade.replacement.interval),
      );
      const key = `logistics:${compiled.id}:${upgrades.map((upgrade) => `${upgrade.stage.stage}:${upgrade.replacement.asset.id}`).join("+")}`;
      candidates.push({ key, proposal: {
        strategy: key,
        hypothesis: `Upgrade bottleneck stages on \`${compiled.id}\` (${upgrades.map((upgrade) => `${upgrade.stage.stage}: ${upgrade.stage.asset.id} → ${upgrade.replacement.asset.id}`).join(", ")}) because ${diagnostic.message}.`,
        expectedEffect: `Reduce the end-to-end dispatch interval from ${currentInterval} ms to ${nextInterval} ms.`,
        patch: upgrades.map((upgrade) => ({ op: "replace" as const, path: `/connections/${connectionIndex}/logistics/${upgrade.stage.stage}/deviceAsset`, value: upgrade.replacement.asset.id })),
      } });
    }
  }
  return candidates;
}

function stationCandidates(input: ResearchInput): StrategyCandidate[] {
  const candidates: StrategyCandidate[] = [];
  for (const diagnostic of input.production.diagnostics.filter((item) => item.code === "station-fleet-deficit" && item.network)) {
    const networkIndex = input.blueprint.logisticsNetworks.findIndex((network) => network.id === diagnostic.network);
    const analysis = input.production.stationNetworks.find((network) => network.network === diagnostic.network);
    if (networkIndex < 0 || !analysis) continue;
    const count = Math.max(analysis.fleetSize + 1, Math.ceil(analysis.estimatedCarrierLoad));
    const key = `station-fleet:${analysis.network}:${count}`;
    candidates.push({ key, proposal: {
      strategy: key,
      hypothesis: `Expand \`${analysis.network}\` from ${analysis.fleetSize} to ${count} \`${analysis.fleetAsset}\` carriers because ${diagnostic.message}.`,
      expectedEffect: "Increase shared station-network throughput without changing station supply and demand declarations.",
      patch: [{ op: "replace", path: `/logisticsNetworks/${networkIndex}/fleet/count`, value: count }],
    } });
  }
  return candidates;
}

function bufferCandidates(input: ResearchInput): StrategyCandidate[] {
  const bufferAsset = Object.values(input.project.deviceAssets).find((asset) => asset.capabilities.includes("store"));
  if (!bufferAsset) return [];
  const candidates: StrategyCandidate[] = [];
  const processors = Object.values(input.project.devices).filter((device) => device.assetDef.capabilities.includes("process") && (input.metrics.blockedOutputTime[device.id] ?? 0) > 0)
    .sort((a, b) => (input.metrics.blockedOutputTime[b.id] ?? 0) - (input.metrics.blockedOutputTime[a.id] ?? 0) || a.id.localeCompare(b.id));
  for (const original of processors) {
    const connection = input.blueprint.connections.find((item) => item.from.device === original.id); if (!connection) continue;
    const id = uniqueDeviceId(input.blueprint, `${original.id}-buffer`);
    const buffer: Blueprint["devices"][number] = { id, asset: bufferAsset.id, region: original.region, position: { x: 0, y: 0 }, rotation: 0 };
    if (!placeDevice(input.blueprint, buffer, input.project, original.position)) continue;
    const connectionIndex = input.blueprint.connections.indexOf(connection);
    const inputPort = bufferAsset.geometry.ports.find((port) => port.direction === "input")!;
    const outputPort = bufferAsset.geometry.ports.find((port) => port.direction === "output")!;
    const newConnection = { id: `${connection.id}-${id}-output`, from: { device: id, port: outputPort.id }, to: structuredClone(connection.to), logistics: structuredClone(connection.logistics) };
    const key = `buffer:${connection.id}`;
    candidates.push({ key, proposal: {
      strategy: key,
      hypothesis: `Insert buffer \`${id}\` after \`${original.id}\` because it spent ${input.metrics.blockedOutputTime[original.id]} ticks blocked.`,
      expectedEffect: "Decouple producer completion from downstream demand and expose whether storage relieves the measured blockage.",
      patch: [
        { op: "add", path: "/devices/-", value: buffer },
        { op: "replace", path: `/connections/${connectionIndex}/to`, value: { device: id, port: inputPort.id } },
        { op: "add", path: "/connections/-", value: newConnection },
      ],
    } });
  }
  return candidates;
}

export class HeuristicResearchAgent implements BlueprintResearchAgent {
  async propose(input: ResearchInput): Promise<ResearchProposal> {
    const candidates: StrategyCandidate[] = [...powerCandidates(input), ...logisticsCandidates(input), ...stationCandidates(input)];
    for (const diagnostic of input.production.diagnostics.filter((item) => item.code === "material-deficit" && item.resource)) {
      const producer = input.production.devices.filter((device) => (device.outputsPerMinute[diagnostic.resource!] ?? 0) > 0)
        .sort((a, b) => (b.outputsPerMinute[diagnostic.resource!] ?? 0) - (a.outputsPerMinute[diagnostic.resource!] ?? 0) || a.device.localeCompare(b.device))[0];
      if (producer) {
        const candidate = duplicateProcessorCandidate(input, input.project.devices[producer.device]!, diagnostic.message);
        if (candidate) candidates.push(candidate);
      }
    }
    candidates.push(...bufferCandidates(input));
    const processors = Object.values(input.project.devices).filter((device) => device.assetDef.capabilities.includes("process"))
      .sort((a, b) => (input.metrics.machineUtilization[b.id] ?? 0) - (input.metrics.machineUtilization[a.id] ?? 0) || a.id.localeCompare(b.id));
    for (const processor of processors) {
      const candidate = duplicateProcessorCandidate(input, processor, `its measured utilization is ${((input.metrics.machineUtilization[processor.id] ?? 0) * 100).toFixed(1)}%`);
      if (candidate) candidates.push(candidate);
    }
    const used = new Set(input.history.map((entry) => entry.strategy));
    const selected = candidates.find((candidate) => !used.has(candidate.key)) ?? candidates[input.iteration % Math.max(1, candidates.length)];
    if (!selected) throw new Error("Heuristic agent found no valid blueprint strategy to evaluate");
    return selected.proposal;
  }
}

export interface ResearchOptions extends ProjectSelection { iterations: number; seed: number; agent?: BlueprintResearchAgent }
export interface ResearchIteration { iteration: number; decision: "KEEP" | "REVERT"; score: number; previousScore: number; run: RunSummary; proposal: ResearchProposal }
export interface ResearchResult { baseline: RunSummary; iterations: ResearchIteration[]; bestScore: number; bestBlueprint: Blueprint }

function withBlueprint(loaded: LoadedFactoryProject, blueprint: Blueprint): LoadedFactoryProject { return { ...loaded, blueprint }; }

export async function researchFactory(projectDir: string, options: ResearchOptions): Promise<ResearchResult> {
  let loaded = await loadFactoryProject(projectDir, options);
  let project = compileFactoryProject(loaded);
  let bestBlueprint = project.blueprint;
  let bestResult = runUntil(project, undefined, { seed: options.seed });
  const baseline = await writeRunArtifact(project, bestResult, { label: "baseline", seed: options.seed, decision: "BASELINE" });
  const iterations: ResearchIteration[] = []; const agent = options.agent ?? new HeuristicResearchAgent();
  let parentRun = baseline;
  for (let iteration = 1; iteration <= options.iterations; iteration++) {
    const history: ResearchHistoryEntry[] = iterations.map((entry) => ({
      iteration: entry.iteration,
      strategy: entry.proposal.strategy ?? hashValue(entry.proposal.patch),
      hypothesis: entry.proposal.hypothesis,
      decision: entry.decision,
      score: entry.score,
      scoreDelta: entry.score - entry.previousScore,
    }));
    const proposal = await agent.propose({ iteration, project, blueprint: bestBlueprint, metrics: bestResult.metrics, production: analyzeProduction(project), history });
    const candidateBlueprint = applyResearchPatch(bestBlueprint, proposal.patch);
    candidateBlueprint.revision = hashValue(bestBlueprint);
    let candidateProject: CompiledFactoryProject; let candidateResult: ReturnType<typeof runUntil>;
    try {
      candidateProject = compileFactoryProject(withBlueprint(loaded, candidateBlueprint));
      candidateResult = runUntil(candidateProject, undefined, { seed: options.seed });
    } catch (error) {
      throw new Error(`Research candidate ${iteration} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    const decision = candidateResult.metrics.finalScore > bestResult.metrics.finalScore ? "KEEP" : "REVERT";
    const run = await writeRunArtifact(candidateProject, candidateResult, {
      label: `${decision.toLowerCase()}-${proposal.hypothesis.slice(0, 40)}`, seed: options.seed, blueprint: candidateBlueprint,
      hypothesis: `${proposal.hypothesis}\n\nExpected effect: ${proposal.expectedEffect ?? "not specified"}`,
      patch: proposal.patch, decision, parentRun: parentRun.path,
    });
    iterations.push({ iteration, decision, score: candidateResult.metrics.finalScore, previousScore: bestResult.metrics.finalScore, run, proposal });
    if (decision === "KEEP") {
      const blueprintPath = join(loaded.rootDir, "blueprints", `${loaded.manifest.defaultBlueprint}.blueprint.json`);
      const currentBlueprint = JSON.parse(await readFile(blueprintPath, "utf8")) as Blueprint;
      if (hashValue(currentBlueprint) !== hashValue(bestBlueprint)) throw new Error(`Blueprint changed during research; refusing to overwrite ${blueprintPath}`);
      bestBlueprint = candidateBlueprint; bestResult = candidateResult; project = candidateProject;
      loaded = withBlueprint(loaded, bestBlueprint); parentRun = run;
      await atomicWriteJson(blueprintPath, bestBlueprint);
    }
  }
  return { baseline, iterations, bestScore: bestResult.metrics.finalScore, bestBlueprint };
}
