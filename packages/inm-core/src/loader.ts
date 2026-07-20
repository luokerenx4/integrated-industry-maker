import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { ZodError, ZodType } from "zod";
import { schemas, type SchemaKind } from "./schema";
import type {
  Blueprint, DeviceAsset, InmManifest, MaterialAsset, Objective, Recipe, Scenario, ValidationIssue,
} from "./types";
import { InmValidationError } from "./types";
import { readJson } from "./utils";

export interface LoadedFactoryProject {
  rootDir: string;
  manifest: InmManifest;
  materials: Record<string, MaterialAsset>;
  deviceAssets: Record<string, DeviceAsset>;
  recipes: Record<string, Recipe>;
  blueprint: Blueprint;
  scenario: Scenario;
  objective: Objective;
}

function schemaIssues(file: string, error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: `${file}${issue.path.length ? `/${issue.path.join("/")}` : ""}`,
    code: `schema.${issue.code}`,
    message: issue.message,
  }));
}

async function parseFile<T>(path: string, kind: SchemaKind): Promise<T> {
  const value = await readJson(path);
  const parsed = (schemas[kind] as ZodType).safeParse(value);
  if (!parsed.success) throw new InmValidationError(schemaIssues(path, parsed.error));
  return parsed.data as T;
}

async function loadCatalog<T extends { id: string }>(root: string, folder: string, kind: SchemaKind): Promise<Record<string, T>> {
  const directory = join(root, folder);
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    throw new Error(`Missing required project directory: ${directory}`);
  }
  const catalog: Record<string, T> = {};
  for (const file of files) {
    const item = await parseFile<T>(join(directory, file), kind);
    if (catalog[item.id]) {
      throw new InmValidationError([{ path: `${folder}/${file}/id`, code: "reference.duplicate", message: `Duplicate ${kind} id '${item.id}'` }]);
    }
    catalog[item.id] = item;
  }
  if (files.length === 0) throw new Error(`No ${kind} definitions found in ${directory}`);
  return catalog;
}

export interface ProjectSelection { blueprint?: string; scenario?: string; objective?: string }

export async function loadFactoryProject(projectDir: string, selection: ProjectSelection = {}): Promise<LoadedFactoryProject> {
  const rootDir = resolve(projectDir);
  const manifest = await parseFile<InmManifest>(join(rootDir, "inm.json"), "manifest");
  const blueprintId = selection.blueprint ?? manifest.defaultBlueprint;
  const scenarioId = selection.scenario ?? manifest.defaultScenario;
  const objectiveId = selection.objective ?? manifest.defaultObjective;
  const [materials, deviceAssets, recipes, blueprint, scenario, objective] = await Promise.all([
    loadCatalog<MaterialAsset>(rootDir, "materials", "material"),
    loadCatalog<DeviceAsset>(rootDir, "devices", "device"),
    loadCatalog<Recipe>(rootDir, "recipes", "recipe"),
    parseFile<Blueprint>(join(rootDir, "blueprints", `${blueprintId}.blueprint.json`), "blueprint"),
    parseFile<Scenario>(join(rootDir, "scenarios", `${scenarioId}.scenario.json`), "scenario"),
    parseFile<Objective>(join(rootDir, "objectives", `${objectiveId}.objective.json`), "objective"),
  ]);
  return { rootDir, manifest, materials, deviceAssets, recipes, blueprint, scenario, objective };
}
