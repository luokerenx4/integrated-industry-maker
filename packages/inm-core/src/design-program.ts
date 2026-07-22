import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { loadBlueprintBenchmark } from "./benchmark";
import { planProductionCapacity } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject } from "./loader";
import { analyzeProduction } from "./production-analysis";
import { hashValue, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");

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
]);

const decisionFamiliesSchema = z.array(designDecisionFamilySchema).min(1).superRefine((families, context) => {
  const seen = new Set<string>();
  for (const [index, family] of families.entries()) {
    if (seen.has(family)) context.addIssue({ code: "custom", path: [index], message: `duplicates decision family '${family}'` });
    seen.add(family);
  }
});

export const designProgramSchema = z.object({
  version: z.literal(1),
  id,
  name: z.string().min(1),
  description: z.string().min(1),
  benchmark: id,
  seedBlueprint: id,
  driverCase: id,
  proposal: z.object({
    kind: z.literal("heuristic"),
    decisionFamilies: decisionFamiliesSchema,
  }).strict(),
  budget: z.object({
    maxCandidates: z.number().int().min(1).max(100),
  }).strict(),
}).strict();

export type DesignDecisionFamily = z.infer<typeof designDecisionFamilySchema>;
export type DesignProgramManifest = z.infer<typeof designProgramSchema>;

export interface DesignProgramSummary {
  id: string;
  name: string;
  description: string;
  benchmark: string;
  seedBlueprint: string;
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
      seedBlueprint: program.seedBlueprint,
      driverCase: program.driverCase,
      proposal: { kind: program.proposal.kind, decisionFamilies: [...program.proposal.decisionFamilies] },
      budget: { ...program.budget },
      programHash: hashValue(program),
      locked: Boolean(benchmark.lock),
    };
  }));
}

export async function buildDesignProgramBrief(projectDir: string, programId: string): Promise<DesignProgramBrief> {
  const program = await loadDesignProgram(projectDir, programId);
  const benchmark = await loadBlueprintBenchmark(projectDir, program.benchmark);
  if (!benchmark.lock) throw new Error(`Design Program '${program.id}' requires locked Benchmark '${benchmark.id}'`);
  if (program.seedBlueprint !== benchmark.candidateBlueprint) throw new Error(
    `Design Program '${program.id}' seed Blueprint '${program.seedBlueprint}' must equal Benchmark candidate Blueprint '${benchmark.candidateBlueprint}'`,
  );
  const driverCase = benchmark.cases.find((item) => item.id === program.driverCase);
  if (!driverCase) throw new Error(`Design Program '${program.id}' driver case '${program.driverCase}' does not exist in Benchmark '${benchmark.id}'`);
  const loaded = await loadFactoryProject(projectDir, {
    world: driverCase.world,
    blueprint: program.seedBlueprint,
    scenario: driverCase.scenario,
    objective: driverCase.objective,
  });
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
    seedBlueprint: program.seedBlueprint,
    driverCase: program.driverCase,
    proposal: { kind: program.proposal.kind, decisionFamilies: [...program.proposal.decisionFamilies] },
    budget: { ...program.budget },
    programHash: hashValue(program),
    locked: true,
  };
  return {
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
    driver: {
      case: { id: driverCase.id, name: driverCase.name, weight: driverCase.weight, seed: driverCase.seed },
      selection: {
        world: driverCase.world,
        blueprint: program.seedBlueprint,
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
}
