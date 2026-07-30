#!/usr/bin/env bun
import { watch as watchProjectFiles, type FSWatcher } from "node:fs";
import { mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  CandidateChangeSetError,
  DesignRunError,
  IndustrialInvestigationError,
  RunComparisonError,
  analyzeProduction,
  analyzeProjectOperation,
  applyCandidateOperation,
  blueprintSchema,
  buildDesignProgramBrief,
  compareFactoryRuns,
  compileFactoryProject,
  continueDesignRun,
  createIndustrialInvestigation,
  ENGINE_VERSION,
  evaluateBenchmarkOperation,
  inspectCandidateDecision,
  inspectDesignProgramEvidence,
  inspectIndustrialInvestigation,
  listBlueprintBenchmarks,
  listCandidateChangeSets,
  listDesignPrograms,
  listIndustrialInvestigations,
  loadCandidateChangeSet,
  loadDesignRun,
  listRuns,
  listWorkspaceProjects,
  loadFactoryProject,
  loadWorkspace,
  manifestSchema,
  worldSchema,
  buildFactoryObservationBrief,
  openFactoryProject,
  openProjectWorkbenchSnapshot,
  openRunProjectWorkbenchSnapshot,
  pathExists,
  planProjectOperation,
  planProductionCapacity,
  previewCandidateOperation,
  promoteDesignRun,
  appendIndustrialInvestigationEntry,
  readJson,
  resolveProjectDirectory,
  runDesignProgram,
  simulateProjectOperation,
  sameProjectEvidenceIdentity,
  stableStringify,
  studioSourceHash,
  validateProjectOperation,
  type ProjectSelection,
  type IndustrialInvestigationEntryInput,
} from "@inm/core";
import { StudioOperationRegistry } from "./operation-registry";
import { completedProjectRefresh, projectRefreshProbePath } from "./evidence-watch";
import { studioWatchMessage } from "./watch-protocol";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: "string", default: "4175" },
    project: { type: "string" },
    "no-open": { type: "boolean", default: false },
  },
  allowPositionals: true,
});

if (positionals.length !== 1) {
  throw new Error("Usage: inm studio serve <project-or-workspace-dir> [--project ID] [--port N] [--no-open]");
}

const inputDir = resolve(positionals[0]!);
const port = Number(values.port);
const sourceHash = await studioSourceHash();
const managerPid = process.env.INM_STUDIO_MANAGER_PID === undefined
  ? null
  : Number(process.env.INM_STUDIO_MANAGER_PID);
if (managerPid !== null && (!Number.isSafeInteger(managerPid) || managerPid <= 0)) {
  throw new Error("INM_STUDIO_MANAGER_PID must be a positive integer");
}
const managerSourceHash = managerPid === null
  ? sourceHash
  : process.env.INM_STUDIO_MANAGER_SOURCE_HASH;
if (managerSourceHash === undefined || !/^[0-9a-f]{64}$/.test(managerSourceHash)) {
  throw new Error("INM_STUDIO_MANAGER_SOURCE_HASH must be a lowercase SHA-256 value for managed Studio");
}
const managedStatePath = managerPid === null
  ? null
  : process.env.INM_STUDIO_STATE_PATH;
if (managerPid !== null && (!managedStatePath || !managedStatePath.startsWith("/"))) {
  throw new Error("INM_STUDIO_STATE_PATH must be an absolute managed lifecycle state path");
}
type StudioSupervisorStatus = {
  phase: "starting" | "current" | "adopting" | "degraded" | "stopping";
  attemptedSourceHash: string;
  childPid: number | null;
  generation: number;
  heartbeatAt: string;
  retry: "none" | "source-change" | "explicit";
  failure: null | {
    at: string;
    phase: "preflight" | "startup";
    message: string;
  };
};
const directSupervisorStatus: StudioSupervisorStatus = {
  phase: "current",
  attemptedSourceHash: sourceHash,
  childPid: process.pid,
  generation: 1,
  heartbeatAt: new Date().toISOString(),
  retry: "none",
  failure: null,
};
async function currentSupervisorStatus(): Promise<StudioSupervisorStatus> {
  if (managerPid === null || managedStatePath === null || managedStatePath === undefined) return directSupervisorStatus;
  const currentStatePath = managedStatePath;
  try {
    const state = await readJson(currentStatePath) as {
      version?: unknown;
      inputDir?: unknown;
      port?: unknown;
      pid?: unknown;
      managerSourceHash?: unknown;
      supervisor?: unknown;
    };
    const status = state.supervisor as Partial<StudioSupervisorStatus> | undefined;
    if (state.version === 5
      && state.inputDir === inputDir
      && state.port === port
      && state.pid === managerPid
      && state.managerSourceHash === managerSourceHash
      && status
      && ["starting", "current", "adopting", "degraded", "stopping"].includes(status.phase ?? "")
      && /^[0-9a-f]{64}$/.test(status.attemptedSourceHash ?? "")
      && (status.childPid === null || (Number.isSafeInteger(status.childPid) && status.childPid! > 0))
      && Number.isSafeInteger(status.generation)
      && status.generation! >= 0
      && typeof status.heartbeatAt === "string"
      && Number.isFinite(Date.parse(status.heartbeatAt))
      && ["none", "source-change", "explicit"].includes(status.retry ?? "")
      && (status.failure === null || (
        typeof status.failure === "object"
        && typeof status.failure.at === "string"
        && Number.isFinite(Date.parse(status.failure.at))
        && ["preflight", "startup"].includes(status.failure.phase)
        && typeof status.failure.message === "string"
        && status.failure.message.length > 0
      ))) return status as StudioSupervisorStatus;
  } catch {
    // The stable fallback keeps health machine-readable while state is replaced atomically.
  }
  return {
    phase: "degraded",
    attemptedSourceHash: sourceHash,
    childPid: process.pid,
    generation: 0,
    heartbeatAt: new Date().toISOString(),
    retry: "source-change",
    failure: {
      at: new Date().toISOString(),
      phase: "startup",
      message: "Managed supervisor state is temporarily unavailable or invalid.",
    },
  };
}
const configuredIdleExitMs = process.env.INM_STUDIO_IDLE_EXIT_MS === undefined
  ? null
  : Number(process.env.INM_STUDIO_IDLE_EXIT_MS);
