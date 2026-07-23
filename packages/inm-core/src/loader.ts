import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { ZodError, ZodType } from "zod";
import { importDeviceProgram } from "./device-runtime";
import { schemas, type SchemaKind } from "./schema";
import type {
  Blueprint, DeviceAsset, DeviceAssetManifest, DeviceVisual, IndustrialProcess, IndustrialProcessManifest, IndustrialWorld, InmManifest, Objective,
  ProductRoute, ProductRouteManifest, ResourceAsset, ResourceAssetManifest, ResourceVisual, Scenario, ValidationIssue,
} from "./types";
import { InmValidationError } from "./types";
import { readJson } from "./utils";

export interface LoadedFactoryProject {
  rootDir: string;
  selection: { world: string; blueprint: string; scenario: string; objective: string };
  manifest: InmManifest;
  resources: Record<string, ResourceAsset>;
  processes: Record<string, IndustrialProcess>;
  routes: Record<string, ProductRoute>;
  deviceAssets: Record<string, DeviceAsset>;
  world: IndustrialWorld;
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

async function contentHash(directory: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(current: string): Promise<void> {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      const name = relative(directory, path).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`Asset packages cannot contain symbolic links: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) { hash.update(name); hash.update("\0"); hash.update(await readFile(path)); hash.update("\0"); }
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

async function fileHash(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function assetFile(assetDir: string, path: string): string {
  const target = resolve(assetDir, path);
  if (target !== assetDir && !target.startsWith(`${assetDir}${sep}`)) throw new Error(`Asset file escapes package directory: ${path}`);
  return target;
}

function projectFile(rootDir: string, assetDir: string, path: string | null): string | null {
  return path === null ? null : relative(rootDir, assetFile(assetDir, path)).split(sep).join("/");
}

function projectOwnedFile(rootDir: string, path: string): string {
  const target = resolve(rootDir, path);
  if (target !== rootDir && !target.startsWith(`${rootDir}${sep}`)) throw new Error(`Project file escapes project directory: ${path}`);
  return target;
}

async function verifyProjectReferencedFile(rootDir: string, path: string): Promise<void> {
  const target = projectOwnedFile(rootDir, path);
  const [realRoot, realTarget] = await Promise.all([realpath(rootDir), realpath(target)]);
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${sep}`)) throw new Error(`Project file escapes project directory through a symbolic link: ${path}`);
  await readFile(realTarget);
}

