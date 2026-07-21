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
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { atomicWriteJson, hashValue } from "./utils";
import { findBlueprintConnectionPath, rotatePortSide, rotatedFootprint, transportEndpointRotation } from "./routing";
import { evaluatePowerEnvelope, renewableProfileFor } from "./power-envelope";

export interface ResearchInput {
  iteration: number;
  project: CompiledFactoryProject;
  blueprint: Blueprint;
  metrics: FactoryMetrics;
  production: ProductionAnalysis;
  capacityPlan: ProductionCapacityPlan;
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
      system: "Return a hypothesis and an RFC 6902 patch. Read the target-rate capacity plan, static production diagnostics, measured runtime metrics, and experiment history; address a concrete process, resource, logistics, station, or power gap and do not repeat a reverted strategy. You may modify only blueprint devices, connections, logisticsNetworks, and policies. Never modify assets, worlds, scenarios, objectives, simulator, or evaluator.",
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
  const { width, height } = rotatedFootprint(asset, device.rotation);
  const region = project.regions[device.region];
  if (!region || device.position.x + width > region.bounds.width || device.position.y + height > region.bounds.height) return true;
  const deviceOverlap = blueprint.devices.some((other) => {
    if (other.region !== device.region || other.transportEndpoint) return false;
    const otherAsset = project.deviceAssets[other.asset]!;
    const { width: ow, height: oh } = rotatedFootprint(otherAsset, other.rotation);
    return device.position.x < other.position.x + ow && device.position.x + width > other.position.x && device.position.y < other.position.y + oh && device.position.y + height > other.position.y;
  });
  if (deviceOverlap) return true;
  return blueprint.connections.some((connection) => {
    const source = blueprint.devices.find((instance) => instance.id === connection.from.device);
    return source?.region === device.region && connection.path.some((cell) => cell.x >= device.position.x && cell.x < device.position.x + width && cell.y >= device.position.y && cell.y < device.position.y + height);
  });
}

/**
 * Research strategies author topology before they know the final paths. Rebuild every
 * sorter attachment after routing so each physical connection owns exactly one loader
 * and one unloader Device at its actual belt endpoints.
 */
function rebuildTransportEndpoints(blueprint: Blueprint, project: CompiledFactoryProject): void {
  const endpointSpecs = new Map(blueprint.devices.filter((device) => device.transportEndpoint).map((device) => [device.id, {
    asset: device.asset,
    distance: device.transportEndpoint!.distance,
  }]));
  const ordinaryDevices = blueprint.devices.filter((device) => !device.transportEndpoint);
  const claimedIds = new Set(ordinaryDevices.map((device) => device.id));
  const endpoints: Blueprint["devices"] = [];
  const uniqueEndpointId = (base: string): string => {
    let id = base; let suffix = 1;
    while (claimedIds.has(id)) id = `${base}-${++suffix}`;
    claimedIds.add(id);
    return id;
  };

  for (const connection of blueprint.connections) {
    const source = ordinaryDevices.find((device) => device.id === connection.from.device);
    const target = ordinaryDevices.find((device) => device.id === connection.to.device);
    const sourceAsset = source ? project.deviceAssets[source.asset] : undefined;
    const targetAsset = target ? project.deviceAssets[target.asset] : undefined;
    const sourcePort = sourceAsset?.geometry.ports.find((port) => port.id === connection.from.port);
    const targetPort = targetAsset?.geometry.ports.find((port) => port.id === connection.to.port);
    const first = connection.path[0]; const last = connection.path.at(-1);
    const loaderSpec = endpointSpecs.get(connection.logistics.loader.device);
    const unloaderSpec = endpointSpecs.get(connection.logistics.unloader.device);
    if (!source || !target || !sourcePort || !targetPort || !first || !last || !loaderSpec || !unloaderSpec) {
      throw new Error(`Cannot rebuild explicit transport endpoints for '${connection.id}'`);
    }
    const loaderId = uniqueEndpointId(`${connection.id}-loader`);
    const unloaderId = uniqueEndpointId(`${connection.id}-unloader`);
    endpoints.push({
      id: loaderId, asset: loaderSpec.asset, region: source.region, position: structuredClone(first),
      rotation: transportEndpointRotation("loader", rotatePortSide(sourcePort.side, source.rotation)),
      transportEndpoint: { connection: connection.id, stage: "loader", distance: loaderSpec.distance },
    }, {
      id: unloaderId, asset: unloaderSpec.asset, region: target.region, position: structuredClone(last),
      rotation: transportEndpointRotation("unloader", rotatePortSide(targetPort.side, target.rotation)),
      transportEndpoint: { connection: connection.id, stage: "unloader", distance: unloaderSpec.distance },
    });
    connection.logistics.loader.device = loaderId;
    connection.logistics.unloader.device = unloaderId;
  }
  blueprint.devices = [...ordinaryDevices, ...endpoints];
}

