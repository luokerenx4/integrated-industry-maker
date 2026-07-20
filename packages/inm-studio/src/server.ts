#!/usr/bin/env bun
import { mkdir, readFile, watch } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { compileFactoryProject, findCachedRun, listRuns, loadFactoryProject, openFactoryProject, runUntil, writeRunArtifact } from "@inm/core";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2), options: { port: { type: "string", default: "4175" }, "no-open": { type: "boolean", default: false } }, allowPositionals: true,
});
if (positionals.length !== 1) throw new Error("Usage: inm studio <project-dir> [--port N] [--no-open]");
const projectDir = resolve(positionals[0]!); const port = Number(values.port);
const cacheDir = join(projectDir, ".inm", "cache", "studio");
await mkdir(cacheDir, { recursive: true });
const build = await Bun.build({ entrypoints: [join(import.meta.dir, "main.tsx")], outdir: cacheDir, target: "browser", format: "esm", sourcemap: "linked", minify: false });
if (!build.success) throw new Error(`Studio build failed:\n${build.logs.join("\n")}`);

async function ensureBaseline() {
  const project = await openFactoryProject(projectDir); const result = runUntil(project, undefined, { seed: 42 });
  const cached = await findCachedRun(projectDir, result.runKey);
  if (!cached) await writeRunArtifact(project, result, { label: "studio-baseline", seed: 42, decision: "BASELINE" });
}
await ensureBaseline();

async function loadStudioData(runName?: string) {
  const loaded = await loadFactoryProject(projectDir); const runs = await listRuns(projectDir);
  const selected = runs.find((run) => run.name === runName) ?? runs.findLast((run) => run.manifest.decision === "KEEP") ?? runs[0];
  const runBlueprint = selected ? JSON.parse(await readFile(join(selected.path, "blueprint.json"), "utf8")) : loaded.blueprint;
  const project = compileFactoryProject({ ...loaded, blueprint: runBlueprint });
  let events = []; let metrics = null;
  if (selected) {
    events = (await readFile(join(selected.path, "events.ndjson"), "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    metrics = JSON.parse(await readFile(join(selected.path, "metrics.json"), "utf8"));
  }
  return {
    name: project.manifest.name, blueprintHash: project.hashes.blueprintHash, bounds: project.blueprint.bounds,
    devices: Object.values(project.devices).map((device) => ({
      id: device.id, assetId: device.asset, name: device.assetDef.name, capabilities: device.assetDef.capabilities,
      position: device.position, rotation: device.rotation, footprint: device.footprint, visual: device.assetDef.visual ?? {},
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
      const filePath = resolve(projectDir, decodeURIComponent(url.pathname.slice("/files/".length)));
      if (filePath !== projectDir && !filePath.startsWith(`${projectDir}${sep}`)) return new Response("Forbidden", { status: 403 });
      const file = Bun.file(filePath); return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/api/data") return Response.json(await loadStudioData(url.searchParams.get("run") ?? undefined));
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
    for await (const event of watch(projectDir, { recursive: true })) {
      const name = event.filename?.toString() ?? "";
      if (name.startsWith(".inm/") || name.includes("/runs/")) continue;
      for (const client of clients) { try { client.enqueue(`data: refresh\n\n`); } catch { clients.delete(client); } }
    }
  } catch { /* Recursive watch is best-effort; manual refresh remains available. */ }
})();

const url = `http://localhost:${server.port}`;
process.stdout.write(`INM Studio: ${url}\nProject: ${projectDir}\nPress Ctrl+C to stop.\n`);
if (!values["no-open"]) Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
