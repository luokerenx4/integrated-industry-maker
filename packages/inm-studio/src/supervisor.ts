#!/usr/bin/env bun
import { stat, watch } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  atomicWriteJson,
  readJson,
  studioSourceHash,
  studioSourceWatchPaths,
} from "@inm/core";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: "string" },
    project: { type: "string" },
    "no-open": { type: "boolean", default: false },
    "state-path": { type: "string" },
  },
  allowPositionals: true,
});

if (positionals.length !== 1 || values.port === undefined || values["state-path"] === undefined) {
  throw new Error("Usage: inm-studio supervisor <project-or-workspace-dir> --port N --state-path PATH [--project ID] [--no-open]");
}

const inputDir = resolve(positionals[0]!);
const port = Number(values.port);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Studio supervisor port must be an integer from 1 through 65535");
const statePath = resolve(values["state-path"]);
const serverEntry = join(import.meta.dir, "server.ts");
const serverArgs = [
  inputDir,
  "--port",
  String(port),
  "--no-open",
  ...(values.project ? ["--project", values.project] : []),
];

let sourceHash = await studioSourceHash();
let child: ReturnType<typeof Bun.spawn>;
let restarting = false;
let stopping = false;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconcilePending = false;
const watchAbort = new AbortController();

function failSupervisor(error: unknown): void {
  if (stopping) return;
  stopping = true;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  watchAbort.abort();
  process.stderr.write(`INM Studio supervisor failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  child.kill("SIGTERM");
  void child.exited.finally(() => process.exit(1));
}

function spawnServer() {
  const next = Bun.spawn([process.execPath, serverEntry, ...serverArgs], {
    cwd: resolve(import.meta.dir, "../../.."),
    env: {
      ...process.env,
      INM_STUDIO_MANAGER_PID: String(process.pid),
    },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  void next.exited.then((exitCode) => {
    if (next !== child || restarting || stopping) return;
    stopping = true;
    watchAbort.abort();
    process.exit(exitCode);
  });
  return next;
}

async function updateManagedState(nextSourceHash: string): Promise<void> {
  const value = await readJson(statePath) as Record<string, unknown>;
  if (value.version !== 3
    || value.inputDir !== inputDir
    || value.port !== port
    || (value.pid !== null && value.pid !== process.pid)) {
    throw new Error("Studio supervisor cannot update unverified managed state");
  }
  await atomicWriteJson(statePath, {
    ...value,
    pid: process.pid,
    sourceHash: nextSourceHash,
    startedAt: new Date().toISOString(),
  });
}

async function restartServer(nextSourceHash: string): Promise<void> {
  restarting = true;
  const previous = child;
  previous.kill("SIGTERM");
  await previous.exited;
  if (stopping) return;
  await updateManagedState(nextSourceHash);
  sourceHash = nextSourceHash;
  child = spawnServer();
  restarting = false;
  if (reconcilePending) {
    reconcilePending = false;
    scheduleReconcile();
  }
}

async function reconcileSource(): Promise<void> {
  reconcileTimer = null;
  if (stopping) return;
  if (restarting) {
    reconcilePending = true;
    return;
  }
  let nextSourceHash: string;
  try {
    nextSourceHash = await studioSourceHash();
  } catch {
    reconcileTimer = setTimeout(() => { void reconcileSource().catch(failSupervisor); }, 200);
    return;
  }
  if (nextSourceHash !== sourceHash) await restartServer(nextSourceHash);
}

function scheduleReconcile(): void {
  if (stopping || reconcileTimer) return;
  reconcileTimer = setTimeout(() => { void reconcileSource().catch(failSupervisor); }, 75);
}

async function watchSource(path: string): Promise<void> {
  const metadata = await stat(path);
  const target = metadata.isDirectory() ? path : dirname(path);
  const fileName = metadata.isDirectory() ? null : basename(path);
  try {
    for await (const event of watch(target, {
      recursive: metadata.isDirectory(),
      signal: watchAbort.signal,
    })) {
      if (fileName !== null && event.filename?.toString() !== fileName) continue;
      scheduleReconcile();
    }
  } catch (error) {
    if (!stopping && (error as { name?: string }).name !== "AbortError") throw error;
  }
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  watchAbort.abort();
  child.kill("SIGTERM");
  await child.exited;
}

process.once("SIGTERM", () => { void shutdown().then(() => process.exit(0)); });
process.once("SIGINT", () => { void shutdown().then(() => process.exit(0)); });

child = spawnServer();
for (const path of studioSourceWatchPaths()) void watchSource(path).catch(failSupervisor);