if (configuredIdleExitMs !== null && (!Number.isSafeInteger(configuredIdleExitMs) || configuredIdleExitMs < 100)) {
  throw new Error("INM_STUDIO_IDLE_EXIT_MS must be an integer of at least 100 milliseconds");
}
let idleExitTimer: ReturnType<typeof setTimeout> | null = null;
function renewIdleExitLease(): void {
  if (configuredIdleExitMs === null) return;
  if (idleExitTimer) clearTimeout(idleExitTimer);
  idleExitTimer = setTimeout(() => process.exit(0), configuredIdleExitMs);
}
const workspaceMode = await pathExists(join(inputDir, "inm-workspace.json"));
const cacheDir = join(inputDir, ".inm", "cache", "studio");
await mkdir(cacheDir, { recursive: true });
const operationRegistry = new StudioOperationRegistry();

const build = await Bun.build({
  entrypoints: [join(import.meta.dir, "main.tsx")],
  outdir: cacheDir,
  target: "browser",
  format: "esm",
  sourcemap: "linked",
  minify: false,
});
if (!build.success) throw new Error(`Studio build failed:\n${build.logs.join("\n")}`);

async function projectDirectory(projectId: string): Promise<string> {
  if (workspaceMode) return resolveProjectDirectory(inputDir, projectId);
  const directory = await resolveProjectDirectory(inputDir);
  const manifest = manifestSchema.parse(await readJson(join(directory, "inm.json")));
  if (projectId !== manifest.id) throw new Error(`Unknown Studio project '${projectId}'`);
  return directory;
}

async function workspaceProjects() {
  if (workspaceMode) return listWorkspaceProjects(inputDir);
  const manifest = manifestSchema.parse(await readJson(join(inputDir, "inm.json")));
  return [{ id: manifest.id, name: manifest.name, path: inputDir, isDefault: true }];
}

async function countAssetDirectories(projectDir: string, kind: "devices" | "resources"): Promise<number> {
  const entries = await readdir(join(projectDir, "assets", kind), { withFileTypes: true });
  return entries.filter((entry) => !entry.name.startsWith(".") && entry.isDirectory()).length;
}

async function countProcessFiles(projectDir: string): Promise<number> {
  const entries = await readdir(join(projectDir, "processes"), { withFileTypes: true });
  return entries.filter((entry) => !entry.name.startsWith(".") && entry.isFile() && entry.name.endsWith(".process.json")).length;
}

async function loadProjectIndex() {
  const projects = await workspaceProjects();
  const summaries = await Promise.all(projects.map(async (summary) => {
    const manifest = manifestSchema.parse(await readJson(join(summary.path, "inm.json")));
    const blueprint = blueprintSchema.parse(await readJson(join(summary.path, "blueprints", `${manifest.defaultBlueprint}.blueprint.json`)));
    const world = worldSchema.parse(await readJson(join(summary.path, "worlds", `${manifest.defaultWorld}.world.json`)));
    const [resourceAssets, deviceAssets, processes, allRuns] = await Promise.all([
      countAssetDirectories(summary.path, "resources"),
      countAssetDirectories(summary.path, "devices"),
      countProcessFiles(summary.path),
      listRuns(summary.path),
    ]);
    const runs = allRuns.filter((run) => run.manifest.engineVersion === ENGINE_VERSION && run.manifest.selection.blueprint);
    return {
      id: summary.id,
      name: summary.name,
      isDefault: summary.isDefault,
      resourceAssets,
      deviceAssets,
      processes,
      deviceInstances: blueprint.devices.length,
      connections: blueprint.connections.length,
      logisticsNetworks: blueprint.logisticsNetworks.length,
      runs: runs.length,
      regions: world.regions.length,
      resourceNodes: world.resourceNodes.length,
    };
  }));
  const name = workspaceMode ? (await loadWorkspace(inputDir)).manifest.name : "INM Studio";
  return { name, workspace: workspaceMode, projects: summaries };
}

function layoutRegions(regions: Array<{ id: string; name: string; kind: "industrial-zone"; coordinates: { x: number; y: number; z: number }; bounds: { width: number; height: number } }>) {
  let cursorX = 0;
  const layouts = regions.map((region) => {
    const layout = { ...region, offset: { x: cursorX, y: 0 } };
    cursorX += region.bounds.width + 8;
    return layout;
  });
  return {
    layouts,
    offsets: new Map(layouts.map((region) => [region.id, region.offset])),
    bounds: {
      width: Math.max(1, ...layouts.map((region) => region.offset.x + region.bounds.width)),
      height: Math.max(1, ...layouts.map((region) => region.offset.y + region.bounds.height)),
    },
  };
}

