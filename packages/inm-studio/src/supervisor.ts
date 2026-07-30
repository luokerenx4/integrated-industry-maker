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
const repository = resolve(import.meta.dir, "../../..");
const serverEntry = join(import.meta.dir, "server.ts");
const clientEntry = join(import.meta.dir, "main.tsx");
const serverArgs = [
  inputDir,
  "--port",
  String(port),
  "--no-open",
  ...(values.project ? ["--project", values.project] : []),
];

type ServerChild = ReturnType<typeof Bun.spawn>;
type SupervisorPhase = "starting" | "current" | "adopting" | "degraded" | "stopping";
type RetryState = "none" | "source-change" | "explicit";
type FailurePhase = "preflight" | "startup";

interface SupervisorFailure {
  at: string;
  phase: FailurePhase;
  message: string;
}

interface SupervisorStatus {
  phase: SupervisorPhase;
  attemptedSourceHash: string;
  childPid: number | null;
  generation: number;
  heartbeatAt: string;
  retry: RetryState;
  failure: SupervisorFailure | null;
}

let sourceHash = await studioSourceHash();
const managerSourceHash = sourceHash;
let attemptedSourceHash = sourceHash;
let child: ServerChild | null = null;
let phase: SupervisorPhase = "starting";
let retryState: RetryState = "none";
let failure: SupervisorFailure | null = null;
let lastFailedHash: string | null = null;
let restarting = false;
let stopping = false;
let explicitRetryRequested = false;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconcilePending = false;
let generation = 0;
let heartbeatAt = new Date().toISOString();
const watchAbort = new AbortController();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, " ").trim().slice(0, 800) || "Unknown Studio startup failure";
}

function supervisorStatus(): SupervisorStatus {
  return {
    phase,
    attemptedSourceHash,
    childPid: child?.pid ?? null,
    generation,
    heartbeatAt,
    retry: retryState,
    failure,
  };
}

