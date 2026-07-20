#!/usr/bin/env bun
import { mkdir, readFile, watch } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  compileFactoryProject, findCachedRun, listRuns, listWorkspaceProjects, loadFactoryProject, loadWorkspace,
  openFactoryProject, pathExists, resolveProjectDirectory, runUntil, writeRunArtifact,
} from "@inm/core";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2), options: { port: { type: "string", default: "4175" }, project: { type: "string" }, "no-open": { type: "boolean", default: false } }, allowPositionals: true,
});
if (positionals.length !== 1) throw new Error("Usage: inm studio <project-or-workspace-dir> [--project ID] [--port N] [--no-open]");
const inputDir = resolve(positionals[0]!); const port = Number(values.port);
const workspaceMode = await pathExists(join(inputDir, "inm-workspace.json"));
const initialProjectDir = await resolveProjectDirectory(inputDir, values.project);
const cacheDir = join(inputDir, ".inm", "cache", "studio");
await mkdir(cacheDir, { recursive: true });
const build = await Bun.build({ entrypoints: [join(import.meta.dir, "main.tsx")], outdir: cacheDir, target: "browser", format: "esm", sourcemap: "linked", minify: false });
if (!build.success) throw new Error(`Studio build failed:\n${build.logs.join("\n")}`);

async function projectDirectory(projectId?: string): Promise<string> {
  if (workspaceMode) return resolveProjectDirectory(inputDir, projectId ?? values.project);
  const directory = await resolveProjectDirectory(inputDir);
  if (projectId) {
    const loaded = await loadFactoryProject(directory);
    if (projectId !== loaded.manifest.id) throw new Error(`Studio project '${projectId}' does not match '${loaded.manifest.id}'`);
  }
  return directory;
}

async function ensureBaseline(projectDir: string) {
  const project = await openFactoryProject(projectDir); const result = runUntil(project, undefined, { seed: 42 });
  const cached = await findCachedRun(projectDir, result.runKey);
  if (!cached) await writeRunArtifact(project, result, { label: "studio-baseline", seed: 42, decision: "BASELINE" });
}
await ensureBaseline(initialProjectDir);

async function workspaceProjects() {
  if (workspaceMode) return listWorkspaceProjects(inputDir);
  const loaded = await loadFactoryProject(inputDir);
  return [{ id: loaded.manifest.id, name: loaded.manifest.name, path: loaded.rootDir, isDefault: true }];
}

async function loadStudioData(runName?: string, projectId?: string) {
  const projectDir = await projectDirectory(projectId); await ensureBaseline(projectDir);
  const loaded = await loadFactoryProject(projectDir); const runs = await listRuns(projectDir);
  const selected = runs.find((run) => run.name === runName) ?? runs.findLast((run) => run.manifest.decision === "KEEP") ?? runs[0];
  const runBlueprint = selected ? JSON.parse(await readFile(join(selected.path, "blueprint.json"), "utf8")) : loaded.blueprint;
  const project = compileFactoryProject({ ...loaded, blueprint: runBlueprint });
  let events = []; let metrics = null;
  if (selected) {
    events = (await readFile(join(selected.path, "events.ndjson"), "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    metrics = JSON.parse(await readFile(join(selected.path, "metrics.json"), "utf8"));
  }
  const projects = await workspaceProjects();
  return {
    name: project.manifest.name, projectId: project.manifest.id,
    workspace: workspaceMode ? { name: (await loadWorkspace(inputDir)).manifest.name, projects: projects.map(({ id, name, isDefault }) => ({ id, name, isDefault })) } : null,
    blueprintHash: project.hashes.blueprintHash, bounds: project.blueprint.bounds,
    devices: Object.values(project.devices).map((device) => ({
      id: device.id, assetId: device.asset, name: device.assetDef.name, capabilities: device.assetDef.capabilities,
      position: device.position, rotation: device.rotation, footprint: device.footprint, visual: device.assetDef.visual,
    })),
    connections: Object.values(project.connections).map((connection) => ({
      id: connection.id, fromDevice: connection.from.device, toDevice: connection.to.device,
      from: { x: connection.fromDevice.position.x + connection.fromDevice.footprint.width / 2, y: connection.fromDevice.position.y + connection.fromDevice.footprint.height / 2 },
      to: { x: connection.toDevice.position.x + connection.toDevice.footprint.width / 2, y: connection.toDevice.position.y + connection.toDevice.footprint.height / 2 },
    })),
    resources: project.resources, events, metrics, selectedRun: selected?.name ?? null,
    runs: runs.map((run) => ({ name: run.name, score: run.score, decision: run.manifest.decision, resultHash: run.manifest.resultHash })),
  };
}

const clients = new Set<ReadableStreamDefaultController>();
const html = `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>INM Studio</title><link rel="stylesheet" href="/main.css"/></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`;
const server = Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/main.js" || url.pathname === "/main.js.map" || url.pathname === "/main.css") {
      const file = Bun.file(join(cacheDir, url.pathname.slice(1))); return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/files/")) {
      const segments = decodeURIComponent(url.pathname.slice("/files/".length)).split("/"); const projectId = segments.shift();
      if (!projectId || !segments.length) return new Response("Invalid asset path", { status: 400 });
      const root = await projectDirectory(projectId); const filePath = resolve(root, segments.join("/"));
      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return new Response("Forbidden", { status: 403 });
      const file = Bun.file(filePath); return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/api/data") return Response.json(await loadStudioData(url.searchParams.get("run") ?? undefined, url.searchParams.get("project") ?? undefined));
    if (url.pathname === "/api/watch") {
      const stream = new ReadableStream({
        start(controller) { clients.add(controller); controller.enqueue(`data: ready\n\n`); },
        cancel(controller) { clients.delete(controller); },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
    }
    return new Response("Not found", { status: 404 });
  },
});

(async () => {
  try {
    for await (const event of watch(inputDir, { recursive: true })) {
      const name = event.filename?.toString() ?? "";
      if (name.startsWith(".inm/") || name.includes("/.inm/") || name.startsWith("runs/") || name.includes("/runs/")) continue;
      for (const client of clients) { try { client.enqueue(`data: refresh\n\n`); } catch { clients.delete(client); } }
    }
  } catch { /* Recursive watch is best-effort; manual refresh remains available. */ }
})();

const url = `http://localhost:${server.port}`;
process.stdout.write(`INM Studio: ${url}\n${workspaceMode ? `Workspace: ${inputDir}` : `Project: ${inputDir}`}\nInitial project: ${initialProjectDir}\nPress Ctrl+C to stop.\n`);
if (!values["no-open"]) Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
