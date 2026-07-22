import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { loadBlueprintBenchmark, type BlueprintBenchmarkManifest } from "./benchmark";
import { planProductionCapacity } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type LoadedFactoryProject } from "./loader";
import { analyzeProduction } from "./production-analysis";
import { synthesizeProjectBlueprint, type ProjectBlueprintSynthesis } from "./project-synthesis";
import { manifestSchema } from "./schema";
import type { Blueprint } from "./types";
import { hashValue, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const strategyEntry = z.string().min(1).refine((value) => !value.startsWith("/") && !value.split(/[\\/]/).includes("..") && value.endsWith(".ts"), "must be a project-relative TypeScript file");

export const designDecisionFamilySchema = z.enum([
  "power",
  "storage",
  "generation",
  "logistics",
  "station-fleet",
  "station-charge",
  "station-high-speed",
  "buffer",
  "dispatch",
  "station-dispatch",
  "recipe",
  "capacity",
  "capacity-plan",
  "toolset-capacity",
  "specialize",
  "maintenance",
  "batch-formation",
  "setup-campaign",
]);

const decisionFamiliesSchema = z.array(designDecisionFamilySchema).min(1).superRefine((families, context) => {
  const seen = new Set<string>();
  for (const [index, family] of families.entries()) {
    if (seen.has(family)) context.addIssue({ code: "custom", path: [index], message: `duplicates decision family '${family}'` });
    seen.add(family);
  }
});

export const designSeedSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blueprint"), blueprint: id }).strict(),
  z.object({ kind: z.literal("synthesis"), inputBlueprint: id }).strict(),
]);

export const designProgramSchema = z.object({
  version: z.literal(1),
  id,
  name: z.string().min(1),
  description: z.string().min(1),
  benchmark: id,
  seed: designSeedSchema,
  driverCase: id,
  proposal: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("heuristic"), decisionFamilies: decisionFamiliesSchema }).strict(),
    z.object({ kind: z.literal("project-strategy"), entry: strategyEntry, decisionFamilies: decisionFamiliesSchema }).strict(),
  ]),
  budget: z.object({
    maxCandidates: z.number().int().min(1).max(100),
  }).strict(),
}).strict();

export type DesignDecisionFamily = z.infer<typeof designDecisionFamilySchema>;
export type DesignSeed = z.infer<typeof designSeedSchema>;
export type DesignProgramManifest = z.infer<typeof designProgramSchema>;

function projectEntryPath(projectDir: string, entry: string, label: string): string {
  const root = resolve(projectDir);
  const entryPath = resolve(root, entry);
  if (entryPath !== root && !entryPath.startsWith(`${root}${sep}`)) throw new Error(`${label} escapes the project directory: ${entry}`);
  return entryPath;
}

export async function designProgramHash(projectDir: string, program: DesignProgramManifest): Promise<string> {
  const sources: Record<string, { entry: string; source: string }> = {};
  if (program.proposal.kind === "project-strategy") {
    sources.proposal = {
      entry: program.proposal.entry,
      source: await readFile(projectEntryPath(projectDir, program.proposal.entry, "Design proposal strategy"), "utf8"),
    };
  }
  if (program.seed.kind === "synthesis") {
    const manifest = manifestSchema.parse(await readJson(join(resolve(projectDir), "inm.json")));
    if (manifest.synthesis?.strategy) {
      sources.synthesis = {
        entry: manifest.synthesis.strategy,
        source: await readFile(projectEntryPath(projectDir, manifest.synthesis.strategy, "Project synthesis strategy"), "utf8"),
      };
    }
  }
  return hashValue({ manifest: program, sources });
}

function proposalSummary(proposal: DesignProgramManifest["proposal"]): DesignProgramManifest["proposal"] {
  return proposal.kind === "heuristic"
    ? { kind: proposal.kind, decisionFamilies: [...proposal.decisionFamilies] }
    : { kind: proposal.kind, entry: proposal.entry, decisionFamilies: [...proposal.decisionFamilies] };
}

export interface DesignProgramSummary {
  id: string;
  name: string;
  description: string;
  benchmark: string;
  seed: DesignSeed;
  driverCase: string;
  proposal: DesignProgramManifest["proposal"];
  budget: DesignProgramManifest["budget"];
  programHash: string;
  locked: boolean;
}