async function loadStudioData(projectId: string, runName?: string, selection: ProjectSelection = {}) {
  const projectDir = await projectDirectory(projectId);
  const [experiments, designPrograms] = await Promise.all([listBlueprintBenchmarks(projectDir), listDesignPrograms(projectDir)]);
  const runs = (await listRuns(projectDir)).filter((run) => run.manifest.engineVersion === ENGINE_VERSION && run.manifest.selection.blueprint);
  const defaultLoaded = await loadFactoryProject(projectDir, selection);
  const defaultProject = compileFactoryProject(defaultLoaded);
  const requestedRun = runName ? runs.find((run) => run.name === runName) : undefined;
  if (runName && !requestedRun) throw new Error(`Unknown compatible immutable run '${runName}' in project '${projectId}'`);
  const requestedLoaded = requestedRun ? await loadFactoryProject(projectDir, requestedRun.manifest.selection) : undefined;
  const requestedBlueprint = requestedRun
    ? blueprintSchema.parse(await readJson(join(requestedRun.path, "blueprint.json")))
    : undefined;
  const requestedProject = requestedLoaded && requestedBlueprint
    ? compileFactoryProject({ ...requestedLoaded, blueprint: requestedBlueprint })
    : undefined;
  if (requestedRun && !sameProjectEvidenceIdentity(requestedRun.manifest.hashes, requestedProject!.hashes)) {
    throw new Error(`Immutable run '${requestedRun.name}' is not compatible with the exact selected project hashes`);
  }
  const selected = requestedRun
    ?? (!runName ? runs.filter((run) => run.manifest.decision !== "REVERT"
      && run.manifest.selection.world === defaultProject.selection.world
      && run.manifest.selection.blueprint === defaultProject.selection.blueprint
      && run.manifest.selection.productionPlan === defaultProject.selection.productionPlan
      && run.manifest.selection.scenario === defaultProject.selection.scenario
      && run.manifest.selection.objective === defaultProject.selection.objective
      && sameProjectEvidenceIdentity(run.manifest.hashes, defaultProject.hashes)).at(-1) : undefined);
  const loaded = requestedLoaded ?? defaultLoaded;
  const runBlueprint = requestedBlueprint ?? (selected
    ? JSON.parse(await readFile(join(selected.path, "blueprint.json"), "utf8"))
    : loaded.blueprint);
  const project = compileFactoryProject({ ...loaded, blueprint: runBlueprint });
  const compatibleSelection = selected?.manifest.selection ?? defaultProject.selection;
  const compatibleHashes = selected?.manifest.hashes ?? defaultProject.hashes;
  const compatibleRuns = runs.filter((run) =>
    stableStringify(run.manifest.selection) === stableStringify(compatibleSelection)
    && sameProjectEvidenceIdentity(run.manifest.hashes, compatibleHashes));
  const regionLayout = layoutRegions(project.world.regions);
  let events = [];
  let metrics = null;
  if (selected) {
    events = (await readFile(join(selected.path, "events.ndjson"), "utf8"))
      .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    metrics = JSON.parse(await readFile(join(selected.path, "metrics.json"), "utf8"));
  }

  const instanceCounts = new Map<string, number>();
  for (const device of Object.values(project.devices)) {
    instanceCounts.set(device.asset, (instanceCounts.get(device.asset) ?? 0) + 1);
  }
  const fleetCounts = new Map<string, number>();
  for (const network of Object.values(project.logisticsNetworks)) for (const fleet of network.fleets) {
    fleetCounts.set(fleet.asset.id, (fleetCounts.get(fleet.asset.id) ?? 0) + fleet.count);
  }

  return {
    name: project.manifest.name,
    projectId: project.manifest.id,
    environment: project.manifest.presentation?.environment ?? null,
    selection: { ...project.selection },
    experiments,
    designPrograms,
    blueprintHash: project.hashes.blueprintHash,
    bounds: regionLayout.bounds,
    regions: regionLayout.layouts,
    resourceNodes: Object.values(project.resourceNodes).map((node) => ({
      id: node.id,
      region: node.region,
      resource: node.resource,
      amount: node.amount,
      remaining: metrics?.resourceNodes?.[node.id]?.remaining ?? node.amount,
      position: {
        x: node.position.x + regionLayout.offsets.get(node.region)!.x,
        y: node.position.y + regionLayout.offsets.get(node.region)!.y,
      },
    })),
    devices: Object.values(project.devices).map((device) => ({
      id: device.id,
      assetId: device.asset,
      name: device.assetDef.name,
      capabilities: device.assetDef.capabilities,
      powerPriority: device.policy?.powerPriority ?? 0,
      recipeDispatch: device.policy?.recipeDispatch ?? "authored-order",
      lotDispatch: device.policy?.lotDispatch ?? "fifo",
      ...(device.assetDef.production?.changeover ? {
        changeoverTransitions: device.assetDef.production.changeover.transitions.map((transition) => ({ ...transition })),
      } : {}),
      ...(device.policy?.setupCampaign ? { setupCampaign: { ...device.policy.setupCampaign } } : {}),
      ...(device.policy?.batchFormation ? { batchFormation: { ...device.policy.batchFormation } } : {}),
      ...(device.policy?.cadenceControl ? { cadenceControl: { ...device.policy.cadenceControl } } : {}),
      ...(device.policy?.preventiveMaintenance ? { preventiveMaintenance: { ...device.policy.preventiveMaintenance } } : {}),
      ...(device.policy?.idleEnergy ? { idleEnergy: { ...device.policy.idleEnergy } } : {}),
      ...(device.assetDef.production?.maintenance ? { maintenance: { ...device.assetDef.production.maintenance } } : {}),
      maintenanceProviders: device.maintenanceProviders.map((provider) => ({ ...provider })),
      qualificationProviders: device.qualificationProviders.map((provider) => ({ ...provider })),
      ...(device.assetDef.maintenanceProvider ? { maintenanceProvider: { ...device.assetDef.maintenanceProvider } } : {}),
      ...(device.assetDef.toolingProvider ? { toolingProvider: {
        ...device.assetDef.toolingProvider, stock: device.assetDef.toolingProvider.stock.map((amount) => ({ ...amount })),
      } } : {}),
      ...(device.assetDef.utilityProvider ? { utilityProvider: {
        ...device.assetDef.utilityProvider, capacities: device.assetDef.utilityProvider.capacities.map((capacity) => ({ ...capacity })),
      } } : {}),
      region: device.region,
      position: {
        x: device.position.x + regionLayout.offsets.get(device.region)!.x,
        y: device.position.y + regionLayout.offsets.get(device.region)!.y,
      },
      rotation: device.rotation,
      footprint: device.footprint,
      visual: device.assetDef.visual,
      ...(device.transportEndpoint ? { transportEndpoint: { ...device.transportEndpoint } } : {}),
      resourceContracts: Object.fromEntries(Object.entries(device.buffers)
        .filter(([, buffer]) => !buffer.accepts.includes("*"))
        .map(([bufferId, buffer]) => [bufferId, [...buffer.accepts]])),
      ...(device.processPlan ? { recipe: {
        process: device.processPlan.definition.id,
        mode: device.processPlan.mode.id,
        modeName: device.processPlan.mode.name,
        durationTicks: device.processPlan.durationTicks,
        powerMilliWatts: device.processPlan.powerMilliWatts,
        setupGroup: device.processPlan.setupGroup,
        ...(device.processPlan.quality?.kind === "inspection" ? { quality: {
          kind: "inspection" as const, detects: device.processPlan.quality.detects,
          rejectResource: device.processPlan.quality.rejectOutput.resource,
          scrapResource: device.processPlan.quality.scrapOutput?.resource,
          maxReworkCycles: device.processPlan.quality.maxReworkCycles,
        } } : device.processPlan.quality?.kind === "rework" ? { quality: {
          kind: "rework" as const, repairs: device.processPlan.quality.repairs,
        } } : {}),
        inputs: device.processPlan.inputs.map((amount) => ({ ...amount })),
        tooling: structuredClone(device.processPlan.tooling),
        toolingProviders: device.processPlan.toolingProviders.map((provider) => ({ ...provider })),
        utilities: structuredClone(device.processPlan.utilities),
        utilityProviders: structuredClone(device.processPlan.utilityProviders),
        outputs: device.processPlan.outputs.map((amount) => ({ ...amount })),
      } } : {}),
      ...(device.processPlans.length ? { recipes: device.processPlans.map((plan) => ({
        process: plan.definition.id,
        mode: plan.mode.id,
        modeName: plan.mode.name,
        durationTicks: plan.durationTicks,
        powerMilliWatts: plan.powerMilliWatts,
        priority: plan.priority,
        setupGroup: plan.setupGroup,
        ...(plan.quality?.kind === "inspection" ? { quality: {
          kind: "inspection" as const, detects: plan.quality.detects,
          rejectResource: plan.quality.rejectOutput.resource,
          scrapResource: plan.quality.scrapOutput?.resource,
          maxReworkCycles: plan.quality.maxReworkCycles,
        } } : plan.quality?.kind === "rework" ? { quality: {
          kind: "rework" as const, repairs: plan.quality.repairs,
        } } : {}),
        inputs: plan.inputs.map((amount) => ({ ...amount })),
        tooling: structuredClone(plan.tooling),
        toolingProviders: plan.toolingProviders.map((provider) => ({ ...provider })),
        utilities: structuredClone(plan.utilities),
        utilityProviders: structuredClone(plan.utilityProviders),
        outputs: plan.outputs.map((amount) => ({ ...amount })),
      })) } : {}),
      ...(device.treatmentPlan ? { treatment: {
        mode: device.treatmentPlan.mode.id,
        modeName: device.treatmentPlan.mode.name,
        level: device.treatmentPlan.mode.level,
        durationTicks: device.treatmentPlan.mode.durationTicks,
        itemCount: device.treatmentPlan.mode.itemCount,
        inputBuffer: device.treatmentPlan.inputBuffer,
        outputBuffer: device.treatmentPlan.outputBuffer,
        agentBuffer: device.treatmentPlan.agentBuffer,
        agentResource: device.treatmentPlan.mode.agent.resource,
        agentCount: device.treatmentPlan.mode.agent.count,
      } } : {}),
    })),
    connections: Object.values(project.connections).map((connection) => {
      const from = {
        x: connection.fromDevice.position.x + regionLayout.offsets.get(connection.fromDevice.region)!.x + connection.fromDevice.footprint.width / 2,
        y: connection.fromDevice.position.y + regionLayout.offsets.get(connection.fromDevice.region)!.y + connection.fromDevice.footprint.height / 2,
        level: 0,
      };
      const to = {
        x: connection.toDevice.position.x + regionLayout.offsets.get(connection.toDevice.region)!.x + connection.toDevice.footprint.width / 2,
        y: connection.toDevice.position.y + regionLayout.offsets.get(connection.toDevice.region)!.y + connection.toDevice.footprint.height / 2,
        level: 0,
      };
      const cells = connection.path.map((cell) => ({ x: cell.x + regionLayout.offsets.get(connection.fromDevice.region)!.x + .5, y: cell.y + regionLayout.offsets.get(connection.fromDevice.region)!.y + .5, level: cell.level ?? 0 }));
      const endpoints = (["loader", "unloader"] as const).map((stageName) => {
        const stage = connection.logisticsStages.find((item) => item.stage === stageName)!;
        const belt = stageName === "loader" ? cells[0]! : cells.at(-1)!;
        const device = stageName === "loader" ? from : to;
        return {
          stage: stageName, device: stage.device!.id, asset: stage.asset.id, distance: stage.distance, from: device, to: belt,
          position: { x: (device.x + belt.x) / 2, y: (device.y + belt.y) / 2 },
          idlePowerMilliWatts: stage.asset.power.idleMilliWatts,
          powerMilliWatts: stage.asset.power.activeMilliWatts, powerPriority: stage.device!.policy?.powerPriority ?? 0,
          powerGrid: stage.powerGrid ?? null,
        };
      });
      return {
        id: connection.id,
        fromDevice: connection.from.device,
        toDevice: connection.to.device,
        endpointDevices: endpoints.map((endpoint) => endpoint.device),
        resources: [...connection.resources],
        from, to, points: [from, ...cells, to], endpoints,
      };
    }),
    logisticsRoutes: Object.values(project.logisticsNetworks).flatMap((network) => network.routes.map((route) => ({
      id: route.id,
      network: network.id,
      resource: route.resource,
      fromDevice: route.from,
      toDevice: route.to,
      from: {
        x: project.devices[route.from]!.position.x + regionLayout.offsets.get(route.fromRegion)!.x + project.devices[route.from]!.footprint.width / 2,
        y: project.devices[route.from]!.position.y + regionLayout.offsets.get(route.fromRegion)!.y + project.devices[route.from]!.footprint.height / 2,
      },
      to: {
        x: project.devices[route.to]!.position.x + regionLayout.offsets.get(route.toRegion)!.x + project.devices[route.to]!.footprint.width / 2,
        y: project.devices[route.to]!.position.y + regionLayout.offsets.get(route.toRegion)!.y + project.devices[route.to]!.footprint.height / 2,
      },
    }))),
    resources: Object.fromEntries(Object.entries(project.resources).map(([id, resource]) => [id, { visual: resource.visual }])),
    electricityTariffs: structuredClone(project.scenario.electricityTariffs ?? []),
    analysis: analyzeProduction(project),
    capacityPlan: planProductionCapacity(project),
    assets: {
      devices: Object.values(project.deviceAssets).map((asset) => ({
        type: "device" as const,
        id: asset.id,
        name: asset.name,
        description: asset.description,
        tags: asset.tags,
        capabilities: asset.capabilities,
        geometry: asset.geometry,
        buffers: asset.buffers,
        production: asset.production,
        maintenanceProvider: asset.maintenanceProvider,
        toolingProvider: asset.toolingProvider ? {
          ...asset.toolingProvider, stock: asset.toolingProvider.stock.map((amount) => ({ ...amount })),
        } : undefined,
        utilityProvider: asset.utilityProvider ? {
          ...asset.utilityProvider, capacities: asset.utilityProvider.capacities.map((capacity) => ({ ...capacity })),
        } : undefined,
        treatment: asset.treatment,
        extraction: asset.extraction,
        logistics: asset.logistics,
        logisticsStation: asset.logisticsStation,
        runtime: asset.runtime,
        power: asset.power,
        economics: asset.economics,
        visual: asset.visual,
        contentHash: asset.contentHash,
        instanceCount: instanceCounts.get(asset.id) ?? 0,
        fleetCount: fleetCounts.get(asset.id) ?? 0,
      })),
      resources: Object.values(project.resources).map((asset) => ({
        type: "resource" as const,
        id: asset.id,
        name: asset.name,
        description: asset.description,
        tags: asset.tags,
        unit: asset.unit,
        transport: asset.transport,
        tracking: asset.tracking,
        fuel: asset.fuel,
        visual: asset.visual,
        contentHash: asset.contentHash,
      })),
      processes: Object.values(project.processes).map((process) => ({
        type: "process" as const,
        id: process.id,
        name: process.name,
        description: process.description,
        category: process.category,
        tags: process.tags,
        setupGroup: process.setupGroup,
        quality: process.quality,
        lotTermination: process.lotTermination,
        lotOutputProfiles: process.lotOutputProfiles,
        durationTicks: process.durationTicks,
        inputs: process.inputs,
        tooling: process.tooling,
        utilities: process.utilities,
        outputs: process.outputs,
        contentHash: process.contentHash,
      })),
      routes: Object.values(project.routes).map((route) => ({
        type: "route" as const,
        id: route.id,
        name: route.name,
        description: route.description,
        tags: [route.family, "product-route"],
        family: route.family,
        entry: route.entry,
        steps: route.steps,
        contentHash: route.contentHash,
      })),
    },
    events,
    metrics,
    selectedRun: selected?.name ?? null,
    runs: compatibleRuns.map((run) => ({
      name: run.name,
      score: run.score,
      decision: run.manifest.decision,
      blueprint: run.manifest.selection.blueprint,
      resultHash: run.manifest.resultHash,
    })),
  };
}

