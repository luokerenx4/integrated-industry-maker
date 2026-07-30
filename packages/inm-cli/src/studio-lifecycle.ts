import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  manifestSchema,
  readJson,
  resolveProjectDirectory,
  stableStringify,
  studioSourceHash,
  type ProjectWorkbenchSnapshot,
  type IndustrialInvestigationHandoff,
  type InvestigationAnchorState,
  type WorkbenchNextAction,
} from "@inm/core";
import type { OperationExecutionSnapshot, OperationExecutionStartResponse } from "@inm/core/operation-execution";
import { CliCommandError, cliSuccess, manifestProjectContext } from "./contract";

const STUDIO_PROTOCOL = "inm-studio";
const STUDIO_PROTOCOL_VERSION = 5;
const configuredDefaultPort = Number(process.env.INM_STUDIO_DEFAULT_PORT ?? 4176);
const DEFAULT_STUDIO_PORT = Number.isSafeInteger(configuredDefaultPort) && configuredDefaultPort > 0 && configuredDefaultPort <= 65_535
  ? configuredDefaultPort
  : 4176;
const FALLBACK_STUDIO_PORTS = 24;
const START_TIMEOUT_MS = 15_000;
const SESSION_RECOVERY_TIMEOUT_MS = 5_000;
const SESSION_RECOVERY_POLL_MS = 100;
const repository = resolve(import.meta.dir, "../../..");
const serverEntry = join(repository, "packages/inm-studio/src/server.ts");
const supervisorEntry = join(repository, "packages/inm-studio/src/supervisor.ts");

export type StudioLifecycleAction = "start" | "status" | "restart" | "stop" | "serve";

export interface StudioLifecycleOptions {
  port?: number;
  project?: string;
  noOpen?: boolean;
  json?: boolean;
}

export interface ProjectSessionOptions extends StudioLifecycleOptions {
  experiment?: string;
  investigation?: string;
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
  managerPid: number | null;
  inputDir: string;
  project: string | null;
  sourceHash: string;
  managerSourceHash: string;
  supervisor: StudioSupervisorStatus;
  startedAt: string;
  url: string;
}

export type StudioSupervisorPhase = "starting" | "current" | "adopting" | "degraded" | "stopping";

export interface StudioSupervisorStatus {
  phase: StudioSupervisorPhase;
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
}

interface StudioState {
  version: 5;
  backend: "launchd" | "detached";
  inputDir: string;
  project: string | null;
  port: number;
  label: string;
  logPath: string;
  plistPath: string | null;
  pid: number | null;
  sourceHash: string;
  managerSourceHash: string;
  supervisor: StudioSupervisorStatus;
  startedAt: string;
}

export interface StudioLifecycleResult {
  action: StudioLifecycleAction;
  state: "running" | "reused" | "degraded" | "recovering" | "stopped" | "not-running";
  health: StudioHealth | null;
  inputDir: string;
  project: string | null;
  port: number;
  portSelection: StudioPortSelection;
  url: string;
  pid: number | null;
  logPath: string;
  supervisor: StudioSupervisorStatus | null;
  source: {
    state: "current" | "stale" | "degraded" | "recovering" | "not-running";
    expectedHash: string;
    runningHash: string | null;
    managerRunningHash: string | null;
    serverState: "current" | "stale" | "not-running";
    managerState: "current" | "stale" | "not-running";
  };
}

export type ProjectSessionTarget =
  | {
    kind: "project-next-action";
    nextAction: WorkbenchNextAction;
  }
  | {
    kind: "experiment";
    experiment: {
      id: string;
      name: string;
      locked: boolean;
      cases: number;
    };
  }
  | {
    kind: "investigation";
    investigation: {
      id: string;
      name: string;
      question: string;
      state: InvestigationAnchorState;
      manifestHash: string;
      entryCount: number;
    };
    handoff: IndustrialInvestigationHandoff;
  };

