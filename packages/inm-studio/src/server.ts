#!/usr/bin/env bun
import { mkdir, readFile, readdir, watch } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  blueprintSchema,
  compileFactoryProject,
  findCachedRun,
  listRuns,
  listWorkspaceProjects,
  loadFactoryProject,
  loadWorkspace,
  manifestSchema,
  openFactoryProject,
  pathExists,
  readJson,
  resolveProjectDirectory,
  runUntil,
  writeRunArtifact,
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
    const [resourceAssets, deviceAssets, processes, runs] = await Promise.all([
      countAssetDirectories(summary.path, "resources"),
      countAssetDirectories(summary.path, "devices"),
      countProcessFiles(summary.path),
      listRuns(summary.path),
    ]);
    return {
      id: summary.id,
      name: summary.name,
      isDefault: summary.isDefault,
      resourceAssets,
      deviceAssets,
      processes,
      deviceInstances: blueprint.devices.length,
      connections: blueprint.connections.length,
      runs: runs.length,
      bounds: blueprint.bounds,
    };
  }));
  const name = workspaceMode ? (await loadWorkspace(inputDir)).manifest.name : "INM Studio";
  return { name, workspace: workspaceMode, projects: summaries };
}

async function ensureBaseline(projectDir: string) {
  const project = await openFactoryProject(projectDir);
  const result = runUntil(project, undefined, { seed: 42 });
  const cached = await findCachedRun(projectDir, result.runKey);
  if (!cached) await writeRunArtifact(project, result, { label: "studio-baseline", seed: 42, decision: "BASELINE" });
}

async function loadStudioData(projectId: string, runName?: string) {
  const projectDir = await projectDirectory(projectId);
  await ensureBaseline(projectDir);
  const loaded = await loadFactoryProject(projectDir);
  const runs = await listRuns(projectDir);
  const selected = runs.find((run) => run.name === runName)
    ?? runs.findLast((run) => run.manifest.decision === "KEEP")
    ?? runs[0];
  const runBlueprint = selected
    ? JSON.parse(await readFile(join(selected.path, "blueprint.json"), "utf8"))
    : loaded.blueprint;
  const project = compileFactoryProject({ ...loaded, blueprint: runBlueprint });
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

  return {
    name: project.manifest.name,
    projectId: project.manifest.id,
    blueprintHash: project.hashes.blueprintHash,
    bounds: project.blueprint.bounds,
    devices: Object.values(project.devices).map((device) => ({
      id: device.id,
      assetId: device.asset,
      name: device.assetDef.name,
      capabilities: device.assetDef.capabilities,
      position: device.position,
      rotation: device.rotation,
      footprint: device.footprint,
      visual: device.assetDef.visual,
    })),
    connections: Object.values(project.connections).map((connection) => ({
      id: connection.id,
      fromDevice: connection.from.device,
      toDevice: connection.to.device,
      from: {
        x: connection.fromDevice.position.x + connection.fromDevice.footprint.width / 2,
        y: connection.fromDevice.position.y + connection.fromDevice.footprint.height / 2,
      },
      to: {
        x: connection.toDevice.position.x + connection.toDevice.footprint.width / 2,
        y: connection.toDevice.position.y + connection.toDevice.footprint.height / 2,
      },
    })),
    resources: Object.fromEntries(Object.entries(project.resources).map(([id, resource]) => [id, { visual: resource.visual }])),
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
        runtime: asset.runtime,
        power: asset.power,
        economics: asset.economics,
        visual: asset.visual,
        contentHash: asset.contentHash,
        instanceCount: instanceCounts.get(asset.id) ?? 0,
      })),
      resources: Object.values(project.resources).map((asset) => ({
        type: "resource" as const,
        id: asset.id,
        name: asset.name,
        description: asset.description,
        tags: asset.tags,
        unit: asset.unit,
        transport: asset.transport,
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
        durationTicks: process.durationTicks,
        inputs: process.inputs,
        outputs: process.outputs,
        contentHash: process.contentHash,
      })),
    },
    events,
    metrics,
    selectedRun: selected?.name ?? null,
    runs: runs.map((run) => ({
      name: run.name,
      score: run.score,
      decision: run.manifest.decision,
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