function decoded(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new Error("Malformed URL component"); }
}

function projectSelection(url: URL): ProjectSelection {
  const selected = (key: keyof ProjectSelection) => url.searchParams.get(key) || undefined;
  return {
    world: selected("world"),
    blueprint: selected("blueprint"),
    productionPlan: selected("productionPlan"),
    scenario: selected("scenario"),
    objective: selected("objective"),
  };
}

function errorDetails(error: unknown): { status: number; body: { code: string; error: string; hashes?: Record<string, string> } } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof RunComparisonError) {
    const status = error.code === "run-comparison.unknown-run" ? 404
      : error.code === "run-comparison.incompatible" || error.code === "run-comparison.invalid-evidence" ? 409
        : 400;
    return { status, body: { code: error.code, error: message, hashes: error.details } };
  }
  if (error instanceof CandidateChangeSetError) return { status: error.code === "candidate.stale-base" ? 409 : 400, body: { code: error.code, error: message } };
  if (error instanceof DesignRunError) return { status: error.code.endsWith("stale") ? 409 : 400, body: { code: error.code, error: message, hashes: error.hashes } };
  if (error instanceof IndustrialInvestigationError) {
    const status = error.code.endsWith("exists") ? 409
      : error.code === "investigation.missing" ? 404
        : 400;
    return { status, body: { code: error.code, error: message } };
  }
  const notFound = message.startsWith("Unknown") || message.startsWith("Not an INM");
  return { status: notFound ? 404 : 400, body: { code: notFound ? "studio.not-found" : "studio.request-failed", error: message } };
}