export interface DesignProgramBrief {
  version: 1;
  project: { id: string; name: string; rootDir: string };
  program: DesignProgramSummary;
  benchmark: {
    id: string;
    name: string;
    contractHash: string;
    cases: number;
    acceptance: {
      minimumAggregateScoreDelta: number;
      maximumCaseScoreRegression: number;
      requireCandidateCapacityReady: boolean;
    };
  };
  seed: {
    source: DesignSeed;
    sourceBlueprintHash: string;
    blueprintHash: string;
    synthesis?:
      | { method: "fungible-flow" }
      | { method: "project-strategy"; entry: string; contentHash: string; summary: { title: string; trackedRoute?: string; notes: string[] } };
  };
  promotionBase: { blueprint: string; hash: string };
  driver: {
    case: { id: string; name: string; weight: number; seed: number };
    selection: { world: string; blueprint: string; scenario: string; objective: string };
    hashes: {
      engineVersion: string;
      resourceCatalogHash: string;
      processCatalogHash: string;
      routeCatalogHash: string;
      deviceCatalogHash: string;
      worldHash: string;
      blueprintHash: string;
      scenarioHash: string;
      objectiveHash: string;
    };
  };
  staticEvidence: {
    capacity: { state: "ready" | "blocked"; gapCount: number; gapsByKind: Record<string, number> };
    flow: { warningCount: number; infoCount: number };
    devices: { total: number; declarative: number; opaque: number };
    topology: { regions: number; connections: number; trackedRoutes: number; powerGrids: number };
  };
}

export interface PreparedDesignProgram {
  manifest: DesignProgramManifest;
  benchmark: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> };
  driverCase: BlueprintBenchmarkManifest["cases"][number];
  loaded: LoadedFactoryProject;
  seedBlueprint: Blueprint;
  promotionBaseBlueprint: Blueprint;
  brief: DesignProgramBrief;
}

function designProgramPath(projectDir: string, programId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(programId)) throw new Error("Design Program id must use lowercase kebab-case");
  return join(resolve(projectDir), "design-programs", `${programId}.design.json`);
}