function topologyPatch(before: Blueprint, after: Blueprint): JsonPatchOperation[] {
  const patch: JsonPatchOperation[] = [];
  const afterDevices = new Map(after.devices.map((device) => [device.id, device]));
  for (const [index, device] of before.devices.entries()) {
    const next = afterDevices.get(device.id);
    if (next && hashValue(device) !== hashValue(next)) patch.push({ op: "replace", path: `/devices/${index}`, value: next });
  }
  for (const index of before.devices.map((device, index) => ({ device, index }))
    .filter(({ device }) => !afterDevices.has(device.id)).map(({ index }) => index).sort((a, b) => b - a)) {
    patch.push({ op: "remove", path: `/devices/${index}` });
  }
  const beforeDeviceIds = new Set(before.devices.map((device) => device.id));
  for (const device of after.devices.filter((item) => !beforeDeviceIds.has(item.id))) patch.push({ op: "add", path: "/devices/-", value: device });

  const afterConnections = new Map(after.connections.map((connection) => [connection.id, connection]));
  for (const [index, connection] of before.connections.entries()) {
    const next = afterConnections.get(connection.id);
    if (next && hashValue(connection) !== hashValue(next)) patch.push({ op: "replace", path: `/connections/${index}`, value: next });
  }
  for (const index of before.connections.map((connection, index) => ({ connection, index }))
    .filter(({ connection }) => !afterConnections.has(connection.id)).map(({ index }) => index).sort((a, b) => b - a)) {
    patch.push({ op: "remove", path: `/connections/${index}` });
  }
  const beforeConnectionIds = new Set(before.connections.map((connection) => connection.id));
  for (const connection of after.connections.filter((item) => !beforeConnectionIds.has(item.id))) patch.push({ op: "add", path: "/connections/-", value: connection });
  return patch;
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

function duplicateProcessorCandidate(input: ResearchInput, original: CompiledFactoryProject["devices"][string], reason: string, strategyKey = `capacity:${original.id}`): StrategyCandidate | null {
  const instance = input.blueprint.devices.find((device) => device.id === original.id);
  const junctionAsset = Object.values(input.project.deviceAssets).find((asset) => asset.capabilities.includes("transport-junction")
    && asset.geometry.ports.filter((port) => port.direction === "input").length >= 2
    && asset.geometry.ports.filter((port) => port.direction === "output").length >= 2);
  if (!instance || !junctionAsset) return null;
  const id = uniqueDeviceId(input.blueprint, `${original.id}-parallel`);
  const clone = structuredClone(instance); clone.id = id;
  if (!placeDevice(input.blueprint, clone, input.project, original.position)) return null;
  const patch: JsonPatchOperation[] = [{ op: "add", path: "/devices/-", value: clone }];
  const candidateBlueprint = structuredClone(input.blueprint);
  candidateBlueprint.devices.push(clone);
  const grid = original.powerGrid ? input.production.powerGrids.find((item) => item.grid === original.powerGrid) : undefined;
  let powerSupport: Blueprint["devices"][number] | undefined;
  const adjacent = input.blueprint.connections.filter((connection) => connection.to.device === original.id || connection.from.device === original.id);
  const inputPorts = junctionAsset.geometry.ports.filter((port) => port.direction === "input");
  const outputPorts = junctionAsset.geometry.ports.filter((port) => port.direction === "output");
  let junctionCount = 0;
  for (const connection of adjacent) {
    const originalIndex = input.blueprint.connections.findIndex((item) => item.id === connection.id);
    const candidateIndex = candidateBlueprint.connections.findIndex((item) => item.id === connection.id);
    if (originalIndex < 0 || candidateIndex < 0) return null;
    const incoming = connection.to.device === original.id;
    if (!incoming) {
      let merged: Blueprint["connections"][number] | undefined;
      for (const [mergeIndex, mergeCell] of connection.path.entries()) {
        const candidate: Blueprint["connections"][number] = {
          ...structuredClone(connection), id: `${connection.id}-${id}`,
          from: { device: id, port: connection.from.port }, path: [],
        };
        const prefix = findBlueprintConnectionPath(candidateBlueprint, input.project.world, input.project.deviceAssets, candidate, { end: mergeCell, allowEndTransportCell: true });
        if (!prefix) continue;
        candidate.path = [...prefix, ...connection.path.slice(mergeIndex + 1)];
        merged = candidate; break;
      }
      if (!merged) return null;
      candidateBlueprint.connections.push(merged);
      patch.push({ op: "add", path: "/connections/-", value: merged });
      continue;
    }
    candidateBlueprint.connections.splice(candidateIndex, 1);
    const junction: Blueprint["devices"][number] = {
      id: uniqueDeviceId(candidateBlueprint, `${original.id}-split`),
      asset: junctionAsset.id, region: original.region, position: { x: 0, y: 0 }, rotation: 0,
      policy: { dispatch: "round-robin" },
    };
    const peerId = connection.from.device;
    const peer = input.project.devices[peerId];
    const preferred = peer ? { x: Math.round((original.position.x + peer.position.x) / 2), y: Math.round((original.position.y + peer.position.y) / 2) } : original.position;
    const bounds = input.project.regions[junction.region]?.bounds;
    if (!bounds) return null;
    const positions = Array.from({ length: bounds.width * bounds.height }, (_, index) => ({ x: index % bounds.width, y: Math.floor(index / bounds.width) }))
      .sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y) || a.y - b.y || a.x - b.x);
    const routeTemplates: Blueprint["connections"] = [
      { ...structuredClone(connection), to: { device: junction.id, port: inputPorts[0]!.id } },
      {
        ...structuredClone(connection), id: `${connection.id}-${junction.id}-original`,
        from: { device: junction.id, port: outputPorts[0]!.id }, to: structuredClone(connection.to), path: [],
      },
      {
        ...structuredClone(connection), id: `${connection.id}-${junction.id}-parallel`,
        from: { device: junction.id, port: outputPorts[1]!.id }, to: { device: id, port: connection.to.port }, path: [],
      },
    ];
    const routeOrders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let routed: Blueprint["connections"] | undefined;
    for (const position of positions) {
      junction.position = position;
      for (const rotation of [0, 90, 180, 270] as const) {
        junction.rotation = rotation;
        if (overlaps(candidateBlueprint, junction, input.project)) continue;
        candidateBlueprint.devices.push(junction);
        for (const order of routeOrders) {
          const candidates = structuredClone(routeTemplates);
          const routeStart = candidateBlueprint.connections.length;
          let valid = true;
          for (const routeIndex of order) {
            const route = candidates[routeIndex]!;
            const path = findBlueprintConnectionPath(candidateBlueprint, input.project.world, input.project.deviceAssets, route);
            if (!path) { valid = false; break; }
            route.path = path; candidateBlueprint.connections.push(route);
          }
          if (valid) { routed = candidates; break; }
          candidateBlueprint.connections.splice(routeStart);
        }
        if (routed) break;
        candidateBlueprint.devices.pop();
      }
      if (routed) break;
    }
    if (!routed) return null;
    junctionCount++;
    patch.push({ op: "add", path: "/devices/-", value: junction });
    patch.push({ op: "replace", path: `/connections/${originalIndex}`, value: routed[0]! });
    patch.push({ op: "add", path: "/connections/-", value: routed[1]! }, { op: "add", path: "/connections/-", value: routed[2]! });
  }
  const addedLoad = original.assetDef.power.consumptionMilliWatts + junctionCount * junctionAsset.power.consumptionMilliWatts;
  const needsPowerSupport = addedLoad > (grid?.headroomMilliWatts ?? 0);
  if (needsPowerSupport) {
    const generator = Object.values(input.project.deviceAssets)
      .filter((asset) => asset.power.generation?.kind === "renewable" && asset.power.generation.outputMilliWatts > asset.power.consumptionMilliWatts && asset.power.distribution)
      .sort((a, b) => ((b.power.generation?.outputMilliWatts ?? 0) - b.power.consumptionMilliWatts) - ((a.power.generation?.outputMilliWatts ?? 0) - a.power.consumptionMilliWatts) || a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
    if (!generator) return null;
    powerSupport = { id: uniqueDeviceId(input.blueprint, `${generator.id}-support`), asset: generator.id, region: original.region, position: { x: 0, y: 0 }, rotation: 0 };
    if (!placeDevice(candidateBlueprint, powerSupport, input.project, original.position)) return null;
    candidateBlueprint.devices.push(powerSupport);
    patch.push({ op: "add", path: "/devices/-", value: powerSupport });
  }
  rebuildTransportEndpoints(candidateBlueprint, input.project);
  patch.splice(0, patch.length, ...topologyPatch(input.blueprint, candidateBlueprint));
  return {
    key: strategyKey,
    proposal: {
      strategy: strategyKey,
      hypothesis: `Duplicate processor \`${original.id}\` as \`${id}\`${powerSupport ? ` with regional power support \`${powerSupport.id}\`` : ""} because ${reason}.`,
      expectedEffect: "Increase process capacity while preserving the existing resource, regional power, and logistics contracts.",
      patch,
    },
  };
}

function powerCandidates(input: ResearchInput): StrategyCandidate[] {
  const generators = Object.values(input.project.deviceAssets)
    .filter((asset) => asset.power.generation?.kind === "renewable" && asset.power.generation.outputMilliWatts > 0 && asset.power.distribution)
    .sort((a, b) => (b.power.generation?.outputMilliWatts ?? 0) - (a.power.generation?.outputMilliWatts ?? 0) || a.id.localeCompare(b.id));
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

function measuredStorageCandidates(input: ResearchInput): StrategyCandidate[] {
  const storageAssets = Object.values(input.project.deviceAssets).filter((asset) => asset.power.storage && asset.power.distribution)
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id));
  if (!storageAssets.length) return [];
  return Object.entries(input.metrics.powerGrids).sort(([a], [b]) => a.localeCompare(b)).flatMap(([gridId, measured]) => {
    if (measured.unservedMilliJoules <= 1e-6) return [];
    const grid = input.project.powerGrids[gridId];
    if (!grid) return [];
    const initialStoredMilliJoules = input.metrics.energyStorage[gridId]?.initialMilliJoules ?? 0;
    if (measured.generatedMilliJoules + initialStoredMilliJoules + 1e-6 < measured.demandMilliJoules) return [];
    const anchor = input.project.devices[grid.distributors[0]!];
    if (!anchor) return [];
    const successfulPlans = storageAssets.flatMap((asset) => {
      const storage = asset.power.storage!;
      const capacityCount = Math.ceil(Math.max(0, measured.requiredStorageCapacityMilliJoules - grid.storageCapacityMilliJoules) / storage.capacityMilliJoules);
      const dischargeCount = Math.ceil(Math.max(0, measured.peakDeficitMilliWatts - grid.storageDischargeMilliWatts) / storage.dischargeMilliWatts);
      const estimatedCount = Math.max(1, capacityCount, dischargeCount);
      const candidateBlueprint = structuredClone(input.blueprint); const devices: Blueprint["devices"] = [];
      for (let count = 1; count <= estimatedCount + 8; count++) {
        const device: Blueprint["devices"][number] = {
          id: uniqueDeviceId(candidateBlueprint, `${asset.id}-${grid.region}-reserve`), asset: asset.id,
          region: grid.region, position: { x: 0, y: 0 }, rotation: 0,
        };
        if (!placeDevice(candidateBlueprint, device, input.project, anchor.position)) return [];
        candidateBlueprint.devices.push(device); devices.push(device);
        if (count < estimatedCount) continue;
        try {
          const candidateProject = compileFactoryProject({ ...input.project, blueprint: candidateBlueprint });
          const candidateGrid = candidateProject.devices[anchor.id]?.powerGrid;
          const candidatePower = candidateGrid ? runUntil(candidateProject).metrics.powerGrids[candidateGrid] : undefined;
          if (candidatePower && candidatePower.unservedMilliJoules <= 1e-6) return [{
            asset, devices: structuredClone(devices), count,
            cost: count * asset.economics.buildCost,
            area: count * asset.geometry.footprint.width * asset.geometry.footprint.height,
          }];
        } catch { /* This asset/count is not a compileable measured repair; continue the bounded search. */ }
      }
      return [];
    }).sort((a, b) => a.cost - b.cost || a.area - b.area || a.asset.id.localeCompare(b.asset.id));
    const selected = successfulPlans[0];
    if (!selected) return [];
    const devices = selected.devices;
    const key = `storage:${gridId}:${grid.storageDevices.length}->${grid.storageDevices.length + devices.length}`;
    return [{ key, proposal: {
      strategy: key,
      hypothesis: `Add ${devices.length} ${selected.asset.id} Device${devices.length === 1 ? "" : "s"} to \`${gridId}\` because simulation left ${(measured.unservedMilliJoules / 1e6).toFixed(3)} MJ of demand unserved during intermittent generation.`,
      expectedEffect: `Raise grid storage toward the measured ${(measured.requiredStorageCapacityMilliJoules / 1e6).toFixed(3)} MJ contiguous-deficit envelope and ${(measured.peakDeficitMilliWatts / 1000).toFixed(3)} W peak discharge requirement; KEEP only if the same Scenario score improves.`,
      patch: devices.map((device) => ({ op: "add" as const, path: "/devices/-", value: device })),
    } }];
  });
}