function errorResponse(error: unknown): Response {
  const details = errorDetails(error);
  return Response.json(details.body, { status: details.status });
}

const WATCH_TOPIC = "studio:watch";
const startedAt = new Date().toISOString();
const html = `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#071014"/><title>INM Studio</title><link rel="stylesheet" href="/main.css"/></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`;

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 255,
  async fetch(request, server) {
    renewIdleExitLease();
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const rootUrl = `http://127.0.0.1:${port}`;
        return Response.json({
          service: "inm-studio",
          protocolVersion: 5,
          engineVersion: ENGINE_VERSION,
          pid: process.pid,
          managerPid,
          inputDir,
          project: values.project ?? null,
          sourceHash,
          managerSourceHash,
          supervisor: await currentSupervisorStatus(),
          startedAt,
          url: values.project ? `${rootUrl}/${encodeURIComponent(values.project)}` : rootUrl,
        });
      }
      if (url.pathname === "/api/watch") {
        if (server.upgrade(request)) return;
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      if (url.pathname === "/main.js" || url.pathname === "/main.js.map" || url.pathname === "/main.css") {
        const file = Bun.file(join(cacheDir, url.pathname.slice(1)));
        return await file.exists()
          ? new Response(file, { headers: { "cache-control": "no-store" } })
          : new Response("Not found", { status: 404 });
      }
      if (url.pathname === "/api/projects") return Response.json(await loadProjectIndex());

      const overviewMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/overview$/);
      if (overviewMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(overviewMatch[1]!));
        return Response.json(await openProjectWorkbenchSnapshot(projectDir, projectSelection(url)));
      }

      const observationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/observation$/);
      if (observationMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(observationMatch[1]!));
        const requestedRunId = url.searchParams.get("run");
        const snapshot = requestedRunId
          ? await openRunProjectWorkbenchSnapshot(projectDir, requestedRunId)
          : await openProjectWorkbenchSnapshot(projectDir, projectSelection(url));
        return Response.json(buildFactoryObservationBrief(snapshot, requestedRunId ?? undefined));
      }

      const investigationsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/investigations$/);
      if (investigationsMatch) {
        const projectDir = await projectDirectory(decoded(investigationsMatch[1]!));
        if (request.method === "GET") {
          return Response.json({ investigations: await listIndustrialInvestigations(projectDir) });
        }
        if (request.method !== "POST") {
          return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        }
        const body = await request.json().catch(() => ({})) as {
          id?: unknown;
          name?: unknown;
          question?: unknown;
          selection?: ProjectSelection;
        };
        if (typeof body.id !== "string" || typeof body.name !== "string" || typeof body.question !== "string") {
          throw new IndustrialInvestigationError(
            "investigation.invalid-request",
            "Creating an Investigation requires string id, name, and question",
          );
        }
        const created = await createIndustrialInvestigation(projectDir, body.id, {
          name: body.name,
          question: body.question,
          selection: body.selection,
        });
        return Response.json(await inspectIndustrialInvestigation(projectDir, created.manifest.id), { status: 201 });
      }

      const investigationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/investigations\/([^/]+)$/);
      if (investigationMatch) {
        if (request.method !== "GET") {
          return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        }
        const projectDir = await projectDirectory(decoded(investigationMatch[1]!));
        return Response.json(await inspectIndustrialInvestigation(projectDir, decoded(investigationMatch[2]!)));
      }

      const investigationEntryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/investigations\/([^/]+)\/entries$/);
      if (investigationEntryMatch) {
        if (request.method !== "POST") {
          return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        }
        const projectDir = await projectDirectory(decoded(investigationEntryMatch[1]!));
        const investigationId = decoded(investigationEntryMatch[2]!);
        const body = await request.json().catch(() => ({})) as Partial<IndustrialInvestigationEntryInput>;
        if (typeof body.id !== "string"
          || (body.author !== "human" && body.author !== "agent")
          || (body.kind !== "observation" && body.kind !== "hypothesis" && body.kind !== "decision")
          || typeof body.statement !== "string") {
          throw new IndustrialInvestigationError(
            "investigation.invalid-entry",
            "Appending an Investigation entry requires id, author, kind, and statement",
          );
        }
        if (body.kind === "hypothesis"
          && (typeof body.expectedEffect !== "string"
            || (body.intervention !== "blueprint" && body.intervention !== "production-plan"))) {
          throw new IndustrialInvestigationError(
            "investigation.invalid-entry",
            "A hypothesis requires intervention blueprint|production-plan and expectedEffect",
          );
        }
        if (body.kind === "decision"
          && body.disposition !== "keep"
          && body.disposition !== "revise"
          && body.disposition !== "defer"
          && body.disposition !== "discard") {
          throw new IndustrialInvestigationError(
            "investigation.invalid-entry",
            "A decision requires disposition",
          );
        }
        await appendIndustrialInvestigationEntry(
          projectDir,
          investigationId,
          body as IndustrialInvestigationEntryInput,
        );
        return Response.json(await inspectIndustrialInvestigation(projectDir, investigationId), { status: 201 });
      }

      const dataMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/data$/);
      if (dataMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        return Response.json(await loadStudioData(
          decoded(dataMatch[1]!),
          url.searchParams.get("run") ?? undefined,
          projectSelection(url),
        ));
      }

      const runComparisonMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/run-comparison$/);
      if (runComparisonMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const fromRunId = url.searchParams.get("from");
        const toRunId = url.searchParams.get("to");
        if (!fromRunId || !toRunId) {
          return Response.json({
            code: "run-comparison.invalid-request",
            error: "Run comparison requires exact 'from' and 'to' immutable Run ids.",
          }, { status: 400 });
        }
        const projectDir = await projectDirectory(decoded(runComparisonMatch[1]!));
        return Response.json(await compareFactoryRuns(projectDir, fromRunId, toRunId));
      }

      const operationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/operations\/(validate|analyze|plan|simulate)$/);
      if (operationMatch) {
        if (request.method !== "POST") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(operationMatch[1]!));
        const body = await request.json().catch(() => ({})) as {
          selection?: ProjectSelection;
          seed?: number;
          untilTick?: number;
          maxEvents?: number;
        };
        const selection = body.selection ?? {};
        if (operationMatch[2] === "validate") return Response.json(await validateProjectOperation(projectDir, selection));
        if (operationMatch[2] === "analyze") return Response.json(await analyzeProjectOperation(projectDir, selection));
        if (operationMatch[2] === "plan") return Response.json(await planProjectOperation(projectDir, selection));
        return Response.json(await simulateProjectOperation(projectDir, selection, {
          ...(body.seed === undefined ? {} : { seed: body.seed }),
          ...(body.untilTick === undefined ? {} : { untilTick: body.untilTick }),
          ...(body.maxEvents === undefined ? {} : { maxEvents: body.maxEvents }),
        }));
      }

      const experimentsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments$/);
      if (experimentsMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(experimentsMatch[1]!));
        return Response.json({ experiments: await listBlueprintBenchmarks(projectDir) });
      }

      const operationsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/operations$/);
      if (operationsMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectId = decoded(operationsMatch[1]!);
        const projectDir = await projectDirectory(projectId);
        return Response.json({ operations: await operationRegistry.list(projectDir) });
      }

      const retainedOperationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/operations\/([^/]+)$/);
      if (retainedOperationMatch) {
        if (request.method !== "GET" && request.method !== "DELETE") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectId = decoded(retainedOperationMatch[1]!);
        const projectDir = await projectDirectory(projectId);
        const operationId = decoded(retainedOperationMatch[2]!);
        const operation = request.method === "DELETE"
          ? await operationRegistry.cancel(projectDir, operationId)
          : await operationRegistry.get(projectDir, operationId);
        return operation
          ? Response.json({ operation })
          : Response.json({ code: "studio.operation-not-found", error: `Unknown Studio operation '${operationId}'` }, { status: 404 });
      }

      const designsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/designs$/);
      if (designsMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(designsMatch[1]!));
        return Response.json({ programs: await listDesignPrograms(projectDir) });
      }

      const designProgramMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/designs\/([^/]+)$/);
      if (designProgramMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(designProgramMatch[1]!));
        const programId = decoded(designProgramMatch[2]!);
        return Response.json(await inspectDesignProgramEvidence(projectDir, programId));
      }

      const designExecuteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/designs\/([^/]+)\/run$/);
      if (designExecuteMatch) {
        if (request.method !== "POST") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(designExecuteMatch[1]!));
        const body = await request.json().catch(() => ({})) as { maxCandidates?: unknown };
        if (body.maxCandidates !== undefined && (!Number.isInteger(body.maxCandidates) || (body.maxCandidates as number) < 1)) throw new Error("maxCandidates must be a positive integer");
        const programId = decoded(designExecuteMatch[2]!);
        const brief = await buildDesignProgramBrief(projectDir, programId);
        const maxCandidates = body.maxCandidates === undefined ? brief.program.budget.maxCandidates : body.maxCandidates as number;
        const started = await operationRegistry.start(projectDir, decoded(designExecuteMatch[1]!), {
          kind: "design-run", programId, maxCandidates,
        }, async ({ signal, report }) => {
          const result = await runDesignProgram(projectDir, programId, {
            maxCandidates, signal, onProgress: report, caseExecution: "background",
          });
          return {
            result,
            artifacts: [{ kind: "design-run", id: result.artifact.id, path: result.artifact.path, immutable: true }],
          };
        });
        return Response.json(started, { status: started.reused ? 200 : 202 });
      }

      const designRunMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/designs\/([^/]+)\/runs\/([^/]+)$/);
      if (designRunMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(designRunMatch[1]!));
        return Response.json(await loadDesignRun(projectDir, decoded(designRunMatch[2]!), decoded(designRunMatch[3]!)));
      }

      const designContinueMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/designs\/([^/]+)\/runs\/([^/]+)\/continue$/);
      if (designContinueMatch) {
        if (request.method !== "POST") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(designContinueMatch[1]!));
        const body = await request.json().catch(() => ({})) as { maxCandidates?: unknown };
        if (body.maxCandidates !== undefined && (!Number.isInteger(body.maxCandidates) || (body.maxCandidates as number) < 1)) throw new Error("maxCandidates must be a positive integer");
        const programId = decoded(designContinueMatch[2]!);
        const sourceResultHash = decoded(designContinueMatch[3]!);
        const brief = await buildDesignProgramBrief(projectDir, programId);
        const maxCandidates = body.maxCandidates === undefined ? brief.program.budget.maxCandidates : body.maxCandidates as number;
        const started = await operationRegistry.start(projectDir, decoded(designContinueMatch[1]!), {
          kind: "design-continue", programId, sourceResultHash, maxCandidates,
        }, async ({ signal, report }) => {
          const result = await continueDesignRun(projectDir, programId, sourceResultHash, {
            maxCandidates, signal, onProgress: report, caseExecution: "background",
          });
          return {
            result,
            artifacts: [{ kind: "design-run", id: result.artifact.id, path: result.artifact.path, immutable: true }],
          };
        });
        return Response.json(started, { status: started.reused ? 200 : 202 });
      }

      const designPromoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/designs\/([^/]+)\/runs\/([^/]+)\/promote$/);
      if (designPromoteMatch) {
        if (request.method !== "POST") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(designPromoteMatch[1]!));
        const body = await request.json().catch(() => ({})) as { candidateId?: unknown };
        if (typeof body.candidateId !== "string" || !body.candidateId) throw new Error("Promotion requires candidateId");
        return Response.json(await promoteDesignRun(projectDir, decoded(designPromoteMatch[2]!), decoded(designPromoteMatch[3]!), body.candidateId));
      }

      const experimentRunMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/run$/);
      if (experimentRunMatch) {
        if (request.method !== "POST") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(experimentRunMatch[1]!));
        const benchmarkId = decoded(experimentRunMatch[2]!);
        const started = await operationRegistry.start(projectDir, decoded(experimentRunMatch[1]!), {
          kind: "benchmark", benchmarkId,
        }, async ({ signal, report }) => {
          const operation = await evaluateBenchmarkOperation(projectDir, benchmarkId, {
            signal, onProgress: report, caseExecution: "background",
          });
          return {
            result: { command: "benchmark", ...operation.data, operation },
            artifacts: operation.artifacts,
          };
        });
        return Response.json(started, { status: started.reused ? 200 : 202 });
      }

      const experimentCandidatesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/candidates$/);
      if (experimentCandidatesMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(experimentCandidatesMatch[1]!));
        return Response.json({ candidates: await listCandidateChangeSets(projectDir, decoded(experimentCandidatesMatch[2]!)) });
      }

      const candidateReviewMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/candidates\/([^/]+)\/review$/);
      if (candidateReviewMatch) {
        if (request.method !== "GET") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(candidateReviewMatch[1]!));
        const benchmarkId = decoded(candidateReviewMatch[2]!);
        const candidateId = decoded(candidateReviewMatch[3]!);
        const candidate = await loadCandidateChangeSet(projectDir, candidateId);
        if (candidate.benchmark !== benchmarkId) throw new CandidateChangeSetError("candidate.benchmark-mismatch", `Candidate '${candidateId}' belongs to Benchmark '${candidate.benchmark}', not '${benchmarkId}'`);
        const decision = await inspectCandidateDecision(projectDir, candidateId);
        return Response.json({
          state: decision.state,
          sourceEvidence: decision.sourceEvidence,
          error: decision.error ?? null,
          review: decision.preview ? { command: "candidate", action: "preview", ...decision.preview } : null,
        });
      }

      const candidateActionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/candidates\/([^/]+)\/(preview|apply)$/);
      if (candidateActionMatch) {
        if (request.method !== "POST") return Response.json({ code: "studio.method-not-allowed", error: "Method not allowed" }, { status: 405 });
        const projectDir = await projectDirectory(decoded(candidateActionMatch[1]!));
        const benchmarkId = decoded(candidateActionMatch[2]!);
        const candidateId = decoded(candidateActionMatch[3]!);
        const action = candidateActionMatch[4]!;
        const candidate = await loadCandidateChangeSet(projectDir, candidateId);
        if (candidate.benchmark !== benchmarkId) throw new CandidateChangeSetError("candidate.benchmark-mismatch", `Candidate '${candidateId}' belongs to Benchmark '${candidate.benchmark}', not '${benchmarkId}'`);
        if (action === "preview") {
          const started = await operationRegistry.start(projectDir, decoded(candidateActionMatch[1]!), {
            kind: "candidate-preview", benchmarkId, candidateId,
          }, async ({ signal, report }) => {
            const operation = await previewCandidateOperation(projectDir, candidateId, {
              signal, onProgress: report, caseExecution: "background",
            });
            return {
              result: {
                command: "candidate",
                action,
                decisionState: `reviewed-${operation.data.result.verdict.toLowerCase()}`,
                ...operation.data,
                operation,
              },
              artifacts: operation.artifacts,
            };
          });
          return Response.json(started, { status: started.reused ? 200 : 202 });
        }
        const reviewed = await request.json() as { proposalHash?: unknown; currentCandidateHash?: unknown; proposedCandidateHash?: unknown };
        if (typeof reviewed.proposalHash !== "string" || typeof reviewed.currentCandidateHash !== "string" || typeof reviewed.proposedCandidateHash !== "string") throw new CandidateChangeSetError("candidate.invalid-review", "Apply requires reviewed proposalHash, currentCandidateHash, and proposedCandidateHash");
        const started = await operationRegistry.start(projectDir, decoded(candidateActionMatch[1]!), {
          kind: "candidate-apply",
          benchmarkId,
          candidateId,
        }, async ({ signal, report }) => {
          const operation = await applyCandidateOperation(projectDir, candidateId, {
            proposalHash: reviewed.proposalHash as string,
            currentCandidateHash: reviewed.currentCandidateHash as string,
            proposedCandidateHash: reviewed.proposedCandidateHash as string,
          }, { signal, onProgress: report, caseExecution: "background" });
          return {
            result: { command: "candidate", action, decisionState: "verified", ...operation.data, operation },
            artifacts: operation.artifacts,
          };
        });
        return Response.json(started, { status: started.reused ? 200 : 202 });
      }

      const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
      if (fileMatch) {
        const projectId = decoded(fileMatch[1]!);
        const segments = fileMatch[2]!.split("/").map(decoded);
        const root = await projectDirectory(projectId);
        const filePath = resolve(root, segments.join("/"));
        if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return new Response("Forbidden", { status: 403 });
        const file = Bun.file(filePath);
        if (!await file.exists()) return new Response("Not found", { status: 404 });
        const [realRoot, realFilePath] = await Promise.all([realpath(root), realpath(filePath)]);
        if (realFilePath !== realRoot && !realFilePath.startsWith(`${realRoot}${sep}`)) return new Response("Forbidden", { status: 403 });
        return new Response(Bun.file(realFilePath));
      }

      if (url.pathname === "/" || /^\/[^/]+\/?$/.test(url.pathname)
        || /^\/[^/]+\/(?:factory(?:\/(?:devices|connections)\/[^/]+)?|runs|catalog(?:\/(?:devices|resources|processes|routes)(?:\/[^/]+)?)?|analysis(?:\/diagnostics\/[^/]+)?|experiments(?:\/[^/]+(?:\/candidates\/[^/]+)?)?|designs(?:\/[^/]+(?:\/runs\/[^/]+)?)?|investigations(?:\/[^/]+)?)\/?$/.test(url.pathname)) {
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  },
  websocket: {
    open(socket) {
      renewIdleExitLease();
      socket.subscribe(WATCH_TOPIC);
      socket.send(studioWatchMessage({ version: 1, type: "ready", sourceHash }));
    },
    message() { renewIdleExitLease(); },
    close(socket) { socket.unsubscribe(WATCH_TOPIC); },
  },
});
renewIdleExitLease();

