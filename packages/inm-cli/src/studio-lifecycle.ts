import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { manifestSchema, readJson, resolveProjectDirectory, stableStringify, studioSourceHash } from "@inm/core";
import type { OperationExecutionSnapshot, OperationExecutionStartResponse } from "@inm/core/operation-execution";
import { CliCommandError, cliSuccess, manifestProjectContext } from "./contract";

const STUDIO_PROTOCOL = "inm-studio";
const STUDIO_PROTOCOL_VERSION = 2;
const configuredDefaultPort = Number(process.env.INM_STUDIO_DEFAULT_PORT ?? 4176);
const DEFAULT_STUDIO_PORT = Number.isSafeInteger(configuredDefaultPort) && configuredDefaultPort > 0 && configuredDefaultPort <= 65_535
  ? configuredDefaultPort
  : 4176;
const FALLBACK_STUDIO_PORTS = 24;
const START_TIMEOUT_MS = 15_000;
const repository = resolve(import.meta.dir, "../../..");
const serverEntry = join(repository, "packages/inm-studio/src/server.ts");

export type StudioLifecycleAction = "start" | "status" | "restart" | "stop" | "serve";

export interface StudioLifecycleOptions {
  port?: number;
  project?: string;
  noOpen?: boolean;
  json?: boolean;
}

export interface ExperimentSessionOptions extends StudioLifecycleOptions {
  experiment: string;
  run?: boolean;
}

type StudioPortSelection = "explicit" | "managed" | "default" | "fallback";

interface ResolvedStudioLifecycleOptions extends StudioLifecycleOptions {
  port: number;
  portSelection: StudioPortSelection;
}

export interface StudioHealth {
  service: typeof STUDIO_PROTOCOL;
  protocolVersion: typeof STUDIO_PROTOCOL_VERSION;
  engineVersion: string;
  pid: number;
  inputDir: string;
  project: string | null;
  sourceHash: string;
  startedAt: string;
  url: string;
}

interface StudioState {
  version: 2;
  backend: "launchd" | "detached";
  inputDir: string;
  project: string | null;
  port: number;
  label: string;
  logPath: string;
  plistPath: string | null;
  pid: number | null;
  sourceHash: string;
  startedAt: string;
}

export interface StudioLifecycleResult {
  action: StudioLifecycleAction;
  state: "running" | "reused" | "stopped" | "not-running";
  health: StudioHealth | null;
  inputDir: string;
  project: string | null;
  port: number;
  portSelection: StudioPortSelection;
  url: string;
  pid: number | null;
  logPath: string;
  source: {
    state: "current" | "stale" | "not-running";
    expectedHash: string;
    runningHash: string | null;
  };
}

export interface ExperimentSessionResult {
  lifecycle: StudioLifecycleResult;
  experiment: {
    id: string;
    name: string;
    locked: boolean;
    cases: number;
  };
  route: string;
  url: string;
  operation: null | {
    reused: boolean;
    snapshot: OperationExecutionSnapshot;
    pollUrl: string;
  };
}

function runtimeDirectory(inputDir: string, port: number): string {
  return join(inputDir, ".inm", "studio", String(port));
}

function statePath(inputDir: string, port: number): string {
  return join(runtimeDirectory(inputDir, port), "state.json");
}