function measuredGenerationCandidates(input: ResearchInput): StrategyCandidate[] {
  const generatorAssets = Object.values(input.project.deviceAssets).filter((asset) => asset.power.generation?.kind === "renewable" && asset.power.distribution)
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id));
  if (!generatorAssets.length) return [];
  return Object.entries(input.metrics.powerGrids).sort(([a], [b]) => a.localeCompare(b)).flatMap(([gridId, measured]) => {
    const grid = input.project.powerGrids[gridId];
    if (!grid || measured.unservedMilliJoules <= 1e-6) return [];
    const initialStoredMilliJoules = input.metrics.energyStorage[gridId]?.initialMilliJoules ?? 0;
    if (measured.generatedMilliJoules + initialStoredMilliJoules + 1e-6 >= measured.demandMilliJoules) return [];
    const anchor = input.project.devices[grid.distributors[0]!];
    if (!anchor) return [];
    const successfulPlans = generatorAssets.flatMap((asset) => {
      const generation = asset.power.generation!;
      const profile = renewableProfileFor(input.project.scenario, grid.region, asset.id);
      const single = evaluatePowerEnvelope({
        durationTicks: input.project.scenario.durationTicks, loadMilliWatts: 0,
        sources: [{ outputMilliWatts: generation.outputMilliWatts, count: 1, ...(profile ? { profile } : {}) }],
      });
      if (single.generatedMilliJoules <= 1e-6) return [];
      const estimatedCount = Math.max(1, Math.ceil((measured.demandMilliJoules - measured.generatedMilliJoules - initialStoredMilliJoules) / single.generatedMilliJoules - 1e-9));
      const candidateBlueprint = structuredClone(input.blueprint); const devices: Blueprint["devices"] = [];
      for (let count = 1; count <= estimatedCount + 8; count++) {
        const device: Blueprint["devices"][number] = {
          id: uniqueDeviceId(candidateBlueprint, `${asset.id}-${grid.region}-generation`), asset: asset.id,
          region: grid.region, position: { x: 0, y: 0 }, rotation: 0,
        };
        if (!placeDevice(candidateBlueprint, device, input.project, anchor.position)) return [];
        candidateBlueprint.devices.push(device); devices.push(device);
        if (count < estimatedCount) continue;
        try {
          const candidateProject = compileFactoryProject({ ...input.project, blueprint: candidateBlueprint });
          const candidateGrid = candidateProject.devices[anchor.id]?.powerGrid;
          const candidatePower = candidateGrid ? runUntil(candidateProject).metrics.powerGrids[candidateGrid] : undefined;
          if (candidatePower && candidatePower.unservedMilliJoules <= 1e-6) return [{
            asset, devices: structuredClone(devices), count,
            cost: count * asset.economics.buildCost,
            area: count * asset.geometry.footprint.width * asset.geometry.footprint.height,
          }];
        } catch { /* Continue the bounded project-local generation search. */ }
      }
      return [];
    }).sort((a, b) => a.cost - b.cost || a.area - b.area || a.asset.id.localeCompare(b.asset.id));
    const selected = successfulPlans[0];
    if (!selected) return [];
    const key = `generation:${gridId}:${selected.asset.id}:+${selected.count}`;
    return [{ key, proposal: {
      strategy: key,
      hypothesis: `Add ${selected.count} profiled ${selected.asset.id} Device${selected.count === 1 ? "" : "s"} to \`${gridId}\` because Scenario generation was short by ${((measured.demandMilliJoules - measured.generatedMilliJoules - initialStoredMilliJoules) / 1e6).toFixed(3)} MJ.`,
      expectedEffect: "Supply the measured energy deficit with ordinary project-local renewable Devices that inherit the same regional Scenario curve; KEEP only if re-evaluation improves the Objective score.",
      patch: selected.devices.map((device) => ({ op: "add" as const, path: "/devices/-", value: device })),
    } }];
  });
}