function logLifecycle(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    component: "studio-supervisor",
    event,
    managerPid: process.pid,
    port,
    inputDir,
    project: values.project ?? null,
    sourceHash,
    managerSourceHash,
    generation,
    phase,
    ...fields,
  })}\n`);
}

async function updateManagedState(): Promise<void> {
  heartbeatAt = new Date().toISOString();
  const value = await readJson(statePath) as Record<string, unknown>;
  if (value.version !== 5
    || value.inputDir !== inputDir
    || value.port !== port
    || (value.pid !== null && value.pid !== process.pid)) {
    throw new Error("Studio supervisor cannot update unverified managed state");
  }
  await atomicWriteJson(statePath, {
    ...value,
    pid: process.pid,
    sourceHash,
    managerSourceHash,
    supervisor: supervisorStatus(),
  });
}

function failSupervisor(error: unknown): void {
  if (stopping) return;
  stopping = true;
  phase = "stopping";
  if (reconcileTimer) clearTimeout(reconcileTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  watchAbort.abort();
  logLifecycle("supervisor-failed", {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    childPid: child?.pid ?? null,
  });
  const active = child;
  if (!active) {
    process.exit(1);
    return;
  }
  active.kill("SIGTERM");
  void active.exited.finally(() => process.exit(1));
}

function spawnServer(reason: "initial-start" | "source-adoption"): ServerChild {
  generation += 1;
  const next = Bun.spawn([process.execPath, serverEntry, ...serverArgs], {
    cwd: repository,
    env: {
      ...process.env,
      INM_STUDIO_MANAGER_PID: String(process.pid),
      INM_STUDIO_MANAGER_SOURCE_HASH: managerSourceHash,
      INM_STUDIO_STATE_PATH: statePath,
    },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  logLifecycle("server-started", {
    childPid: next.pid,
    reason,
    attemptedSourceHash,
  });
  return next;
}

function monitorCurrentChild(next: ServerChild): void {
  void next.exited.then((exitCode) => {
    if (next !== child || stopping) return;
    logLifecycle("server-exited", { childPid: next.pid, exitCode, reason: "unexpected-exit" });
    failSupervisor(new Error(`Current Studio server exited unexpectedly with code ${exitCode}`));
  });
}

async function waitForChildReady(next: ServerChild, expectedHash: string): Promise<void> {
  let exitCode: number | null = null;
  void next.exited.then((value) => { exitCode = value; });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (exitCode !== null) throw new Error(`Studio server exited with code ${exitCode} before becoming healthy`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
        headers: { accept: "application/json" },
      });
      if (response.ok) {
        const health = await response.json() as {
          pid?: unknown;
          managerPid?: unknown;
          sourceHash?: unknown;
        };
        if (health.pid === next.pid
          && health.managerPid === process.pid
          && health.sourceHash === expectedHash) return;
      }
    } catch {
      // The replacement owns no authority until its exact health identity is ready.
    }
    await Bun.sleep(50);
  }
  throw new Error("Studio server did not become healthy within 15 seconds");
}

function formatBuildMessages(entries: readonly unknown[]): string[] {
  return entries.map((entry) => {
    const detail = entry as {
      message?: unknown;
      position?: { file?: unknown; line?: unknown; column?: unknown; lineText?: unknown } | null;
    };
    const message = typeof detail.message === "string" ? detail.message : String(entry);
    const location = detail.position
      && typeof detail.position.file === "string"
      && typeof detail.position.line === "number"
      ? `${detail.position.file}:${detail.position.line}${typeof detail.position.column === "number" ? `:${detail.position.column}` : ""}`
      : null;
    const lineText = detail.position && typeof detail.position.lineText === "string"
      ? detail.position.lineText.trim()
      : "";
    return `${location ? `${location} · ` : ""}${message}${lineText ? ` · ${lineText}` : ""}`;
  }).filter(Boolean);
}

async function preflightBuild(entrypoint: string, target: "bun" | "browser") {
  try {
    return await Bun.build({
      entrypoints: [entrypoint],
      target,
      format: "esm",
      sourcemap: "none",
    });
  } catch (error) {
    const messages = error instanceof AggregateError
      ? formatBuildMessages(error.errors)
      : [];
    throw new Error(messages.join(" | ") || boundedError(error));
  }
}

async function preflightSource(nextSourceHash: string): Promise<void> {
  if (process.env.INM_STUDIO_TEST_PREFLIGHT_FAILURE_HASH === nextSourceHash) {
    throw new Error(`Injected Studio source preflight failure for ${nextSourceHash.slice(0, 12)}`);
  }
  if (process.env.INM_STUDIO_TEST_PREFLIGHT_DELAY_HASH === nextSourceHash) {
    const delayMs = Number(process.env.INM_STUDIO_TEST_PREFLIGHT_DELAY_MS ?? 250);
    if (Number.isFinite(delayMs) && delayMs > 0) await Bun.sleep(delayMs);
  }
  const [serverBuild, clientBuild] = await Promise.all([
    preflightBuild(serverEntry, "bun"),
    preflightBuild(clientEntry, "browser"),
  ]);
  const failed = [serverBuild, clientBuild].filter((result) => !result.success);
  if (!failed.length) return;
  const messages = failed.flatMap((result) => formatBuildMessages(result.logs));
  throw new Error(messages.join(" | ") || "Studio source preflight failed");
}

async function recordAdoptionFailure(
  failedSourceHash: string,
  failedPhase: FailurePhase,
  error: unknown,
): Promise<void> {
  attemptedSourceHash = failedSourceHash;
  lastFailedHash = failedSourceHash;
  phase = "degraded";
  retryState = "source-change";
  failure = {
    at: new Date().toISOString(),
    phase: failedPhase,
    message: boundedError(error),
  };
  await updateManagedState();
  logLifecycle("source-adoption-failed", {
    attemptedSourceHash: failedSourceHash,
    failurePhase: failedPhase,
    error: failure.message,
    childPid: child?.pid ?? null,
    servingSourceHash: child ? sourceHash : null,
    retry: retryState,
  });
}

async function markCurrent(next: ServerChild, nextSourceHash: string, reason: "initial-start" | "source-adoption"): Promise<void> {
  child = next;
  sourceHash = nextSourceHash;
  attemptedSourceHash = nextSourceHash;
  lastFailedHash = null;
  phase = "current";
  retryState = "none";
  failure = null;
  await updateManagedState();
  logLifecycle(reason === "initial-start" ? "initial-start-ready" : "source-adoption-ready", {
    childPid: next.pid,
    adoptedSourceHash: nextSourceHash,
  });
  monitorCurrentChild(next);
}

async function startInitialServer(): Promise<void> {
  restarting = true;
  try {
    attemptedSourceHash = sourceHash;
    phase = "starting";
    retryState = "none";
    failure = null;
    await updateManagedState();
    try {
      await preflightSource(sourceHash);
    } catch (error) {
      if (!stopping) await recordAdoptionFailure(sourceHash, "preflight", error);
      return;
    }
    if (stopping) return;
    const next = spawnServer("initial-start");
    child = next;
    try {
      await waitForChildReady(next, sourceHash);
      if (!stopping) await markCurrent(next, sourceHash, "initial-start");
    } catch (error) {
      if (child === next) child = null;
      next.kill("SIGTERM");
      await next.exited.catch(() => undefined);
      if (!stopping) await recordAdoptionFailure(sourceHash, "startup", error);
    }
  } finally {
    restarting = false;
    if (reconcilePending) {
      reconcilePending = false;
      scheduleReconcile();
    }
  }
}

async function restartServer(nextSourceHash: string, trigger: Exclude<RetryState, "source-change">): Promise<void> {
  restarting = true;
  try {
    attemptedSourceHash = nextSourceHash;
    phase = "adopting";
    retryState = trigger;
    failure = null;
    await updateManagedState();
    logLifecycle("source-adoption-started", {
      childPid: child?.pid ?? null,
      previousSourceHash: child ? sourceHash : null,
      nextSourceHash,
      retry: retryState,
    });

    try {
      await preflightSource(nextSourceHash);
    } catch (error) {
      if (!stopping) await recordAdoptionFailure(nextSourceHash, "preflight", error);
      return;
    }
    if (stopping) return;
    const latestSourceHash = await studioSourceHash();
    if (latestSourceHash !== nextSourceHash) {
      reconcilePending = true;
      logLifecycle("source-adoption-superseded", {
        childPid: child?.pid ?? null,
        preparedSourceHash: nextSourceHash,
        latestSourceHash,
      });
      return;
    }

    const previous = child;
    if (previous) {
      if (child === previous) child = null;
      previous.kill("SIGTERM");
      await previous.exited;
    }
    if (stopping) return;

    const next = spawnServer("source-adoption");
    child = next;
    try {
      await waitForChildReady(next, nextSourceHash);
      if (!stopping) await markCurrent(next, nextSourceHash, "source-adoption");
    } catch (error) {
      if (child === next) child = null;
      next.kill("SIGTERM");
      await next.exited.catch(() => undefined);
      if (!stopping) await recordAdoptionFailure(nextSourceHash, "startup", error);
    }
  } finally {
    restarting = false;
    if (reconcilePending) {
      reconcilePending = false;
      scheduleReconcile();
    }
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

  const force = explicitRetryRequested;
  explicitRetryRequested = false;
  if (nextSourceHash === sourceHash && child) {
    if (phase === "degraded") {
      attemptedSourceHash = sourceHash;
      lastFailedHash = null;
      phase = "current";
      retryState = "none";
      failure = null;
      await updateManagedState();
      logLifecycle("source-adoption-reverted", { childPid: child.pid, sourceHash });
    }
    return;
  }
  if (!force && nextSourceHash === lastFailedHash) return;
  await restartServer(nextSourceHash, force ? "explicit" : "none");
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
  phase = "stopping";
  retryState = "none";
  if (reconcileTimer) clearTimeout(reconcileTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  watchAbort.abort();
  await updateManagedState().catch(() => undefined);
  logLifecycle("supervisor-stopping", { childPid: child?.pid ?? null, reason: "requested-stop" });
  if (child) {
    child.kill("SIGTERM");
    await child.exited;
  }
}

process.once("SIGTERM", () => { void shutdown().then(() => process.exit(0)); });
process.once("SIGINT", () => { void shutdown().then(() => process.exit(0)); });
process.on("SIGUSR1", () => {
  if (stopping) return;
  explicitRetryRequested = true;
  retryState = "explicit";
  logLifecycle("source-retry-requested", {
    attemptedSourceHash,
    lastFailedHash,
  });
  void updateManagedState().catch(failSupervisor);
  scheduleReconcile();
});

logLifecycle("supervisor-started");
heartbeatTimer = setInterval(() => { void updateManagedState().catch(failSupervisor); }, 1_000);
for (const path of studioSourceWatchPaths()) void watchSource(path).catch(failSupervisor);
void startInitialServer().catch(failSupervisor);