function serviceLabel(inputDir: string, port: number): string {
  const identity = createHash("sha256").update(`${inputDir}\0${port}`).digest("hex").slice(0, 16);
  return `com.inm.studio.${identity}.${port}`;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function plist(state: StudioState): string {
  const args = [
    process.execPath,
    serverEntry,
    state.inputDir,
    "--port",
    String(state.port),
    "--no-open",
    ...(state.project ? ["--project", state.project] : []),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(state.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((argument) => `    <string>${xml(argument)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xml(repository)}</string>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${xml(state.logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(state.logPath)}</string>
</dict>
</plist>
`;
}

async function readState(inputDir: string, port: number): Promise<StudioState | null> {
  try {
    const state = JSON.parse(await readFile(statePath(inputDir, port), "utf8")) as Partial<StudioState>;
    const expectedRuntimeDirectory = runtimeDirectory(inputDir, port);
    if (state.version !== 2 || state.inputDir !== inputDir || state.port !== port
      || (state.backend !== "launchd" && state.backend !== "detached")
      || state.label !== serviceLabel(inputDir, port)
      || state.logPath !== join(expectedRuntimeDirectory, "studio.log")
      || state.plistPath !== (state.backend === "launchd" ? join(expectedRuntimeDirectory, "service.plist") : null)
      || (state.project !== null && typeof state.project !== "string")
      || (state.pid !== null && (!Number.isSafeInteger(state.pid) || state.pid! <= 0))
      || typeof state.startedAt !== "string"
      || !/^[0-9a-f]{64}$/.test(state.sourceHash ?? "")) return null;
    return state as StudioState;
  } catch {
    return null;
  }
}

async function managedStates(inputDir: string, project: string | null): Promise<StudioState[]> {
  let entries;
  try {
    entries = await readdir(join(inputDir, ".inm", "studio"), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const states: StudioState[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !/^[1-9][0-9]{0,4}$/.test(entry.name)) continue;
    const port = Number(entry.name);
    if (port > 65_535) continue;
    const state = await readState(inputDir, port);
    if (state?.project === project) states.push(state);
  }
  return states.sort((left, right) => right.startedAt.localeCompare(left.startedAt) || left.port - right.port);
}

async function writeState(state: StudioState): Promise<void> {
  const target = statePath(state.inputDir, state.port);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${stableStringify(state, 2)}\n`);
}

async function probeHealth(port: number): Promise<{ kind: "free" } | { kind: "studio"; health: StudioHealth } | { kind: "foreign" }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { kind: "foreign" };
    const value = await response.json() as Partial<StudioHealth>;
    if (value.service !== STUDIO_PROTOCOL || value.protocolVersion !== STUDIO_PROTOCOL_VERSION
      || typeof value.pid !== "number" || typeof value.inputDir !== "string"
      || typeof value.startedAt !== "string" || typeof value.url !== "string"
      || !/^[0-9a-f]{64}$/.test(value.sourceHash ?? "")) return { kind: "foreign" };
    return { kind: "studio", health: value as StudioHealth };
  } catch (error) {
    const code = error instanceof Error && "cause" in error
      ? (error.cause as { code?: string } | undefined)?.code
      : undefined;
    if (code === "ECONNREFUSED" || code === "ECONNRESET") return { kind: "free" };
    try {
      const socket = await Bun.connect({
        hostname: "127.0.0.1",
        port,
        socket: { data() {}, open(socket) { socket.end(); }, error() {} },
      });
      socket.end();
      return { kind: "foreign" };
    } catch {
      return { kind: "free" };
    }
  }
}

interface StudioPortResolution {
  port: number;
  portSelection: StudioPortSelection;
  targetFound: boolean;
}

function healthMatchesTarget(health: StudioHealth, inputDir: string, project: string | null): boolean {
  return health.inputDir === inputDir && health.project === project;
}

function stateVerifiesHealth(state: StudioState, health: StudioHealth): boolean {
  return state.inputDir === health.inputDir
    && state.project === health.project
    && state.pid === health.pid
    && state.sourceHash === health.sourceHash;
}

async function resolveLifecyclePort(
  action: Exclude<StudioLifecycleAction, "serve">,
  inputDir: string,
  options: StudioLifecycleOptions,
): Promise<StudioPortResolution> {
  if (options.port !== undefined) return {
    port: options.port,
    portSelection: "explicit",
    targetFound: true,
  };

  const project = options.project ?? null;
  const states = await managedStates(inputDir, project);
  const probes = new Map<number, Awaited<ReturnType<typeof probeHealth>>>();
  const probe = async (port: number) => {
    const known = probes.get(port);
    if (known) return known;
    const observed = await probeHealth(port);
    probes.set(port, observed);
    return observed;
  };
  await Promise.all(states.map(async (state) => { await probe(state.port); }));
  const targetInstances = states.flatMap((state) => {
    const observed = probes.get(state.port);
    return observed?.kind === "studio" && healthMatchesTarget(observed.health, inputDir, project)
      ? [{ port: state.port, health: observed.health, recorded: true }]
      : [];
  });

  const defaultObserved = await probe(DEFAULT_STUDIO_PORT);
  if (defaultObserved.kind === "studio" && healthMatchesTarget(defaultObserved.health, inputDir, project)
    && !targetInstances.some((instance) => instance.health.pid === defaultObserved.health.pid)) {
    targetInstances.push({
      port: DEFAULT_STUDIO_PORT,
      health: defaultObserved.health,
      recorded: states.some((state) => state.port === DEFAULT_STUDIO_PORT),
    });
  }

  if (targetInstances.length > 1) throw new CliCommandError(
    "studio.multiple-target-instances",
    `Multiple Studio instances serve this target on ports ${targetInstances.map((instance) => instance.port).sort((left, right) => left - right).join(", ")}. Stop them with explicit --port before using portless lifecycle commands.`,
  );
  if (targetInstances.length === 1) {
    const instance = targetInstances[0]!;
    return {
      port: instance.port,
      portSelection: instance.recorded ? "managed" : "default",
      targetFound: true,
    };
  }

  if (action === "status" || action === "stop") return {
    port: states[0]?.port ?? DEFAULT_STUDIO_PORT,
    portSelection: states.length ? "managed" : "default",
    targetFound: false,
  };

  for (const state of states) if ((await probe(state.port)).kind === "free") return {
    port: state.port,
    portSelection: "managed",
    targetFound: false,
  };
  if (defaultObserved.kind === "free") return {
    port: DEFAULT_STUDIO_PORT,
    portSelection: "default",
    targetFound: false,
  };
  for (let port = DEFAULT_STUDIO_PORT + 1; port < DEFAULT_STUDIO_PORT + FALLBACK_STUDIO_PORTS; port++) {
    if ((await probe(port)).kind === "free") return {
      port,
      portSelection: "fallback",
      targetFound: false,
    };
  }
  throw new CliCommandError(
    "studio.no-available-port",
    `No free Studio port is available from ${DEFAULT_STUDIO_PORT} through ${DEFAULT_STUDIO_PORT + FALLBACK_STUDIO_PORTS - 1}. Pass an explicit --port or stop an existing service.`,
  );
}

async function waitForHealth(inputDir: string, project: string | null, port: number, sourceHash: string): Promise<StudioHealth> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = await probeHealth(port);
    if (probe.kind === "studio") {
      if (probe.health.inputDir !== inputDir || probe.health.project !== project) throw new CliCommandError(
        "studio.port-owned-by-other-project",
        `Port ${port} started an INM Studio for '${probe.health.inputDir}'${probe.health.project ? ` project '${probe.health.project}'` : ""}, not the requested target.`,
      );
      if (probe.health.sourceHash !== sourceHash) throw new CliCommandError(
        "studio.source-mismatch",
        `Studio on port ${port} started with source ${probe.health.sourceHash.slice(0, 12)}, expected ${sourceHash.slice(0, 12)}.`,
      );
      return probe.health;
    }
    if (probe.kind === "foreign") throw new CliCommandError(
      "studio.port-owned-by-unknown-service",
      `Port ${port} is occupied by a service that does not identify as this INM Studio.`,
    );
    await Bun.sleep(100);
  }
  throw new CliCommandError("studio.start-timeout", `Studio did not become healthy on port ${port} within ${START_TIMEOUT_MS / 1000}s.`);
}

async function runProcess(command: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
  const child = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  return { exitCode, stderr: stderr.trim() };
}

async function unload(state: StudioState, health: StudioHealth | null): Promise<void> {
  if (state.backend === "launchd") {
    const domain = `gui/${process.getuid?.()}`;
    const unloaded = await runProcess("launchctl", ["bootout", `${domain}/${state.label}`]);
    if (unloaded.exitCode !== 0 && health) throw new CliCommandError(
      "studio.manager-failed",
      `Could not stop Studio through launchd: ${unloaded.stderr || `exit ${unloaded.exitCode}`}`,
    );
  } else if (health && health.inputDir === state.inputDir && health.pid === state.pid) {
    try {
      process.kill(health.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  await rm(statePath(state.inputDir, state.port), { force: true });
}

async function waitForFreePort(port: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await probeHealth(port)).kind === "free") return;
    await Bun.sleep(50);
  }
  throw new CliCommandError("studio.stop-timeout", `Studio did not release port ${port} within 5s.`);
}

async function startManaged(inputDir: string, options: ResolvedStudioLifecycleOptions): Promise<StudioLifecycleResult> {
  const sourceHash = await studioSourceHash();
  const existing = await probeHealth(options.port);
  const logPath = join(runtimeDirectory(inputDir, options.port), "studio.log");
  if (existing.kind === "studio") {
    if (existing.health.inputDir !== inputDir || existing.health.project !== (options.project ?? null)) throw new CliCommandError(
      "studio.port-owned-by-other-project",
      `Port ${options.port} already serves '${existing.health.inputDir}'${existing.health.project ? ` project '${existing.health.project}'` : ""}.`,
    );
    if (existing.health.sourceHash === sourceHash) return result("start", "reused", inputDir, options, existing.health, sourceHash, logPath);
    const localState = await readState(inputDir, options.port);
    if (!localState || localState.pid !== existing.health.pid || localState.sourceHash !== existing.health.sourceHash) throw new CliCommandError(
      "studio.stale-unmanaged-instance",
      `Port ${options.port} serves stale source ${existing.health.sourceHash.slice(0, 12)}, but matching managed ownership could not be verified. Stop its owning foreground process explicitly.`,
    );
    await unload(localState, existing.health);
    await waitForFreePort(options.port);
  }
  if (existing.kind === "foreign") throw new CliCommandError(
    "studio.port-owned-by-unknown-service",
    `Port ${options.port} is occupied by an unknown service. Choose another port or stop that service explicitly.`,
  );

  const runtimeDir = runtimeDirectory(inputDir, options.port);
  await mkdir(runtimeDir, { recursive: true });
  const useLaunchd = platform() === "darwin" && process.env.INM_STUDIO_BACKEND !== "detached";
  const state: StudioState = {
    version: 2,
    backend: useLaunchd ? "launchd" : "detached",
    inputDir,
    project: options.project ?? null,
    port: options.port,
    label: serviceLabel(inputDir, options.port),
    logPath,
    plistPath: useLaunchd ? join(runtimeDir, "service.plist") : null,
    pid: null,
    sourceHash,
    startedAt: new Date().toISOString(),
  };
  await writeState(state);

  try {
    if (useLaunchd) {
      await writeFile(state.plistPath!, plist(state));
      await chmod(state.plistPath!, 0o600);
      const domain = `gui/${process.getuid?.()}`;
      await runProcess("launchctl", ["bootout", `${domain}/${state.label}`]);
      const loaded = await runProcess("launchctl", ["bootstrap", domain, state.plistPath!]);
      if (loaded.exitCode !== 0) throw new CliCommandError("studio.manager-failed", `Could not register Studio with launchd: ${loaded.stderr || `exit ${loaded.exitCode}`}`);
    } else {
      const logFd = openSync(logPath, "a");
      try {
        const child = spawn(process.execPath, [
          serverEntry,
          inputDir,
          "--port",
          String(options.port),
          "--no-open",
          ...(options.project ? ["--project", options.project] : []),
        ], {
          cwd: repository,
          detached: true,
          stdio: ["ignore", logFd, logFd],
        });
        child.unref();
        state.pid = child.pid ?? null;
        await writeState(state);
      } finally {
        closeSync(logFd);
      }
    }
    const health = await waitForHealth(inputDir, options.project ?? null, options.port, sourceHash);
    state.pid = health.pid;
    state.startedAt = health.startedAt;
    await writeState(state);
    return result("start", "running", inputDir, options, health, sourceHash, logPath);
  } catch (error) {
    await unload(state, null).catch(() => undefined);
    throw error;
  }
}

function result(
  action: StudioLifecycleAction,
  state: StudioLifecycleResult["state"],
  inputDir: string,
  options: ResolvedStudioLifecycleOptions,
  health: StudioHealth | null,
  expectedSourceHash: string,
  logPath = join(runtimeDirectory(inputDir, options.port), "studio.log"),
): StudioLifecycleResult {
  return {
    action,
    state,
    health,
    inputDir,
    project: options.project ?? null,
    port: options.port,
    portSelection: options.portSelection,
    url: health?.url ?? `http://127.0.0.1:${options.port}${options.project ? `/${encodeURIComponent(options.project)}` : ""}`,
    pid: health?.pid ?? null,
    logPath,
    source: {
      state: health ? (health.sourceHash === expectedSourceHash ? "current" : "stale") : "not-running",
      expectedHash: expectedSourceHash,
      runningHash: health?.sourceHash ?? null,
    },
  };
}

async function currentStatus(inputDir: string, options: ResolvedStudioLifecycleOptions): Promise<StudioLifecycleResult> {
  const sourceHash = await studioSourceHash();
  const probe = await probeHealth(options.port);
  const localState = await readState(inputDir, options.port);
  if (probe.kind === "foreign") throw new CliCommandError(
    "studio.port-owned-by-unknown-service",
    `Port ${options.port} is occupied by an unknown service.`,
  );
  if (probe.kind === "studio") {
    if (probe.health.inputDir !== inputDir || probe.health.project !== (options.project ?? null)) throw new CliCommandError(
      "studio.port-owned-by-other-project",
      `Port ${options.port} serves '${probe.health.inputDir}'${probe.health.project ? ` project '${probe.health.project}'` : ""}, not this target.`,
    );
    return result("status", "running", inputDir, options, probe.health, sourceHash, localState?.logPath);
  }
  return result("status", "not-running", inputDir, options, null, sourceHash, localState?.logPath);
}

async function stopManaged(inputDir: string, options: ResolvedStudioLifecycleOptions): Promise<StudioLifecycleResult> {
  const sourceHash = await studioSourceHash();
  const localState = await readState(inputDir, options.port);
  const probe = await probeHealth(options.port);
  if (probe.kind === "studio" && (probe.health.inputDir !== inputDir || probe.health.project !== (options.project ?? null))) throw new CliCommandError(
    "studio.port-owned-by-other-project",
    `Port ${options.port} serves another INM Studio and will not be stopped.`,
  );
  if (probe.kind === "foreign") throw new CliCommandError(
    "studio.port-owned-by-unknown-service",
    `Port ${options.port} is occupied by an unknown service and will not be stopped.`,
  );
  if (probe.kind === "studio" && (!localState || !stateVerifiesHealth(localState, probe.health))) throw new CliCommandError(
    "studio.unmanaged-instance",
    `Port ${options.port} serves this project but its PID and source hash are not verified by matching managed state; stop its owning foreground process explicitly.`,
  );
  if (!localState) {
    return result("stop", "not-running", inputDir, options, null, sourceHash);
  }
  await unload(localState, probe.kind === "studio" ? probe.health : null);
  await waitForFreePort(options.port);
  return result("stop", "stopped", inputDir, options, null, sourceHash, localState.logPath);
}

function openBrowser(url: string): void {
  const command = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function responseJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    throw new CliCommandError(
      "session.studio-unavailable",
      `Could not reach the source-current Studio session: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true },
    );
  }
  const value = await response.json().catch(() => null) as ({ code?: unknown; error?: unknown } & T) | null;
  if (!response.ok) throw new CliCommandError(
    typeof value?.code === "string" ? value.code : "session.request-failed",
    typeof value?.error === "string" ? value.error : `Studio session request failed with HTTP ${response.status}.`,
    { retryable: response.status >= 500 },
  );
  if (value === null) throw new CliCommandError("session.invalid-response", "Studio returned an empty session response.");
  return value;
}

export async function experimentSessionCommand(
  input: string,
  options: ExperimentSessionOptions,
): Promise<void> {
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535)) {
    throw new Error("Usage: --port must be an integer from 1 to 65535");
  }
  const inputDir = resolve(input);
  const projectDir = await resolveProjectDirectory(inputDir, options.project);
  const manifest = manifestSchema.parse(await readJson(join(projectDir, "inm.json")));
  const context = manifestProjectContext(projectDir, manifest);
  const selectedPort = await resolveLifecyclePort("start", inputDir, options);
  const lifecycle = await startManaged(inputDir, {
    ...options,
    port: selectedPort.port,
    portSelection: selectedPort.portSelection,
  });
  const baseUrl = `http://127.0.0.1:${lifecycle.port}`;
  const projectId = encodeURIComponent(manifest.id);
  const catalog = await responseJson<{
    experiments: Array<{ id: string; name: string; locked: boolean; cases: unknown[] }>;
  }>(`${baseUrl}/api/projects/${projectId}/experiments`);
  const selected = catalog.experiments.find((experiment) => experiment.id === options.experiment);
  if (!selected) throw new CliCommandError(
    "session.unknown-experiment",
    `Unknown Experiment '${options.experiment}' in project '${manifest.id}'. Available: ${catalog.experiments.map((experiment) => experiment.id).join(", ") || "none"}.`,
    { context },
  );
  const route = `/${projectId}/experiments/${encodeURIComponent(selected.id)}`;
  const url = `${baseUrl}${route}`;
  const started = options.run
    ? await responseJson<OperationExecutionStartResponse>(
      `${baseUrl}/api/projects/${projectId}/experiments/${encodeURIComponent(selected.id)}/run`,
      { method: "POST" },
    )
    : null;
  const result: ExperimentSessionResult = {
    lifecycle,
    experiment: {
      id: selected.id,
      name: selected.name,
      locked: selected.locked,
      cases: selected.cases.length,
    },
    route,
    url,
    operation: started ? {
      reused: started.reused,
      snapshot: started.operation,
      pollUrl: `${baseUrl}/api/projects/${projectId}/operations/${encodeURIComponent(started.operation.id)}`,
    } : null,
  };
  if (!options.noOpen) openBrowser(url);
  if (options.json) {
    process.stdout.write(`${stableStringify(cliSuccess("session", result, {
      context,
      nextActions: options.run ? [{
        id: "open-experiment-session",
        description: "Open or reconnect to the exact Studio Experiment session.",
        argv: ["inm", "session", inputDir, ...(options.project ? ["--project", options.project] : []), "--experiment", selected.id],
        effect: "read-only",
        requiresConfirmation: false,
        studioRoute: route,
      }] : [{
        id: "run-experiment-session",
        description: "Start the locked Experiment as a reconnectable Studio operation.",
        argv: ["inm", "session", inputDir, ...(options.project ? ["--project", options.project] : []), "--experiment", selected.id, "--run", "--json", "--no-open"],
        effect: "read-only",
        requiresConfirmation: false,
        studioRoute: route,
      }],
    }), 2)}\n`);
    return;
  }
  process.stdout.write([
    "INM Experiment session ready",
    `Experiment: ${selected.name} · ${selected.id} · ${selected.cases.length} ${selected.cases.length === 1 ? "case" : "cases"} · ${selected.locked ? "LOCKED" : "UNLOCKED"}`,
    `Studio: ${url}`,
    `Service: ${lifecycle.state.toUpperCase()} · port ${lifecycle.port} ${lifecycle.portSelection.toUpperCase()} · source ${lifecycle.source.state.toUpperCase()}`,
    ...(started ? [
      `Operation: ${started.operation.id} · ${started.operation.status.toUpperCase()}${started.reused ? " · RECONNECTED" : ""}`,
      `Poll: ${baseUrl}/api/projects/${projectId}/operations/${encodeURIComponent(started.operation.id)}`,
    ] : [
      `Run: inm session ${JSON.stringify(inputDir)}${options.project ? ` --project ${JSON.stringify(options.project)}` : ""} --experiment ${JSON.stringify(selected.id)} --run`,
    ]),
    "",
  ].join("\n"));
}

function emit(lifecycle: StudioLifecycleResult, context: ReturnType<typeof manifestProjectContext>, json: boolean): void {
  if (json) {
    process.stdout.write(`${stableStringify(cliSuccess(`studio.${lifecycle.action}`, lifecycle, { context }), 2)}\n`);
    return;
  }
  const label = lifecycle.state === "reused"
    ? "INM Studio already running"
    : lifecycle.state === "running"
      ? "INM Studio running"
      : lifecycle.state === "stopped"
        ? "INM Studio stopped"
        : "INM Studio is not running";
  process.stdout.write([
    label,
    `URL: ${lifecycle.url}`,
    `Port: ${lifecycle.port} · ${lifecycle.portSelection.toUpperCase()}`,
    `PID: ${lifecycle.pid ?? "—"}`,
    `Source: ${lifecycle.source.state.toUpperCase()} · ${lifecycle.source.runningHash?.slice(0, 12) ?? "—"} / expected ${lifecycle.source.expectedHash.slice(0, 12)}`,
    `Project root: ${lifecycle.inputDir}`,
    `Log: ${lifecycle.logPath}`,
    "",
  ].join("\n"));
}

export async function studioLifecycleCommand(
  action: StudioLifecycleAction,
  input: string,
  options: StudioLifecycleOptions,
): Promise<void> {
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535)) {
    throw new Error("Usage: --port must be an integer from 1 to 65535");
  }
  const inputDir = resolve(input);
  const projectDir = await resolveProjectDirectory(inputDir, options.project);
  const manifest = manifestSchema.parse(await readJson(join(projectDir, "inm.json")));
  const context = manifestProjectContext(projectDir, manifest);

  if (action === "serve") {
    if (options.json) throw new Error("Usage: inm studio serve <path> does not support --json");
    const port = options.port ?? DEFAULT_STUDIO_PORT;
    const child = spawn(process.execPath, [
      serverEntry,
      inputDir,
      "--port",
      String(port),
      ...(options.project ? ["--project", options.project] : []),
      ...(options.noOpen ? ["--no-open"] : []),
    ], { cwd: repository, stdio: "inherit" });
    await new Promise<void>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolveExit() : reject(new Error(`Studio exited with code ${code}`)));
    });
    return;
  }

  const port = await resolveLifecyclePort(action, inputDir, options);
  const resolvedOptions: ResolvedStudioLifecycleOptions = {
    ...options,
    port: port.port,
    portSelection: port.portSelection,
  };
  if (action === "status") {
    const lifecycle = port.targetFound
      ? await currentStatus(inputDir, resolvedOptions)
      : result("status", "not-running", inputDir, resolvedOptions, null, await studioSourceHash());
    emit(lifecycle, context, Boolean(options.json));
    return;
  }
  if (action === "stop") {
    const lifecycle = port.targetFound
      ? await stopManaged(inputDir, resolvedOptions)
      : result("stop", "not-running", inputDir, resolvedOptions, null, await studioSourceHash());
    emit(lifecycle, context, Boolean(options.json));
    return;
  }
  if (action === "restart" && port.targetFound) await stopManaged(inputDir, resolvedOptions);
  const started = await startManaged(inputDir, resolvedOptions);
  const lifecycle = action === "restart" ? { ...started, action } : started;
  if (!options.noOpen) openBrowser(lifecycle.url);
  emit(lifecycle, context, Boolean(options.json));
}