interface PendingProjectRefresh {
  attempt: number;
  timer: ReturnType<typeof setTimeout>;
}
const pendingProjectRefreshes = new Map<string, PendingProjectRefresh>();
const publishedEvidenceRefreshes = new Set<string>();
function scheduleProjectRefresh(projectDir: string, projectId: string, changedPath: string): void {
  const probePath = projectRefreshProbePath(changedPath);
  if (!probePath) return;
  const key = `${projectId}\0${probePath}`;
  const pending = pendingProjectRefreshes.get(key);
  if (pending) clearTimeout(pending.timer);
  scheduleProbe(projectDir, projectId, probePath, key, 0, 75);
}

function scheduleProbe(
  projectDir: string,
  projectId: string,
  probePath: string,
  key: string,
  attempt: number,
  delay: number,
): void {
  const evidence = probePath.startsWith("runs/")
    || probePath.startsWith("design-runs/")
    || probePath.startsWith("candidate-reviews/");
  const timer = setTimeout(() => {
    pendingProjectRefreshes.delete(key);
    void completedProjectRefresh(projectDir, projectId, probePath)
      .then((refresh) => {
        if (refresh) {
          const evidenceKey = `${refresh.projectId}\0${refresh.reason}\0${refresh.artifactId ?? ""}`;
          if (!evidence || !publishedEvidenceRefreshes.has(evidenceKey)) {
            if (evidence) publishedEvidenceRefreshes.add(evidenceKey);
            server.publish(WATCH_TOPIC, studioWatchMessage(refresh));
          }
        } else if (evidence && attempt < 39) {
          scheduleProbe(projectDir, projectId, probePath, key, attempt + 1, 125);
        }
      })
      .catch(() => {
        if (evidence && attempt < 39) {
          scheduleProbe(projectDir, projectId, probePath, key, attempt + 1, 125);
        }
      });
  }, delay);
  pendingProjectRefreshes.set(key, { attempt, timer });
}

