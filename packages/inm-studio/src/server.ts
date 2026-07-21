#!/usr/bin/env bun
import { mkdir, readFile, readdir, watch } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  analyzeProduction,
  blueprintSchema,
  compileFactoryProject,
  ENGINE_VERSION,
  listRuns,
  listWorkspaceProjects,
  loadFactoryProject,
  loadWorkspace,
  manifestSchema,
  worldSchema,
  openFactoryProject,
  pathExists,
  planProductionCapacity,
  readJson,
  resolveProjectDirectory,
} from "@inm/core";

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
  throw new Error("Usage: inm studio <project-or-workspace-dir> [--project ID] [--port N] [--no-open]");
}

const inputDir = resolve(positionals[0]!);
const port = Number(values.port);
const workspaceMode = await pathExists(join(inputDir, "inm-workspace.json"));
const cacheDir = join(inputDir, ".inm", "cache", "studio");
await mkdir(cacheDir, { recursive: true });

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

async function loadStudioData(projectId: string, runName?: string) {
  const projectDir = await projectDirectory(projectId);
  const runs = (await listRuns(projectDir)).filter((run) => run.manifest.engineVersion === ENGINE_VERSION && run.manifest.selection.blueprint);
  const selected = runs.find((run) => run.name === runName)
    ?? runs.findLast((run) => run.manifest.decision === "KEEP")
    ?? runs.at(-1);
  const loaded = await loadFactoryProject(projectDir, selected?.manifest.selection);
  const runBlueprint = selected
    ? JSON.parse(await readFile(join(selected.path, "blueprint.json"), "utf8"))
    : loaded.blueprint;
  const project = compileFactoryProject({ ...loaded, blueprint: runBlueprint });
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
      ...(device.policy?.setupCampaign ? { setupCampaign: { ...device.policy.setupCampaign } } : {}),
      ...(device.policy?.preventiveMaintenance ? { preventiveMaintenance: { ...device.policy.preventiveMaintenance } } : {}),
      ...(device.assetDef.production?.maintenance ? { maintenance: { ...device.assetDef.production.maintenance } } : {}),
      maintenanceProviders: device.maintenanceProviders.map((provider) => ({ ...provider })),
      qualificationProviders: device.qualificationProviders.map((provider) => ({ ...provider })),
      ...(device.assetDef.maintenanceProvider ? { maintenanceProvider: { ...device.assetDef.maintenanceProvider } } : {}),
      ...(device.assetDef.toolingProvider ? { toolingProvider: {
        ...device.assetDef.toolingProvider, stock: device.assetDef.toolingProvider.stock.map((amount) => ({ ...amount })),
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
        changeoverDurationTicks: device.processPlan.changeoverDurationTicks,
        changeoverPowerMilliWatts: device.processPlan.changeoverPowerMilliWatts,
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
        changeoverDurationTicks: plan.changeoverDurationTicks,
        changeoverPowerMilliWatts: plan.changeoverPowerMilliWatts,
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
        durationTicks: process.durationTicks,
        inputs: process.inputs,
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
    runs: runs.map((run) => ({
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

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const notFound = message.startsWith("Unknown") || message.startsWith("Not an INM");
  return Response.json({ error: message }, { status: notFound ? 404 : 400 });
}

const clients = new Set<ReadableStreamDefaultController>();
const html = `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#071014"/><title>INM Studio</title><link rel="stylesheet" href="/main.css"/></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`;

const server = Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/main.js" || url.pathname === "/main.js.map" || url.pathname === "/main.css") {
        const file = Bun.file(join(cacheDir, url.pathname.slice(1)));
        return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
      }
      if (url.pathname === "/api/projects") return Response.json(await loadProjectIndex());

      const dataMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/data$/);
      if (dataMatch) {
        return Response.json(await loadStudioData(decoded(dataMatch[1]!), url.searchParams.get("run") ?? undefined));
      }

      const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
      if (fileMatch) {
        const projectId = decoded(fileMatch[1]!);
        const segments = fileMatch[2]!.split("/").map(decoded);
        const root = await projectDirectory(projectId);
        const filePath = resolve(root, segments.join("/"));
        if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return new Response("Forbidden", { status: 403 });
        const file = Bun.file(filePath);
        return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
      }

      if (url.pathname === "/api/watch") {
        const stream = new ReadableStream({
          start(controller) {
            clients.add(controller);
            controller.enqueue("data: ready\n\n");
          },
          cancel(controller) { clients.delete(controller); },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
      }

      if (url.pathname === "/" || /^\/[^/]+\/?$/.test(url.pathname)) {
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

(async () => {
  try {
    for await (const event of watch(inputDir, { recursive: true })) {
      const name = event.filename?.toString() ?? "";
      if (name.startsWith(".inm/") || name.includes("/.inm/") || name.startsWith("runs/") || name.includes("/runs/")) continue;
      for (const client of clients) {
        try { client.enqueue("data: refresh\n\n"); }
        catch { clients.delete(client); }
      }
    }
  } catch { /* Recursive watch is best-effort; manual refresh remains available. */ }
})();

if (values.project) await projectDirectory(values.project);
const rootUrl = `http://localhost:${server.port}`;
const openUrl = values.project ? `${rootUrl}/${encodeURIComponent(values.project)}` : rootUrl;
process.stdout.write(`INM Studio: ${openUrl}\n${workspaceMode ? `Workspace: ${inputDir}` : `Project: ${inputDir}`}\nProject selector: ${rootUrl}/\nPress Ctrl+C to stop.\n`);
if (!values["no-open"]) Bun.spawn(["open", openUrl], { stdout: "ignore", stderr: "ignore" });
