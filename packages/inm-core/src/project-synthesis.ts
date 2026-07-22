import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { LoadedFactoryProject } from "./loader";
import { schemas } from "./schema";
import { synthesizeFactoryBlueprint, type BlueprintSynthesisResult } from "./synthesis";
import type { Blueprint, InmManifest, Objective, ProductRouteManifest, Scenario, IndustrialWorld } from "./types";
import { stableStringify } from "./utils";

export interface ProjectSynthesisContext {
  apiVersion: 1;
  project: Pick<InmManifest, "id" | "name">;
  selection: LoadedFactoryProject["selection"];
  seedBlueprint: Blueprint;
  catalogs: {
    resources: string[];
    processes: string[];
    routes: ProductRouteManifest[];
    deviceAssets: string[];
  };
  world: IndustrialWorld;
  scenario: Scenario;
  objective: Objective;
}

export interface ProjectSynthesisStrategyResult {
  blueprint: Blueprint;
  summary: {
    title: string;
    trackedRoute?: string;
    notes: string[];
  };
}

export interface ProjectSynthesisStrategy {
  apiVersion: 1;
  synthesize(context: ProjectSynthesisContext): ProjectSynthesisStrategyResult;
}

export type ProjectBlueprintSynthesis =
  | { method: "fungible-flow"; blueprint: Blueprint; result: BlueprintSynthesisResult }
  | {
    method: "project-strategy";
    blueprint: Blueprint;
    strategy: { entry: string; contentHash: string; summary: ProjectSynthesisStrategyResult["summary"] };
  };

export class ProjectSynthesisError extends Error {
  constructor(message: string) {
    super(`Project synthesis: ${message}`);
    this.name = "ProjectSynthesisError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

function contextOf(loaded: LoadedFactoryProject): ProjectSynthesisContext {
  return {
    apiVersion: 1,
    project: { id: loaded.manifest.id, name: loaded.manifest.name },
    selection: structuredClone(loaded.selection),
    seedBlueprint: structuredClone(loaded.blueprint),
    catalogs: {
      resources: Object.keys(loaded.resources).sort(),
      processes: Object.keys(loaded.processes).sort(),
      routes: Object.values(loaded.routes).sort((a, b) => a.id.localeCompare(b.id)).map(({ sourceFile: _sourceFile, contentHash: _contentHash, ...route }) => route),
      deviceAssets: Object.keys(loaded.deviceAssets).sort(),
    },
    world: structuredClone(loaded.world),
    scenario: structuredClone(loaded.scenario),
    objective: structuredClone(loaded.objective),
  };
}

function parseResult(value: unknown): ProjectSynthesisStrategyResult {
  if (!isRecord(value) || !isRecord(value.summary) || typeof value.summary.title !== "string" || !Array.isArray(value.summary.notes)
    || value.summary.notes.some((note) => typeof note !== "string")
    || (value.summary.trackedRoute !== undefined && typeof value.summary.trackedRoute !== "string")) {
    throw new ProjectSynthesisError("strategy result must contain blueprint and summary { title, notes, trackedRoute? }");
  }
  const parsed = schemas.blueprint.safeParse(value.blueprint);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProjectSynthesisError(`strategy returned an invalid Blueprint at /${issue?.path.join("/") ?? ""}: ${issue?.message ?? "unknown schema error"}`);
  }
  return {
    blueprint: parsed.data,
    summary: {
      title: value.summary.title,
      notes: [...value.summary.notes] as string[],
      ...(value.summary.trackedRoute === undefined ? {} : { trackedRoute: value.summary.trackedRoute }),
    },
  };
}

export async function synthesizeProjectBlueprint(loaded: LoadedFactoryProject): Promise<ProjectBlueprintSynthesis> {
  const entry = loaded.manifest.synthesis?.strategy;
  if (!entry) {
    const result = synthesizeFactoryBlueprint(loaded);
    return { method: "fungible-flow", blueprint: result.blueprint, result };
  }
  const entryPath = resolve(loaded.rootDir, entry);
  if (entryPath !== loaded.rootDir && !entryPath.startsWith(`${loaded.rootDir}${sep}`)) throw new ProjectSynthesisError(`strategy escapes the project directory: ${entry}`);
  let source: Buffer;
  let module: Record<string, unknown>;
  try {
    source = await readFile(entryPath);
    const contentHash = createHash("sha256").update(source).digest("hex");
    module = await import(`${pathToFileURL(entryPath).href}?strategy=${contentHash}`) as Record<string, unknown>;
  } catch (error) {
    throw new ProjectSynthesisError(`cannot load '${entry}': ${error instanceof Error ? error.message : String(error)}`);
  }
  const strategy = module.default;
  if (!isRecord(strategy) || strategy.apiVersion !== 1 || typeof strategy.synthesize !== "function") {
    throw new ProjectSynthesisError(`'${entry}' default export must define apiVersion: 1 and synchronous synthesize(context)`);
  }
  const run = (): ProjectSynthesisStrategyResult => {
    const value = (strategy.synthesize as (context: Readonly<ProjectSynthesisContext>) => unknown)(freezeDeep(contextOf(loaded)));
    if (value && typeof (value as PromiseLike<unknown>).then === "function") throw new ProjectSynthesisError("strategy synthesize(context) must be synchronous and deterministic");
    return parseResult(value);
  };
  const first = run();
  const second = run();
  if (stableStringify(first) !== stableStringify(second)) throw new ProjectSynthesisError(`'${entry}' returned different results for the same frozen input`);
  return {
    method: "project-strategy",
    blueprint: first.blueprint,
    strategy: {
      entry,
      contentHash: createHash("sha256").update(source!).digest("hex"),
      summary: first.summary,
    },
  };
}