function parseDesignProgram(value: unknown, programId: string): DesignProgramManifest {
  const parsed = designProgramSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Design Program '${programId}': ${parsed.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`);
  if (parsed.data.id !== programId) throw new Error(`Design Program id '${parsed.data.id}' must match filename '${programId}'`);
  return parsed.data;
}

export async function loadDesignProgram(projectDir: string, programId: string): Promise<DesignProgramManifest> {
  return parseDesignProgram(await readJson(designProgramPath(projectDir, programId)), programId);
}

export async function listDesignPrograms(projectDir: string): Promise<DesignProgramSummary[]> {
  const directory = join(resolve(projectDir), "design-programs");
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const programIds = files.filter((file) => file.endsWith(".design.json"))
    .map((file) => file.slice(0, -".design.json".length)).sort();
  return Promise.all(programIds.map(async (programId) => {
    const program = await loadDesignProgram(projectDir, programId);
    const benchmark = await loadBlueprintBenchmark(projectDir, program.benchmark);
    return {
      id: program.id,
      name: program.name,
      description: program.description,
      benchmark: program.benchmark,
      seed: structuredClone(program.seed),
      driverCase: program.driverCase,
      proposal: proposalSummary(program.proposal),
      budget: { ...program.budget },
      programHash: await designProgramHash(projectDir, program),
      locked: Boolean(benchmark.lock),
    };
  }));
}

function synthesisEvidence(synthesis: ProjectBlueprintSynthesis): DesignProgramBrief["seed"]["synthesis"] {
  return synthesis.method === "fungible-flow"
    ? { method: synthesis.method }
    : {
      method: synthesis.method,
      entry: synthesis.strategy.entry,
      contentHash: synthesis.strategy.contentHash,
      summary: structuredClone(synthesis.strategy.summary),
    };
}

export async function prepareDesignProgram(projectDir: string, programId: string): Promise<PreparedDesignProgram> {
  const program = await loadDesignProgram(projectDir, programId);
  const benchmark = await loadBlueprintBenchmark(projectDir, program.benchmark);
  if (!benchmark.lock) throw new Error(`Design Program '${program.id}' requires locked Benchmark '${benchmark.id}'`);
  const lockedBenchmark: PreparedDesignProgram["benchmark"] = { ...benchmark, lock: benchmark.lock };
  const driverCase = benchmark.cases.find((item) => item.id === program.driverCase);
  if (!driverCase) throw new Error(`Design Program '${program.id}' driver case '${program.driverCase}' does not exist in Benchmark '${benchmark.id}'`);
  const selection = {
    world: driverCase.world,
    blueprint: benchmark.candidateBlueprint,
    scenario: driverCase.scenario,
    objective: driverCase.objective,
  };
  const promotionLoaded = await loadFactoryProject(projectDir, selection);
  const promotionBaseHash = hashValue(promotionLoaded.blueprint);
  const sourceBlueprintId = program.seed.kind === "blueprint" ? program.seed.blueprint : program.seed.inputBlueprint;
  const sourceLoaded = await loadFactoryProject(projectDir, { ...selection, blueprint: sourceBlueprintId });
  const sourceBlueprintHash = hashValue(sourceLoaded.blueprint);
  const synthesis = program.seed.kind === "synthesis" ? await synthesizeProjectBlueprint(sourceLoaded) : undefined;
  const seedBlueprint = structuredClone(synthesis?.blueprint ?? sourceLoaded.blueprint);
  // Search artifacts belong to the optimistic-concurrency lineage of the file
  // Candidate apply will update, not to an intermediate authored or generated seed.
  seedBlueprint.revision = promotionBaseHash;
  const loaded: LoadedFactoryProject = { ...promotionLoaded, blueprint: seedBlueprint };
  const project = compileFactoryProject(loaded);
  const analysis = analyzeProduction(project);
  const capacity = planProductionCapacity(project);
  const gapsByKind: Record<string, number> = {};
  for (const gap of capacity.gaps) gapsByKind[gap.kind] = (gapsByKind[gap.kind] ?? 0) + 1;
  const warningCount = analysis.diagnostics.filter((item) => item.severity === "warning").length;
  const summary: DesignProgramSummary = {
    id: program.id,
    name: program.name,
    description: program.description,
    benchmark: program.benchmark,
    seed: structuredClone(program.seed),
    driverCase: program.driverCase,
    proposal: proposalSummary(program.proposal),
    budget: { ...program.budget },
    programHash: await designProgramHash(projectDir, program),
    locked: true,
  };
  const brief: DesignProgramBrief = {
    version: 1,
    project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
    program: summary,
    benchmark: {
      id: benchmark.id,
      name: benchmark.name,
      contractHash: benchmark.lock.contractHash,
      cases: benchmark.cases.length,
      acceptance: { ...benchmark.acceptance },
    },
    seed: {
      source: structuredClone(program.seed),
      sourceBlueprintHash,
      blueprintHash: hashValue(seedBlueprint),
      ...(synthesis ? { synthesis: synthesisEvidence(synthesis) } : {}),
    },
    promotionBase: { blueprint: benchmark.candidateBlueprint, hash: promotionBaseHash },
    driver: {
      case: { id: driverCase.id, name: driverCase.name, weight: driverCase.weight, seed: driverCase.seed },
      selection: {
        world: driverCase.world,
        blueprint: benchmark.candidateBlueprint,
        scenario: driverCase.scenario,
        objective: driverCase.objective,
      },
      hashes: { ...project.hashes },
    },
    staticEvidence: {
      capacity: { state: capacity.ready ? "ready" : "blocked", gapCount: capacity.gaps.length, gapsByKind },
      flow: { warningCount, infoCount: analysis.diagnostics.length - warningCount },
      devices: { total: Object.keys(project.devices).length, declarative: analysis.declarativeDevices, opaque: analysis.opaqueDevices },
      topology: {
        regions: Object.keys(project.regions).length,
        connections: Object.keys(project.connections).length,
        trackedRoutes: Object.keys(project.routes).length,
        powerGrids: Object.keys(project.powerGrids).length,
      },
    },
  };
  return {
    manifest: program,
    benchmark: lockedBenchmark,
    driverCase,
    loaded,
    seedBlueprint,
    promotionBaseBlueprint: structuredClone(promotionLoaded.blueprint),
    brief,
  };
}

export async function buildDesignProgramBrief(projectDir: string, programId: string): Promise<DesignProgramBrief> {
  return (await prepareDesignProgram(projectDir, programId)).brief;
}