const projectWatchers = new Map<string, FSWatcher>();
const workspaceWatchers: FSWatcher[] = [];
async function synchronizeProjectWatchers(): Promise<void> {
  const projects = await workspaceProjects();
  const currentPaths = new Set(projects.map((project) => resolve(project.path)));
  for (const [path, watcher] of projectWatchers) {
    if (currentPaths.has(path)) continue;
    watcher.close();
    projectWatchers.delete(path);
  }
  for (const project of projects) {
    const path = resolve(project.path);
    if (projectWatchers.has(path)) continue;
    const watcher = watchProjectFiles(path, { recursive: true }, (_event, fileName) => {
      if (fileName) scheduleProjectRefresh(path, project.id, fileName.toString().split(sep).join("/"));
    });
    watcher.on("error", () => undefined);
    projectWatchers.set(path, watcher);
  }
}
await synchronizeProjectWatchers();

if (workspaceMode) {
  const workspace = await loadWorkspace(inputDir);
  const publishWorkspaceRefresh = () => {
    void synchronizeProjectWatchers()
      .then(() => server.publish(WATCH_TOPIC, studioWatchMessage({ version: 1, type: "index-refresh" })))
      .catch(() => undefined);
  };
  const manifestWatcher = watchProjectFiles(inputDir, { recursive: false }, (_event, fileName) => {
    if (fileName?.toString() === "inm-workspace.json") publishWorkspaceRefresh();
  });
  const projectsWatcher = watchProjectFiles(join(inputDir, workspace.manifest.projectsDirectory), { recursive: false }, publishWorkspaceRefresh);
  manifestWatcher.on("error", () => undefined);
  projectsWatcher.on("error", () => undefined);
  workspaceWatchers.push(manifestWatcher, projectsWatcher);
}

if (values.project) await projectDirectory(values.project);
const rootUrl = `http://127.0.0.1:${server.port}`;
const openUrl = values.project ? `${rootUrl}/${encodeURIComponent(values.project)}` : rootUrl;
if (managerPid === null) {
  process.stdout.write(`INM Studio: ${openUrl}\n${workspaceMode ? `Workspace: ${inputDir}` : `Project: ${inputDir}`}\nProject selector: ${rootUrl}/\nPress Ctrl+C to stop.\n`);
} else {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    component: "studio-server",
    event: "server-ready",
    pid: process.pid,
    managerPid,
    port: server.port,
    inputDir,
    project: values.project ?? null,
    sourceHash,
    managerSourceHash,
    url: openUrl,
  })}\n`);
}
if (!values["no-open"]) Bun.spawn(["open", openUrl], { stdout: "ignore", stderr: "ignore" });