export interface ProjectSessionResult {
  lifecycle: StudioLifecycleResult;
  target: ProjectSessionTarget;
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
    supervisorEntry,
    state.inputDir,
    "--port",
    String(state.port),
    "--state-path",
    statePath(state.inputDir, state.port),
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

function isSupervisorStatus(value: unknown): value is StudioSupervisorStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Partial<StudioSupervisorStatus>;
  if (!["starting", "current", "adopting", "degraded", "stopping"].includes(status.phase ?? "")
    || !/^[0-9a-f]{64}$/.test(status.attemptedSourceHash ?? "")
    || (status.childPid !== null && (!Number.isSafeInteger(status.childPid) || status.childPid! <= 0))
    || !Number.isSafeInteger(status.generation) || status.generation! < 0
    || typeof status.heartbeatAt !== "string" || !Number.isFinite(Date.parse(status.heartbeatAt))
    || !["none", "source-change", "explicit"].includes(status.retry ?? "")) return false;
  if (status.failure === null) return true;
  return typeof status.failure === "object"
    && status.failure !== null
    && typeof status.failure.at === "string"
    && Number.isFinite(Date.parse(status.failure.at))
    && ["preflight", "startup"].includes(status.failure.phase)
    && typeof status.failure.message === "string"
    && status.failure.message.length > 0;
}