function logisticsUpgradeCandidate(input: ResearchInput, connectionId: string, reason: string): StrategyCandidate | null {
  const connectionIndex = input.blueprint.connections.findIndex((connection) => connection.id === connectionId);
  const compiled = input.project.connections[connectionId];
  if (connectionIndex < 0 || !compiled) return null;
  const stageIntervals = compiled.logisticsStages.map((stage) => ({ stage, interval: Math.ceil(stage.durationTicks / stage.capacity), stackCapacity: stage.stackCapacity }));
  const currentInterval = Math.max(...stageIntervals.map((item) => item.interval));
  const currentStackCapacity = Math.min(...stageIntervals.map((item) => item.stackCapacity));
  const currentItemCapacity = currentStackCapacity * 60_000 / currentInterval;
  const bottlenecks = stageIntervals.filter((item) => item.interval === currentInterval || item.stackCapacity === currentStackCapacity);
  const upgrades = bottlenecks.flatMap(({ stage, interval: stageInterval, stackCapacity }) => {
    const alternatives = Object.values(input.project.deviceAssets).filter((asset) => asset.logistics?.roles.includes(stage.stage) && asset.id !== stage.asset.id).flatMap((asset) => {
      const plan = planDeviceTransport(asset.id, asset.program, { apiVersion: 1, connection: compiled.id, stage: stage.stage, distance: stage.distance });
      if (stage.stage === "line" && plan.capacity !== stage.distance) return [];
      const interval = Math.ceil(plan.durationTicks / plan.capacity);
      const improvesInterval = stageInterval === currentInterval && interval < currentInterval;
      const improvesStack = stackCapacity === currentStackCapacity && plan.stackCapacity > currentStackCapacity;
      if (interval > currentInterval || plan.stackCapacity < currentStackCapacity || (!improvesInterval && !improvesStack)) return [];
      return [{ asset, interval, stackCapacity: plan.stackCapacity }];
    }).sort((a, b) => b.stackCapacity / b.interval - a.stackCapacity / a.interval
      || a.asset.economics.buildCost - b.asset.economics.buildCost || a.asset.id.localeCompare(b.asset.id));
    return alternatives[0] ? [{ stage, replacement: alternatives[0] }] : [];
  });
  if (upgrades.length !== bottlenecks.length) return null;
  const replacements = new Map(upgrades.map((upgrade) => [upgrade.stage.stage, upgrade.replacement]));
  const nextInterval = Math.max(...stageIntervals.map((item) => replacements.get(item.stage.stage)?.interval ?? item.interval));
  const nextStackCapacity = Math.min(...stageIntervals.map((item) => replacements.get(item.stage.stage)?.stackCapacity ?? item.stackCapacity));
  const nextItemCapacity = nextStackCapacity * 60_000 / nextInterval;
  if (nextItemCapacity <= currentItemCapacity) return null;
  const key = `logistics:${compiled.id}:${upgrades.map((upgrade) => `${upgrade.stage.stage}:${upgrade.replacement.asset.id}`).join("+")}`;
  return { key, proposal: {
    strategy: key,
    hypothesis: `Upgrade bottleneck stages on \`${compiled.id}\` (${upgrades.map((upgrade) => `${upgrade.stage.stage}: ${upgrade.stage.asset.id} → ${upgrade.replacement.asset.id}`).join(", ")}) because ${reason}.`,
    expectedEffect: `Increase the transport envelope from ${currentItemCapacity.toFixed(3)} to ${nextItemCapacity.toFixed(3)} items/min (dispatch ${currentInterval}→${nextInterval} ms, stack ${currentStackCapacity}→${nextStackCapacity}).`,
    patch: upgrades.map((upgrade) => {
      if (upgrade.stage.stage === "line") return { op: "replace" as const, path: `/connections/${connectionIndex}/logistics/line/deviceAsset`, value: upgrade.replacement.asset.id };
      const deviceIndex = input.blueprint.devices.findIndex((device) => device.id === upgrade.stage.device?.id);
      if (deviceIndex < 0) throw new Error(`Missing explicit ${upgrade.stage.stage} Device for '${compiled.id}'`);
      return { op: "replace" as const, path: `/devices/${deviceIndex}/asset`, value: upgrade.replacement.asset.id };
    }),
  } };
}