async function verifyReferencedFiles(assetDir: string, paths: Array<string | null>): Promise<void> {
  for (const path of paths) if (path !== null) {
    try { await readFile(assetFile(assetDir, path)); }
    catch (error) { throw new Error(`Cannot read referenced asset file ${join(assetDir, path)}: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

async function assetDirectories(rootDir: string, category: "resources" | "devices"): Promise<string[]> {
  const directory = join(rootDir, "assets", category);
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { throw new Error(`Missing required asset directory: ${directory}`); }
  const invalid = entries.filter((entry) => !entry.name.startsWith(".") && !entry.isDirectory());
  if (invalid.length) throw new Error(`Assets in ${directory} must be directories: ${invalid.map((entry) => entry.name).join(", ")}`);
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => join(directory, entry.name)).sort();
  if (!directories.length) throw new Error(`No ${category} asset packages found in ${directory}`);
  return directories;
}

async function loadResources(rootDir: string): Promise<Record<string, ResourceAsset>> {
  const catalog: Record<string, ResourceAsset> = {};
  for (const assetDir of await assetDirectories(rootDir, "resources")) {
    const manifest = await parseFile<ResourceAssetManifest>(join(assetDir, "asset.json"), "resource-asset");
    if (manifest.id !== basename(assetDir)) throw new InmValidationError([{ path: join(assetDir, "asset.json/id"), code: "asset.directory-id", message: `Asset id '${manifest.id}' must match directory '${basename(assetDir)}'` }]);
    if (catalog[manifest.id]) throw new InmValidationError([{ path: assetDir, code: "reference.duplicate", message: `Duplicate resource id '${manifest.id}'` }]);
    const visual = await parseFile<ResourceVisual>(assetFile(assetDir, manifest.files.visual), "resource-visual");
    await verifyReferencedFiles(assetDir, [visual.texture, visual.icon]);
    catalog[manifest.id] = {
      ...manifest, assetDir, contentHash: await contentHash(assetDir),
      visual: { ...visual, texture: projectFile(rootDir, assetDir, visual.texture), icon: projectFile(rootDir, assetDir, visual.icon) },
    };
  }
  return catalog;
}

async function loadProcesses(rootDir: string): Promise<Record<string, IndustrialProcess>> {
  const directory = join(rootDir, "processes");
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { throw new Error(`Missing required process directory: ${directory}`); }
  const visible = entries.filter((entry) => !entry.name.startsWith("."));
  const invalid = visible.filter((entry) => !entry.isFile() || !entry.name.endsWith(".process.json"));
  if (invalid.length) throw new Error(`Processes in ${directory} must be *.process.json files: ${invalid.map((entry) => entry.name).join(", ")}`);
  if (!visible.length) throw new Error(`No process definitions found in ${directory}`);
  const catalog: Record<string, IndustrialProcess> = {};
  for (const entry of visible.sort((a, b) => a.name.localeCompare(b.name))) {
    const sourceFile = join(directory, entry.name);
    const process = await parseFile<IndustrialProcessManifest>(sourceFile, "process");
    const fileId = entry.name.slice(0, -".process.json".length);
    if (process.id !== fileId) throw new InmValidationError([{ path: `${sourceFile}/id`, code: "process.filename-id", message: `Process id '${process.id}' must match filename '${fileId}'` }]);
    if (catalog[process.id]) throw new InmValidationError([{ path: sourceFile, code: "reference.duplicate", message: `Duplicate process '${process.id}'` }]);
    catalog[process.id] = { ...process, sourceFile, contentHash: await fileHash(sourceFile) };
  }
  return catalog;
}

async function loadRoutes(rootDir: string): Promise<Record<string, ProductRoute>> {
  const directory = join(rootDir, "routes");
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return {}; }
  const visible = entries.filter((entry) => !entry.name.startsWith("."));
  const invalid = visible.filter((entry) => !entry.isFile() || !entry.name.endsWith(".route.json"));
  if (invalid.length) throw new Error(`Routes in ${directory} must be *.route.json files: ${invalid.map((entry) => entry.name).join(", ")}`);
  const catalog: Record<string, ProductRoute> = {};
  for (const entry of visible.sort((a, b) => a.name.localeCompare(b.name))) {
    const sourceFile = join(directory, entry.name);
    const route = await parseFile<ProductRouteManifest>(sourceFile, "route");
    const fileId = entry.name.slice(0, -".route.json".length);
    if (route.id !== fileId) throw new InmValidationError([{ path: `${sourceFile}/id`, code: "route.filename-id", message: `Route id '${route.id}' must match filename '${fileId}'` }]);
    if (catalog[route.id]) throw new InmValidationError([{ path: sourceFile, code: "reference.duplicate", message: `Duplicate Route '${route.id}'` }]);
    catalog[route.id] = { ...route, sourceFile, contentHash: await fileHash(sourceFile) };
  }
  return catalog;
}

async function loadDevices(rootDir: string): Promise<Record<string, DeviceAsset>> {
  const catalog: Record<string, DeviceAsset> = {};
  for (const assetDir of await assetDirectories(rootDir, "devices")) {
    const manifest = await parseFile<DeviceAssetManifest>(join(assetDir, "asset.json"), "device-asset");
    if (manifest.id !== basename(assetDir)) throw new InmValidationError([{ path: join(assetDir, "asset.json/id"), code: "asset.directory-id", message: `Asset id '${manifest.id}' must match directory '${basename(assetDir)}'` }]);
    if (catalog[manifest.id]) throw new InmValidationError([{ path: assetDir, code: "reference.duplicate", message: `Duplicate device id '${manifest.id}'` }]);
    const hash = await contentHash(assetDir);
    const visual = await parseFile<DeviceVisual>(assetFile(assetDir, manifest.files.visual), "device-visual");
    const materialMaps = visual.material.maps;
    await verifyReferencedFiles(assetDir, [
      visual.model,
      materialMaps.baseColor,
      materialMaps.normal,
      materialMaps.roughness,
      materialMaps.metalness,
      materialMaps.emissive,
    ]);
    const program = await importDeviceProgram(manifest.id, assetFile(assetDir, manifest.runtime.entry), hash);
    catalog[manifest.id] = {
      ...manifest, assetDir, contentHash: hash, runtimeSourceHash: hash, program,
      visual: {
        ...visual,
        model: projectFile(rootDir, assetDir, visual.model),
        material: {
          ...visual.material,
          maps: {
            baseColor: projectFile(rootDir, assetDir, materialMaps.baseColor),
            normal: projectFile(rootDir, assetDir, materialMaps.normal),
            roughness: projectFile(rootDir, assetDir, materialMaps.roughness),
            metalness: projectFile(rootDir, assetDir, materialMaps.metalness),
            emissive: projectFile(rootDir, assetDir, materialMaps.emissive),
          },
        },
      },
    };
  }
  return catalog;
}

export interface ProjectSelection { world?: string; blueprint?: string; scenario?: string; objective?: string }

export async function loadFactoryProject(projectDir: string, selection: ProjectSelection = {}): Promise<LoadedFactoryProject> {
  const rootDir = resolve(projectDir);
  const manifest = await parseFile<InmManifest>(join(rootDir, "inm.json"), "manifest");
  const backdrop = manifest.presentation?.environment.backdrop;
  if (backdrop) {
    try { await verifyProjectReferencedFile(rootDir, backdrop.image); }
    catch (error) { throw new Error(`Cannot read referenced project environment file ${join(rootDir, backdrop.image)}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const worldId = selection.world ?? manifest.defaultWorld;
  const blueprintId = selection.blueprint ?? manifest.defaultBlueprint;
  const scenarioId = selection.scenario ?? manifest.defaultScenario;
  const objectiveId = selection.objective ?? manifest.defaultObjective;
  const [resources, processes, routes, deviceAssets, world, blueprint, scenario, objective] = await Promise.all([
    loadResources(rootDir), loadProcesses(rootDir), loadRoutes(rootDir), loadDevices(rootDir),
    parseFile<IndustrialWorld>(join(rootDir, "worlds", `${worldId}.world.json`), "world"),
    parseFile<Blueprint>(join(rootDir, "blueprints", `${blueprintId}.blueprint.json`), "blueprint"),
    parseFile<Scenario>(join(rootDir, "scenarios", `${scenarioId}.scenario.json`), "scenario"),
    parseFile<Objective>(join(rootDir, "objectives", `${objectiveId}.objective.json`), "objective"),
  ]);
  return {
    rootDir,
    selection: { world: worldId, blueprint: blueprintId, scenario: scenarioId, objective: objectiveId },
    manifest, resources, processes, routes, deviceAssets, world, blueprint, scenario, objective,
  };
}