async function readState(inputDir: string, port: number): Promise<StudioState | null> {
  try {
    const state = JSON.parse(await readFile(statePath(inputDir, port), "utf8")) as Partial<StudioState>;
    const expectedRuntimeDirectory = runtimeDirectory(inputDir, port);
    if (state.version !== 5 || state.inputDir !== inputDir || state.port !== port
      || (state.backend !== "launchd" && state.backend !== "detached")
      || state.label !== serviceLabel(inputDir, port)
      || state.logPath !== join(expectedRuntimeDirectory, "studio.log")
      || state.plistPath !== (state.backend === "launchd" ? join(expectedRuntimeDirectory, "service.plist") : null)
      || (state.project !== null && typeof state.project !== "string")
      || (state.pid !== null && (!Number.isSafeInteger(state.pid) || state.pid! <= 0))
      || typeof state.startedAt !== "string"
      || !/^[0-9a-f]{64}$/.test(state.sourceHash ?? "")
      || !/^[0-9a-f]{64}$/.test(state.managerSourceHash ?? "")
      || !isSupervisorStatus(state.supervisor)) return null;
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

async function rotateStudioLog(logPath: string): Promise<void> {
  const previousPath = join(dirname(logPath), "studio.previous.log");
  await rm(previousPath, { force: true });
  try {
    await rename(logPath, previousPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
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
      || (value.managerPid !== null && (typeof value.managerPid !== "number" || !Number.isSafeInteger(value.managerPid) || value.managerPid <= 0))
      || typeof value.startedAt !== "string" || typeof value.url !== "string"
      || !/^[0-9a-f]{64}$/.test(value.sourceHash ?? "")
      || !/^[0-9a-f]{64}$/.test(value.managerSourceHash ?? "")
      || !isSupervisorStatus(value.supervisor)) return { kind: "foreign" };
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
    && health.managerPid !== null
    && state.pid === health.managerPid
    && state.sourceHash === health.sourceHash
    && state.managerSourceHash === health.managerSourceHash;
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

  const managerOnlyInstances = states.filter((state) => {
    const observed = probes.get(state.port);
    return observed?.kind === "free"
      && managerStateIsLive(state);
  });
  const targetCount = targetInstances.length + managerOnlyInstances.length;
  if (targetCount > 1) throw new CliCommandError(
    "studio.multiple-target-instances",
    `Multiple Studio managers own this target on ports ${[
      ...targetInstances.map((instance) => instance.port),
      ...managerOnlyInstances.map((state) => state.port),
    ].sort((left, right) => left - right).join(", ")}. Stop them with explicit --port before using portless lifecycle commands.`,
  );
  if (targetInstances.length === 1) {
    const instance = targetInstances[0]!;
    return {
      port: instance.port,
      portSelection: instance.recorded ? "managed" : "default",
      targetFound: true,
    };
  }
  if (managerOnlyInstances.length === 1) return {
    port: managerOnlyInstances[0]!.port,
    portSelection: "managed",
    targetFound: true,
  };

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

interface ManagedStudioOutcome {
  health: StudioHealth | null;
  state: StudioState;
}

async function waitForManagedOutcome(
  inputDir: string,
  project: string | null,
  port: number,
  sourceHash: string,
  previousFailureAt: string | null = null,
): Promise<ManagedStudioOutcome> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = await probeHealth(port);
    if (probe.kind === "studio") {
      if (probe.health.inputDir !== inputDir || probe.health.project !== project) throw new CliCommandError(
        "studio.port-owned-by-other-project",
        `Port ${port} started an INM Studio for '${probe.health.inputDir}'${probe.health.project ? ` project '${probe.health.project}'` : ""}, not the requested target.`,
      );
      const state = await readState(inputDir, port);
      if (!state) throw new CliCommandError(
        "studio.manager-transition-unverified",
        `Studio on port ${port} became healthy without valid managed lifecycle state.`,
      );
      if (state.supervisor.phase === "degraded"
        && state.supervisor.failure
        && state.supervisor.failure.at !== previousFailureAt) return { health: probe.health, state };
      if (probe.health.sourceHash === sourceHash
        && state.supervisor.phase === "current"
        && probe.health.supervisor.phase === "current") return { health: probe.health, state };
    }
    if (probe.kind === "foreign") throw new CliCommandError(
      "studio.port-owned-by-unknown-service",
      `Port ${port} is occupied by a service that does not identify as this INM Studio.`,
    );
    const state = await readState(inputDir, port);
    if (state && managerStateIsLive(state)
      && state.supervisor.phase === "degraded"
      && state.supervisor.failure
      && state.supervisor.failure.at !== previousFailureAt) {
      return { health: null, state };
    }
    await Bun.sleep(100);
  }
  throw new CliCommandError("studio.start-timeout", `Studio did not become healthy or report a bounded startup failure on port ${port} within ${START_TIMEOUT_MS / 1000}s.`);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function managerStateIsLive(state: StudioState): boolean {
  if (state.pid === null || state.supervisor.phase === "stopping" || !processIsAlive(state.pid)) return false;
  const heartbeat = Date.parse(state.supervisor.heartbeatAt);
  return Number.isFinite(heartbeat) && Date.now() - heartbeat >= 0 && Date.now() - heartbeat <= 5_000;
}

async function retryManagedSupervisor(
  inputDir: string,
  project: string | null,
  port: number,
  state: StudioState,
  sourceHash: string,
): Promise<ManagedStudioOutcome> {
  if (!managerStateIsLive(state) || state.pid === null) throw new CliCommandError(
    "studio.manager-not-running",
    `Studio supervisor for port ${port} is not running.`,
  );
  const previousFailureAt = state.supervisor.failure?.at ?? null;
  try {
    process.kill(state.pid, "SIGUSR1");
  } catch (error) {
    throw new CliCommandError(
      "studio.manager-retry-failed",
      `Could not request a Studio source retry from supervisor ${state.pid}: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true },
    );
  }
  return waitForManagedOutcome(inputDir, project, port, sourceHash, previousFailureAt);
}

async function runProcess(command: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
  const child = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  return { exitCode, stderr: stderr.trim() };
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await Bun.sleep(50);
  }
  throw new CliCommandError("studio.stop-timeout", `Studio supervisor ${pid} did not exit within 5s.`);
}

async function unload(state: StudioState, health: StudioHealth | null): Promise<void> {
  const ownsManager = health ? stateVerifiesHealth(state, health) : managerStateIsLive(state);
  if (ownsManager && state.backend === "launchd") {
    const domain = `gui/${process.getuid?.()}`;
    const unloaded = await runProcess("launchctl", ["bootout", `${domain}/${state.label}`]);
    if (unloaded.exitCode !== 0) throw new CliCommandError(
      "studio.manager-failed",
      `Could not stop Studio through launchd: ${unloaded.stderr || `exit ${unloaded.exitCode}`}`,
    );
  } else if (ownsManager && state.pid !== null) {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  if (ownsManager && state.pid !== null) await waitForProcessExit(state.pid);
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
  const localState = await readState(inputDir, options.port);
  if (existing.kind === "studio") {
    if (existing.health.inputDir !== inputDir || existing.health.project !== (options.project ?? null)) throw new CliCommandError(
      "studio.port-owned-by-other-project",
      `Port ${options.port} already serves '${existing.health.inputDir}'${existing.health.project ? ` project '${existing.health.project}'` : ""}.`,
    );
    if (existing.health.sourceHash === sourceHash && existing.health.managerSourceHash === sourceHash) {
      return result("start", "reused", inputDir, options, existing.health, sourceHash, logPath, localState);
    }
    if (!localState || !stateVerifiesHealth(localState, existing.health)) throw new CliCommandError(
      "studio.stale-unmanaged-instance",
      `Port ${options.port} serves stale server/manager source ${existing.health.sourceHash.slice(0, 12)}/${existing.health.managerSourceHash.slice(0, 12)}, but matching managed ownership could not be verified. Stop its owning foreground process explicitly.`,
    );
    if (localState.supervisor.phase === "degraded") {
      const outcome = await retryManagedSupervisor(
        inputDir,
        options.project ?? null,
        options.port,
        localState,
        sourceHash,
      );
      return result("start", "reused", inputDir, options, outcome.health, sourceHash, logPath, outcome.state);
    }
    await unload(localState, existing.health);
    await waitForFreePort(options.port);
  }
  if (existing.kind === "foreign") throw new CliCommandError(
    "studio.port-owned-by-unknown-service",
    `Port ${options.port} is occupied by an unknown service. Choose another port or stop that service explicitly.`,
  );
  if (existing.kind === "free" && localState?.pid !== null && localState?.pid !== undefined
    && managerStateIsLive(localState)) {
    const outcome = localState.supervisor.phase === "degraded"
      ? await retryManagedSupervisor(inputDir, options.project ?? null, options.port, localState, sourceHash)
      : await waitForManagedOutcome(inputDir, options.project ?? null, options.port, sourceHash);
    return result("start", "reused", inputDir, options, outcome.health, sourceHash, logPath, outcome.state);
  }

  const runtimeDir = runtimeDirectory(inputDir, options.port);
  await mkdir(runtimeDir, { recursive: true });
  await rotateStudioLog(logPath);
  const useLaunchd = platform() === "darwin" && process.env.INM_STUDIO_BACKEND !== "detached";
  const state: StudioState = {
    version: 5,
    backend: useLaunchd ? "launchd" : "detached",
    inputDir,
    project: options.project ?? null,
    port: options.port,
    label: serviceLabel(inputDir, options.port),
    logPath,
    plistPath: useLaunchd ? join(runtimeDir, "service.plist") : null,
    pid: null,
    sourceHash,
    managerSourceHash: sourceHash,
    supervisor: {
      phase: "starting",
      attemptedSourceHash: sourceHash,
      childPid: null,
      generation: 0,
      heartbeatAt: new Date().toISOString(),
      retry: "none",
      failure: null,
    },
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
          supervisorEntry,
          inputDir,
          "--port",
          String(options.port),
          "--state-path",
          statePath(inputDir, options.port),
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
    const outcome = await waitForManagedOutcome(inputDir, options.project ?? null, options.port, sourceHash);
    if (outcome.health && outcome.health.managerPid === null) throw new CliCommandError(
      "studio.manager-missing",
      `Managed Studio on port ${options.port} did not report its supervisor identity.`,
    );
    return result("start", "running", inputDir, options, outcome.health, sourceHash, logPath, outcome.state);
  } catch (error) {
    await unload(await readState(inputDir, options.port) ?? state, null).catch(() => undefined);
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
  managedState: StudioState | null = null,
): StudioLifecycleResult {
  const supervisor = health?.supervisor ?? managedState?.supervisor ?? null;
  const lifecycleState = supervisor?.phase === "degraded"
    ? "degraded"
    : supervisor && (supervisor.phase === "starting" || supervisor.phase === "adopting")
      ? "recovering"
      : state;
  const runningHash = health?.sourceHash
    ?? (supervisor?.childPid ? managedState?.sourceHash ?? null : null);
  const managerRunningHash = health?.managerSourceHash
    ?? (managedState && managerStateIsLive(managedState)
      ? managedState.managerSourceHash
      : null);
  const sourceState = supervisor?.phase === "degraded"
    ? "degraded"
    : supervisor && (supervisor.phase === "starting" || supervisor.phase === "adopting")
      ? "recovering"
      : health
        ? (health.sourceHash === expectedSourceHash && health.managerSourceHash === expectedSourceHash ? "current" : "stale")
        : "not-running";
  return {
    action,
    state: lifecycleState,
    health,
    inputDir,
    project: options.project ?? null,
    port: options.port,
    portSelection: options.portSelection,
    url: health?.url ?? `http://127.0.0.1:${options.port}${options.project ? `/${encodeURIComponent(options.project)}` : ""}`,
    pid: health?.pid ?? null,
    logPath,
    supervisor,
    source: {
      state: sourceState,
      expectedHash: expectedSourceHash,
      runningHash,
      managerRunningHash,
      serverState: runningHash ? (runningHash === expectedSourceHash ? "current" : "stale") : "not-running",
      managerState: managerRunningHash ? (managerRunningHash === expectedSourceHash ? "current" : "stale") : "not-running",
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
    return result("status", "running", inputDir, options, probe.health, sourceHash, localState?.logPath, localState);
  }
  return result(
    "status",
    "not-running",
    inputDir,
    options,
    null,
    sourceHash,
    localState?.logPath,
    localState && managerStateIsLive(localState) ? localState : null,
  );
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

export async function waitForVerifiedSessionRecovery(
  lifecycle: StudioLifecycleResult,
  inspect: () => Promise<StudioLifecycleResult>,
  timing: { timeoutMs?: number; pollMs?: number } = {},
): Promise<StudioLifecycleResult> {
  if (lifecycle.state !== "recovering") return lifecycle;
  const expectedHash = lifecycle.source.expectedHash;
  const verifiedRecovery = (current: StudioLifecycleResult): boolean =>
    current.inputDir === lifecycle.inputDir
    && current.project === lifecycle.project
    && current.port === lifecycle.port
    && current.source.expectedHash === expectedHash
    && current.supervisor?.attemptedSourceHash === expectedHash
    && current.supervisor.failure === null;
  if (!verifiedRecovery(lifecycle)) throw new CliCommandError(
    "session.studio-recovery-unverified",
    `Studio recovery on port ${lifecycle.port} is not verified for this exact target and source ${expectedHash.slice(0, 12)}.`,
    { retryable: true },
  );
  const timeoutMs = timing.timeoutMs ?? SESSION_RECOVERY_TIMEOUT_MS;
  const pollMs = timing.pollMs ?? SESSION_RECOVERY_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let latest = lifecycle;
  while (Date.now() < deadline) {
    await Bun.sleep(pollMs);
    latest = await inspect();
    if (latest.state === "degraded") return latest;
    if (!verifiedRecovery(latest)) throw new CliCommandError(
      "session.studio-recovery-unverified",
      `Studio recovery on port ${lifecycle.port} stopped matching this exact project or source ${expectedHash.slice(0, 12)}.`,
      { retryable: true },
    );
    if (latest.supervisor?.phase === "current" && latest.source.state === "current") {
      return { ...latest, action: lifecycle.action, state: "reused" };
    }
    if (latest.state !== "recovering") throw new CliCommandError(
      "session.studio-recovery-unverified",
      `Studio recovery on port ${lifecycle.port} exited recovery without source-current evidence.`,
      { retryable: true },
    );
  }
  throw new CliCommandError(
    "session.studio-recovery-timeout",
    `Studio did not converge to source ${expectedHash.slice(0, 12)} within ${timeoutMs}ms; last supervisor phase was ${latest.supervisor?.phase ?? "unknown"}.`,
    { retryable: true },
  );
}

export async function projectSessionCommand(
  input: string,
  options: ProjectSessionOptions,
): Promise<void> {
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535)) {
    throw new Error("Usage: --port must be an integer from 1 to 65535");
  }
  if (options.run && !options.experiment) {
    throw new Error("Usage: --run requires --experiment ID");
  }
  if (options.experiment && options.investigation) {
    throw new Error("Usage: --experiment and --investigation are mutually exclusive");
  }
  const inputDir = resolve(input);
  const projectDir = await resolveProjectDirectory(inputDir, options.project);
  const manifest = manifestSchema.parse(await readJson(join(projectDir, "inm.json")));
  const context = manifestProjectContext(projectDir, manifest);
  const selectedPort = await resolveLifecyclePort("start", inputDir, options);
  let lifecycle = await startManaged(inputDir, {
    ...options,
    port: selectedPort.port,
    portSelection: selectedPort.portSelection,
  });
  if (lifecycle.state === "recovering") {
    const resolvedOptions: ResolvedStudioLifecycleOptions = {
      ...options,
      port: selectedPort.port,
      portSelection: selectedPort.portSelection,
    };
    lifecycle = await waitForVerifiedSessionRecovery(
      lifecycle,
      () => currentStatus(inputDir, resolvedOptions),
    );
  }
  if (lifecycle.state === "degraded" || lifecycle.state === "recovering") {
    const failure = lifecycle.supervisor?.failure;
    throw new CliCommandError(
      "session.studio-degraded",
      `Studio session is ${lifecycle.state} while adopting ${lifecycle.supervisor?.attemptedSourceHash.slice(0, 12) ?? "unknown source"}${failure ? `: ${failure.phase} · ${failure.message}` : "."}`,
      { retryable: true, context },
    );
  }
  const baseUrl = `http://127.0.0.1:${lifecycle.port}`;
  const projectId = encodeURIComponent(manifest.id);
  let target: ProjectSessionTarget;
  let route: string;
  if (options.experiment) {
    const catalog = await responseJson<{
      experiments: Array<{ id: string; name: string; locked: boolean; cases: unknown[] }>;
    }>(`${baseUrl}/api/projects/${projectId}/experiments`);
    const selected = catalog.experiments.find((experiment) => experiment.id === options.experiment);
    if (!selected) throw new CliCommandError(
      "session.unknown-experiment",
      `Unknown Experiment '${options.experiment}' in project '${manifest.id}'. Available: ${catalog.experiments.map((experiment) => experiment.id).join(", ") || "none"}.`,
      { context },
    );
    target = {
      kind: "experiment",
      experiment: {
        id: selected.id,
        name: selected.name,
        locked: selected.locked,
        cases: selected.cases.length,
      },
    };
    route = `/${projectId}/experiments/${encodeURIComponent(selected.id)}`;
  } else if (options.investigation) {
    const inspection = await responseJson<{
      manifest: {
        id: string;
        name: string;
        question: string;
      };
      manifestHash: string;
      entries: unknown[];
      state: InvestigationAnchorState;
      handoff: IndustrialInvestigationHandoff;
    }>(`${baseUrl}/api/projects/${projectId}/investigations/${encodeURIComponent(options.investigation)}`);
    target = {
      kind: "investigation",
      investigation: {
        id: inspection.manifest.id,
        name: inspection.manifest.name,
        question: inspection.manifest.question,
        state: inspection.state,
        manifestHash: inspection.manifestHash,
        entryCount: inspection.entries.length,
      },
      handoff: inspection.handoff,
    };
    route = inspection.handoff.nextAction.studioRoute;
  } else {
    const snapshot = await responseJson<ProjectWorkbenchSnapshot>(
      `${baseUrl}/api/projects/${projectId}/overview`,
    );
    target = { kind: "project-next-action", nextAction: snapshot.nextAction };
    route = snapshot.nextAction.studioRoute;
  }
  const url = `${baseUrl}${route}`;
  const started = options.run
    ? await responseJson<OperationExecutionStartResponse>(
      `${baseUrl}/api/projects/${projectId}/experiments/${encodeURIComponent(options.experiment!)}/run`,
      { method: "POST" },
    )
    : null;
  const result: ProjectSessionResult = {
    lifecycle,
    target,
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
    const nextActions = target.kind === "project-next-action"
      ? [{
        id: target.nextAction.id,
        title: target.nextAction.title,
        reason: target.nextAction.reason,
        actionLabel: target.nextAction.actionLabel,
        argv: target.nextAction.argv,
        effect: target.nextAction.effect,
        requiresConfirmation: target.nextAction.requiresConfirmation,
        studioRoute: target.nextAction.studioRoute,
        target: target.nextAction.target,
      }]
      : target.kind === "investigation"
        ? [{
          id: target.handoff.nextAction.id,
          title: target.handoff.nextAction.title,
          reason: target.handoff.nextAction.reason,
          actionLabel: target.handoff.nextAction.actionLabel,
          argv: target.handoff.nextAction.argv,
          effect: target.handoff.nextAction.effect,
          requiresConfirmation: target.handoff.nextAction.requiresConfirmation,
          studioRoute: target.handoff.nextAction.studioRoute,
          target: target.handoff.nextAction.target,
        }]
      : options.run ? [{
        id: "open-experiment-session",
        description: "Open or reconnect to the exact Studio Experiment session.",
        argv: ["inm", "session", inputDir, ...(options.project ? ["--project", options.project] : []), "--experiment", target.experiment.id],
        effect: "read-only" as const,
        requiresConfirmation: false,
        studioRoute: route,
      }] : [{
        id: "run-experiment-session",
        description: "Start the locked Experiment as a reconnectable Studio operation.",
        argv: ["inm", "session", inputDir, ...(options.project ? ["--project", options.project] : []), "--experiment", target.experiment.id, "--run", "--json", "--no-open"],
        effect: "read-only" as const,
        requiresConfirmation: false,
        studioRoute: route,
      }];
    process.stdout.write(`${stableStringify(cliSuccess("session", result, {
      context,
      nextActions,
    }), 2)}\n`);
    return;
  }
  const targetLines = target.kind === "project-next-action"
    ? [
      `Target: PROJECT NEXT ACTION · ${target.nextAction.id}`,
      `Next action: ${target.nextAction.title}`,
      `Reason: ${target.nextAction.reason}`,
      `Action: ${target.nextAction.actionLabel} · ${target.nextAction.effect.toUpperCase()}${target.nextAction.requiresConfirmation ? " · CONFIRMATION REQUIRED" : ""}`,
      `CLI: ${target.nextAction.argv.map((part) => JSON.stringify(part)).join(" ")}`,
    ]
    : target.kind === "investigation"
      ? [
        `Target: INVESTIGATION · ${target.investigation.id}`,
        `Question: ${target.investigation.question}`,
        `Evidence: ${target.investigation.state.toUpperCase()} · ${target.investigation.entryCount} entr${target.investigation.entryCount === 1 ? "y" : "ies"}`,
        `Phase: ${target.handoff.phase.toUpperCase()}${target.handoff.sourceEntry ? ` · ${String(target.handoff.sourceEntry.sequence).padStart(4, "0")} ${target.handoff.sourceEntry.id}` : ""}`,
        `Next action: ${target.handoff.nextAction.title}`,
        `Reason: ${target.handoff.nextAction.reason}`,
      ]
    : [
      `Target: EXPERIMENT · ${target.experiment.id}`,
      `Experiment: ${target.experiment.name} · ${target.experiment.cases} ${target.experiment.cases === 1 ? "case" : "cases"} · ${target.experiment.locked ? "LOCKED" : "UNLOCKED"}`,
    ];
  process.stdout.write([
    target.kind === "experiment"
      ? "INM Experiment session ready"
      : target.kind === "investigation"
        ? "INM Investigation Design Session ready"
        : "INM project session ready",
    ...targetLines,
    `Studio: ${url}`,
    `Service: ${lifecycle.state.toUpperCase()} · port ${lifecycle.port} ${lifecycle.portSelection.toUpperCase()} · source ${lifecycle.source.state.toUpperCase()}`,
    ...(started ? [
      `Operation: ${started.operation.id} · ${started.operation.status.toUpperCase()}${started.reused ? " · RECONNECTED" : ""}`,
      `Poll: ${baseUrl}/api/projects/${projectId}/operations/${encodeURIComponent(started.operation.id)}`,
    ] : [
      ...(target.kind === "experiment"
        ? [`Run: inm session ${JSON.stringify(inputDir)}${options.project ? ` --project ${JSON.stringify(options.project)}` : ""} --experiment ${JSON.stringify(target.experiment.id)} --run`]
        : []),
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
      : lifecycle.state === "degraded"
        ? "INM Studio degraded"
        : lifecycle.state === "recovering"
          ? "INM Studio recovering"
      : lifecycle.state === "stopped"
        ? "INM Studio stopped"
        : "INM Studio is not running";
  process.stdout.write([
    label,
    `URL: ${lifecycle.url}`,
    `Port: ${lifecycle.port} · ${lifecycle.portSelection.toUpperCase()}`,
    `PID: ${lifecycle.pid ?? "—"}`,
    `Source: ${lifecycle.source.state.toUpperCase()} · server ${lifecycle.source.serverState.toUpperCase()} ${lifecycle.source.runningHash?.slice(0, 12) ?? "—"} · manager ${lifecycle.source.managerState.toUpperCase()} ${lifecycle.source.managerRunningHash?.slice(0, 12) ?? "—"} · expected ${lifecycle.source.expectedHash.slice(0, 12)}`,
    ...(lifecycle.supervisor ? [
      `Supervisor: ${lifecycle.supervisor.phase.toUpperCase()} · generation ${lifecycle.supervisor.generation} · attempted ${lifecycle.supervisor.attemptedSourceHash.slice(0, 12)} · retry ${lifecycle.supervisor.retry.toUpperCase()}`,
      ...(lifecycle.supervisor.failure
        ? [`Failure: ${lifecycle.supervisor.failure.phase.toUpperCase()} · ${lifecycle.supervisor.failure.message}`]
        : []),
    ] : []),
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
  if (!options.noOpen && lifecycle.state !== "degraded" && lifecycle.state !== "recovering") openBrowser(lifecycle.url);
  emit(lifecycle, context, Boolean(options.json));
}