function logisticsCandidates(input: ResearchInput): StrategyCandidate[] {
  const candidates: StrategyCandidate[] = [];
  for (const diagnostic of input.production.diagnostics.filter((item) => item.code === "input-logistics" || item.code === "output-logistics")) {
    const links = input.production.connections.filter((connection) => connection.resources.includes(diagnostic.resource!)
      && (diagnostic.code === "input-logistics" ? connection.to === diagnostic.device : connection.from === diagnostic.device));
    for (const link of links) {
      const candidate = logisticsUpgradeCandidate(input, link.connection, diagnostic.message);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

function measuredLogisticsCandidates(input: ResearchInput): StrategyCandidate[] {
  return Object.entries(input.metrics.transportFlows)
    .filter(([, flow]) => flow.deliveredItems >= 2 && flow.utilization >= 0.7)
    .sort(([, a], [, b]) => b.utilization - a.utilization || b.blockedItemTicks - a.blockedItemTicks)
    .flatMap(([connection, flow]) => {
      const resourceMix = Object.entries(flow.deliveredByResource).sort(([a], [b]) => a.localeCompare(b))
        .map(([resource, count]) => `${count} ${resource}`).join(" + ");
      const candidate = logisticsUpgradeCandidate(input, connection,
        `simulation delivered ${flow.deliveredItemsPerMinute.toFixed(3)}/${flow.capacityItemsPerMinute.toFixed(3)} items/min (${(flow.utilization * 100).toFixed(1)}% utilization${flow.blockedItemTicks ? `, ${flow.blockedItemTicks} blocked item-ticks` : ""}; ${resourceMix || "no delivered resources"})`);
      return candidate ? [candidate] : [];
    });
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
    const connectionIndex = input.blueprint.connections.indexOf(connection);
    const inputPort = bufferAsset.geometry.ports.find((port) => port.direction === "input")!;
    const outputPort = bufferAsset.geometry.ports.find((port) => port.direction === "output")!;
    const candidateBlueprint = structuredClone(input.blueprint);
    candidateBlueprint.connections.splice(connectionIndex, 1);
    const bounds = input.project.regions[buffer.region]?.bounds; if (!bounds) continue;
    const positions = Array.from({ length: bounds.width * bounds.height }, (_, index) => ({ x: index % bounds.width, y: Math.floor(index / bounds.width) }))
      .sort((a, b) => Math.hypot(a.x - original.position.x, a.y - original.position.y) - Math.hypot(b.x - original.position.x, b.y - original.position.y) || a.y - b.y || a.x - b.x);
    let inbound: Blueprint["connections"][number] | undefined;
    let outbound: Blueprint["connections"][number] | undefined;
    for (const position of positions) {
      buffer.position = position;
      if (overlaps(candidateBlueprint, buffer, input.project)) continue;
      candidateBlueprint.devices.push(buffer);
      for (const order of [["in", "out"], ["out", "in"]] as const) {
        const nextInbound: Blueprint["connections"][number] = { ...structuredClone(connection), to: { device: id, port: inputPort.id }, path: [] };
        const nextOutbound: Blueprint["connections"][number] = {
          ...structuredClone(connection), id: `${connection.id}-${id}-output`, from: { device: id, port: outputPort.id }, path: [],
        };
        const routes = { in: nextInbound, out: nextOutbound }; const routeStart = candidateBlueprint.connections.length;
        let valid = true;
        for (const key of order) {
          const route = routes[key]; const path = findBlueprintConnectionPath(candidateBlueprint, input.project.world, input.project.deviceAssets, route);
          if (!path) { valid = false; break; }
          route.path = path; candidateBlueprint.connections.push(route);
        }
        if (valid) { inbound = nextInbound; outbound = nextOutbound; break; }
        candidateBlueprint.connections.splice(routeStart);
      }
      if (inbound && outbound) break;
      candidateBlueprint.devices.pop();
    }
    if (!inbound || !outbound) continue;
    rebuildTransportEndpoints(candidateBlueprint, input.project);
    const key = `buffer:${connection.id}`;
    candidates.push({ key, proposal: {
      strategy: key,
      hypothesis: `Insert buffer \`${id}\` after \`${original.id}\` because it spent ${input.metrics.blockedOutputTime[original.id]} ticks blocked.`,
      expectedEffect: "Decouple producer completion from downstream demand and expose whether storage relieves the measured blockage.",
      patch: topologyPatch(input.blueprint, candidateBlueprint),
    } });
  }
  return candidates;
}

function policyCandidates(input: ResearchInput): StrategyCandidate[] {
  const current = input.blueprint.policies?.dispatch ?? "fifo";
  const policies = ["fifo", "round-robin", "shortage-first"] as const;
  const next = policies[(policies.indexOf(current) + 1) % policies.length]!;
  const operation: JsonPatchOperation = input.blueprint.policies?.dispatch
    ? { op: "replace", path: "/policies/dispatch", value: next }
    : input.blueprint.policies
      ? { op: "add", path: "/policies/dispatch", value: next }
      : { op: "add", path: "/policies", value: { dispatch: next } };
  return [{ key: `dispatch:${next}`, proposal: {
    strategy: `dispatch:${next}`,
    hypothesis: `Switch the factory-wide contested-output policy from ${current} to ${next}.`,
    expectedEffect: "Test whether deterministic output arbitration reduces starvation or blockage in the measured topology; shortage-first uses destination batch coverage and objective critical depth.",
    patch: [operation],
  } }];
}

function stationPolicyCandidates(input: ResearchInput): StrategyCandidate[] {
  const policies = ["fifo", "round-robin", "shortage-first"] as const;
  return input.blueprint.logisticsNetworks.flatMap((network, index) => {
    if ((input.project.logisticsNetworks[network.id]?.routes.length ?? 0) < 2) return [];
    const current = network.dispatch ?? input.blueprint.policies?.dispatch ?? "fifo";
    const next = policies[(policies.indexOf(current) + 1) % policies.length]!;
    const operation: JsonPatchOperation = network.dispatch
      ? { op: "replace", path: `/logisticsNetworks/${index}/dispatch`, value: next }
      : { op: "add", path: `/logisticsNetworks/${index}/dispatch`, value: next };
    const key = `station-dispatch:${network.id}:${next}`;
    return [{ key, proposal: {
      strategy: key,
      hypothesis: `Switch shared-fleet arbitration on ${network.id} from ${current} to ${next}.`,
      expectedEffect: "Test whether demand coverage and Objective depth allocate finite carriers better than stable or rotating route order while preserving explicit slot priorities.",
      patch: [operation],
    } }];
  });
}

function exploratoryStationCandidates(input: ResearchInput): StrategyCandidate[] {
  return input.blueprint.logisticsNetworks.map((network, index) => {
    const count = network.fleet.count + 1;
    return { key: `station-fleet:${network.id}:${count}`, proposal: {
      strategy: `station-fleet:${network.id}:${count}`,
      hypothesis: `Probe one additional carrier on ${network.id} (${network.fleet.count} → ${count}) even though static fleet load is currently feasible.`,
      expectedEffect: "Measure whether dynamic contention or burst timing makes nominally spare station capacity valuable.",
      patch: [{ op: "replace" as const, path: `/logisticsNetworks/${index}/fleet/count`, value: count }],
    } };
  });
}

function recipeCandidates(input: ResearchInput): StrategyCandidate[] {
  return input.production.recipeOptions.flatMap((option) => {
    if (option.selected || option.targetOutputPerMinute <= 0 || option.minimumInputTreatmentLevel > 0) return [];
    const current = input.production.recipeOptions.find((candidate) => candidate.device === option.device && candidate.selected);
    if (!current || option.targetOutputPerMinute <= current.targetOutputPerMinute + 1e-9) return [];
    const deviceIndex = input.blueprint.devices.findIndex((device) => device.id === option.device);
    if (deviceIndex < 0) return [];
    const key = `recipe:${option.device}:${option.process}:${option.mode}`;
    return [{ key, proposal: {
      strategy: key,
      hypothesis: `Switch \`${option.device}\` from \`${current.process}/${current.mode}\` to \`${option.process}/${option.mode}\` because nominal ${input.project.objective.targetResource} capacity rises from ${current.targetOutputPerMinute.toFixed(3)} to ${option.targetOutputPerMinute.toFixed(3)}/min.`,
      expectedEffect: "Test a project-local alternative recipe with explicit Resource-to-physical-port bindings through the same deterministic simulation and score gate.",
      patch: [{ op: "replace" as const, path: `/devices/${deviceIndex}/recipe`, value: {
        process: option.process, mode: option.mode, inputs: option.inputPorts, outputs: option.outputPorts,
      } }],
    } }];
  }).sort((a, b) => {
    const left = input.production.recipeOptions.find((option) => a.key === `recipe:${option.device}:${option.process}:${option.mode}`)!;
    const right = input.production.recipeOptions.find((option) => b.key === `recipe:${option.device}:${option.process}:${option.mode}`)!;
    return right.targetOutputPerMinute - left.targetOutputPerMinute || a.key.localeCompare(b.key);
  });
}

function plannedCapacityCandidates(input: ResearchInput): StrategyCandidate[] {
  return input.capacityPlan.processes.filter((requirement) => requirement.additionalMachines > 0).flatMap((requirement) => {
    const original = input.project.devices[requirement.templateDevice];
    if (!original) return [];
    const strategy = `capacity-plan:${requirement.process}:${requirement.configuredMachines}->${requirement.configuredMachines + 1}`;
    const candidate = duplicateProcessorCandidate(input, original,
      `the ${input.capacityPlan.targetRatePerMinute.toFixed(3)} ${input.capacityPlan.targetResource}/min plan requires ${requirement.requiredMachines} ${requirement.asset} running ${requirement.process}, but only ${requirement.configuredMachines} are configured`, strategy);
    return candidate ? [candidate] : [];
  });
}

export class HeuristicResearchAgent implements BlueprintResearchAgent {
  async propose(input: ResearchInput): Promise<ResearchProposal> {
    const used = new Set(input.history.map((entry) => entry.strategy));
    const candidates: StrategyCandidate[] = [
      ...powerCandidates(input), ...measuredGenerationCandidates(input), ...measuredStorageCandidates(input), ...logisticsCandidates(input), ...measuredLogisticsCandidates(input), ...stationCandidates(input),
      ...recipeCandidates(input), ...plannedCapacityCandidates(input),
    ];
    const diagnosed = candidates.find((candidate) => !used.has(candidate.key));
    if (diagnosed) return diagnosed.proposal;
    for (const diagnostic of input.production.diagnostics.filter((item) => item.code === "material-deficit" && item.resource)) {
      const producer = input.production.devices.filter((device) => (device.outputsPerMinute[diagnostic.resource!] ?? 0) > 0)
        .sort((a, b) => (b.outputsPerMinute[diagnostic.resource!] ?? 0) - (a.outputsPerMinute[diagnostic.resource!] ?? 0) || a.device.localeCompare(b.device))[0];
      if (producer) {
        const candidate = duplicateProcessorCandidate(input, input.project.devices[producer.device]!, diagnostic.message);
        if (candidate) candidates.push(candidate);
      }
    }
    candidates.push(...bufferCandidates(input));
    candidates.push(...policyCandidates(input));
    candidates.push(...stationPolicyCandidates(input));
    candidates.push(...exploratoryStationCandidates(input));
    const processors = Object.values(input.project.devices).filter((device) => device.assetDef.capabilities.includes("process"))
      .sort((a, b) => (input.metrics.machineUtilization[b.id] ?? 0) - (input.metrics.machineUtilization[a.id] ?? 0) || a.id.localeCompare(b.id));
    for (const processor of processors) {
      const candidate = duplicateProcessorCandidate(input, processor, `its measured utilization is ${((input.metrics.machineUtilization[processor.id] ?? 0) * 100).toFixed(1)}%`);
      if (candidate) candidates.push(candidate);
    }
    const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.key, candidate])).values()];
    const selected = uniqueCandidates.find((candidate) => !used.has(candidate.key)) ?? uniqueCandidates[input.iteration % Math.max(1, uniqueCandidates.length)];
    if (!selected) throw new Error("Heuristic agent found no valid blueprint strategy to evaluate");
    return selected.proposal;
  }
}

