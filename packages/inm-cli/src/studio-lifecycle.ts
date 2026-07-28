import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { manifestSchema, readJson, resolveProjectDirectory, stableStringify, studioSourceHash } from "@inm/core";
import { CliCommandError, cliSuccess, manifestProjectContext } from "./contract";

const STUDIO_PROTOCOL = "inm-studio";
const STUDIO_PROTOCOL_VERSION = 2;
const START_TIMEOUT_MS = 15_000;
const repository = resolve(import.meta.dir, "../../..");
const serverEntry = join(repository, "packages/inm-studio/src/server.ts");

export type StudioLifecycleAction = "start" | "status" | "restart" | "stop" | "serve";

export interface StudioLifecycleOptions {
  port: number;
  project?: string;
  noOpen?: boolean;
  json?: boolean;
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
  url: string;
  pid: number | null;
  logPath: string;
  source: {
    state: "current" | "stale" | "not-running";
    expectedHash: string;
    runningHash: string | null;
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
    if (state.version !== 2 || state.inputDir !== inputDir || state.port !== port
      || (state.backend !== "launchd" && state.backend !== "detached")
      || typeof state.label !== "string" || typeof state.logPath !== "string"
      || !/^[0-9a-f]{64}$/.test(state.sourceHash ?? "")) return null;
    return state as StudioState;
  } catch {
    return null;
  }
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

async function startManaged(inputDir: string, options: StudioLifecycleOptions): Promise<StudioLifecycleResult> {
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
  options: StudioLifecycleOptions,
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

async function currentStatus(inputDir: string, options: StudioLifecycleOptions): Promise<StudioLifecycleResult> {
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

async function stopManaged(inputDir: string, options: StudioLifecycleOptions): Promise<StudioLifecycleResult> {
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
  if (!localState) {
    if (probe.kind === "studio") throw new CliCommandError(
      "studio.unmanaged-instance",
      `Port ${options.port} serves this project but has no matching managed state; stop its owning foreground process explicitly.`,
    );
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
    `Port: ${lifecycle.port}`,
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
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) throw new Error("Usage: --port must be an integer from 1 to 65535");
  const inputDir = resolve(input);
  const projectDir = await resolveProjectDirectory(inputDir, options.project);
  const manifest = manifestSchema.parse(await readJson(join(projectDir, "inm.json")));
  const context = manifestProjectContext(projectDir, manifest);

  if (action === "serve") {
    if (options.json) throw new Error("Usage: inm studio serve <path> does not support --json");
    const child = spawn(process.execPath, [
      serverEntry,
      inputDir,
      "--port",
      String(options.port),
      ...(options.project ? ["--project", options.project] : []),
      ...(options.noOpen ? ["--no-open"] : []),
    ], { cwd: repository, stdio: "inherit" });
    await new Promise<void>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolveExit() : reject(new Error(`Studio exited with code ${code}`)));
    });
    return;
  }

  if (action === "status") {
    emit(await currentStatus(inputDir, options), context, Boolean(options.json));
    return;
  }
  if (action === "stop") {
    emit(await stopManaged(inputDir, options), context, Boolean(options.json));
    return;
  }
  if (action === "restart") await stopManaged(inputDir, options);
  const started = await startManaged(inputDir, options);
  const lifecycle = action === "restart" ? { ...started, action } : started;
  if (!options.noOpen) openBrowser(lifecycle.url);
  emit(lifecycle, context, Boolean(options.json));
}
