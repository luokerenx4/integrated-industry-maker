import { join } from "node:path";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { Blueprint, CompiledFactoryProject, FactoryMetrics } from "./types";
import type { JsonPatchOperation, RunSummary } from "./artifacts";
import { writeRunArtifact } from "./artifacts";
import { compileFactoryProject } from "./compiler";
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
}
export interface ResearchProposal { hypothesis: string; patch: JsonPatchOperation[]; expectedEffect?: string }
export interface BlueprintResearchAgent { propose(input: ResearchInput): Promise<ResearchProposal> }
export interface LlmResearchProvider {
  complete(input: { system: string; project: ResearchInput }): Promise<ResearchProposal>;
}

export class ProviderResearchAgent implements BlueprintResearchAgent {
  constructor(private readonly provider: LlmResearchProvider) {}
  propose(input: ResearchInput): Promise<ResearchProposal> {
    return this.provider.complete({
      system: "Return a hypothesis and an RFC 6902 patch. You may modify only blueprint devices, connections, and policies. Never modify assets, scenarios, objectives, simulator, or evaluator.",
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

const allowedRoots = new Set(["devices", "connections", "policies"]);
export function validateResearchPatch(patch: JsonPatchOperation[]): void {
  if (!Array.isArray(patch) || patch.length === 0) throw new Error("Research patch must contain at least one operation");
  for (const [index, operation] of patch.entries()) {
    if (!(["add", "remove", "replace"] as string[]).includes(operation.op)) throw new Error(`Patch operation ${index} uses unsupported op '${operation.op}'`);
    if (!operation.path.startsWith("/")) throw new Error(`Patch operation ${index} path must be an absolute JSON pointer`);
    const root = operation.path.split("/")[1];
    if (!root || !allowedRoots.has(root)) throw new Error(`Patch operation ${index} cannot modify '${operation.path}'. Research may only edit /devices, /connections, or /policies`);
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
  if (device.position.x + width > blueprint.bounds.width || device.position.y + height > blueprint.bounds.height) return true;
  return blueprint.devices.some((other) => {
    const otherAsset = project.deviceAssets[other.asset]!;
    const ow = other.rotation === 90 || other.rotation === 270 ? otherAsset.geometry.footprint.height : otherAsset.geometry.footprint.width;
    const oh = other.rotation === 90 || other.rotation === 270 ? otherAsset.geometry.footprint.width : otherAsset.geometry.footprint.height;
    return device.position.x < other.position.x + ow && device.position.x + width > other.position.x && device.position.y < other.position.y + oh && device.position.y + height > other.position.y;
  });
}

export class HeuristicResearchAgent implements BlueprintResearchAgent {
  async propose(input: ResearchInput): Promise<ResearchProposal> {
    const processors = Object.values(input.project.devices).filter((device) => device.assetDef.capabilities.includes("process"));
    const original = processors.sort((a, b) => (input.metrics.machineUtilization[b.id] ?? 0) - (input.metrics.machineUtilization[a.id] ?? 0) || a.id.localeCompare(b.id))[0];
    if (!original) throw new Error("Heuristic agent found no processor to improve");
    const bufferAsset = Object.values(input.project.deviceAssets).find((asset) => asset.capabilities.includes("store"));
    const bufferedConnection = input.blueprint.connections.find((connection) => connection.from.device === original.id);
    if (input.iteration % 3 === 2 && bufferAsset && bufferedConnection) {
      const base = `${original.id}-buffer`; let suffix = 1; let id = base;
      while (input.blueprint.devices.some((device) => device.id === id)) id = `${base}-${++suffix}`;
      const buffer = { id, asset: bufferAsset.id, position: { x: 0, y: 0 }, rotation: 0 as const };
      let found = false;
      for (let y = 0; y < input.blueprint.bounds.height && !found; y++) for (let x = 0; x < input.blueprint.bounds.width && !found; x++) {
        buffer.position = { x, y }; if (!overlaps(input.blueprint, buffer, input.project)) found = true;
      }
      if (!found) throw new Error(`No free blueprint position for buffer '${bufferAsset.id}'`);
      const connectionIndex = input.blueprint.connections.indexOf(bufferedConnection);
      const bufferInput = bufferAsset.geometry.ports.find((port) => port.direction === "input")!;
      const bufferOutput = bufferAsset.geometry.ports.find((port) => port.direction === "output")!;
      const newConnection = {
        id: `${bufferedConnection.id}-${id}-output`, from: { device: id, port: bufferOutput.id }, to: structuredClone(bufferedConnection.to),
        logistics: structuredClone(bufferedConnection.logistics),
      };
      return {
        hypothesis: `Insert buffer \`${id}\` after \`${original.id}\` to decouple processor output from downstream demand.`,
        expectedEffect: "Reduce blocked-output time and intermediate transport congestion.",
        patch: [
          { op: "add", path: "/devices/-", value: buffer },
          { op: "replace", path: `/connections/${connectionIndex}/to`, value: { device: id, port: bufferInput.id } },
          { op: "add", path: "/connections/-", value: newConnection },
        ],
      };
    }
    const base = `${original.id}-parallel`; let suffix = 1; let id = base;
    while (input.blueprint.devices.some((device) => device.id === id)) id = `${base}-${++suffix}`;
    const clone = structuredClone(input.blueprint.devices.find((device) => device.id === original.id)!);
    clone.id = id;
    let found = false;
    for (let y = 0; y < input.blueprint.bounds.height && !found; y++) for (let x = 0; x < input.blueprint.bounds.width && !found; x++) {
      clone.position = { x, y }; if (!overlaps(input.blueprint, clone, input.project)) found = true;
    }
    if (!found) throw new Error(`No free blueprint position for parallel ${original.asset}`);
    const patch: JsonPatchOperation[] = [{ op: "add", path: "/devices/-", value: clone }];
    const incoming = input.blueprint.connections.filter((connection) => connection.to.device === original.id);
    const outgoing = input.blueprint.connections.filter((connection) => connection.from.device === original.id);
    for (const connection of [...incoming, ...outgoing]) {
      const copy = structuredClone(connection);
      copy.id = `${connection.id}-${id}`;
      if (copy.to.device === original.id) copy.to.device = id;
      if (copy.from.device === original.id) copy.from.device = id;
      patch.push({ op: "add", path: "/connections/-", value: copy });
    }
    return {
      hypothesis: `Duplicate highly utilized processor \`${original.id}\` as \`${id}\` and connect it in parallel.`,
      expectedEffect: "Reduce processor saturation and increase target-material throughput.", patch,
    };
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
    const proposal = await agent.propose({ iteration, project, blueprint: bestBlueprint, metrics: bestResult.metrics, production: analyzeProduction(project) });
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