export interface ResearchOptions extends ProjectSelection { iterations: number; seed: number; agent?: BlueprintResearchAgent }
export interface ResearchIteration { iteration: number; decision: "KEEP" | "REVERT"; score: number; previousScore: number; run: RunSummary; proposal: ResearchProposal }
export interface ResearchResult { baseline: RunSummary; iterations: ResearchIteration[]; bestScore: number; bestBlueprint: Blueprint }

function withBlueprint(loaded: LoadedFactoryProject, blueprint: Blueprint): LoadedFactoryProject { return { ...loaded, blueprint }; }

export async function researchFactory(projectDir: string, options: ResearchOptions): Promise<ResearchResult> {
  const selectedBlueprintId = options.blueprint;
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
    const proposal = await agent.propose({
      iteration, project, blueprint: bestBlueprint, metrics: bestResult.metrics,
      production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history,
    });
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
      const blueprintPath = join(loaded.rootDir, "blueprints", `${selectedBlueprintId ?? loaded.manifest.defaultBlueprint}.blueprint.json`);
      const currentBlueprint = JSON.parse(await readFile(blueprintPath, "utf8")) as Blueprint;
      if (hashValue(currentBlueprint) !== hashValue(bestBlueprint)) throw new Error(`Blueprint changed during research; refusing to overwrite ${blueprintPath}`);
      bestBlueprint = candidateBlueprint; bestResult = candidateResult; project = candidateProject;
      loaded = withBlueprint(loaded, bestBlueprint); parentRun = run;
      await atomicWriteJson(blueprintPath, bestBlueprint);
    }
  }
  return { baseline, iterations, bestScore: bestResult.metrics.finalScore, bestBlueprint };
}
