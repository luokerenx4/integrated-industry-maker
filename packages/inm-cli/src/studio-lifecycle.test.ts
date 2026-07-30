import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { waitForVerifiedSessionRecovery, type StudioLifecycleResult } from "./studio-lifecycle";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");
const memoryFab = join(repository, "examples/memory-fab");

async function runCli(args: string[], environment: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), ...args], {
    cwd: repository,
    env: { ...process.env, INM_STUDIO_BACKEND: "detached", INM_STUDIO_IDLE_EXIT_MS: "10000", ...environment },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function temporaryProject(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `inm-studio-lifecycle-${name}-`));
  const project = join(root, name);
  await cp(ironworks, project, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  return project;
}

async function temporaryMemoryFab(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `inm-studio-lifecycle-${name}-`));
  const project = join(root, "memory-fab");
  await cp(memoryFab, project, {
    recursive: true,
    filter: (source) => !source.split("/").includes(".inm"),
  });
  return project;
}

function availableTestPorts(count: number): number[] {
  const reservations = Array.from({ length: count }, () => Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("reserved"),
  }));
  try {
    return reservations.map((reservation) => {
      if (reservation.port === undefined) throw new Error("Test port reservation did not expose a port");
      return reservation.port;
    });
  } finally {
    for (const reservation of reservations) reservation.stop(true);
  }
}

function data(stdout: string) {
  return JSON.parse(stdout) as {
    ok: true;
    command: string;
    data: {
      state: string;
      health: {
        pid: number;
        managerPid: number | null;
        inputDir: string;
        url: string;
        service: string;
        sourceHash: string;
        managerSourceHash: string;
        supervisor: {
          phase: string;
          attemptedSourceHash: string;
          childPid: number | null;
          generation: number;
          heartbeatAt: string;
          retry: string;
          failure: null | { at: string; phase: string; message: string };
        };
      };
      logPath: string;
      port: number;
      portSelection: "explicit" | "managed" | "default" | "fallback";
      supervisor: {
        phase: string;
        attemptedSourceHash: string;
        childPid: number | null;
        generation: number;
        heartbeatAt: string;
        retry: string;
        failure: null | { at: string; phase: string; message: string };
      } | null;
      source: {
        state: string;
        expectedHash: string;
        runningHash: string | null;
        managerRunningHash: string | null;
        serverState: string;
        managerState: string;
      };
    };
  };
}

function recoveringLifecycle(overrides: Partial<StudioLifecycleResult> = {}): StudioLifecycleResult {
  const expectedHash = "a".repeat(64);
  return {
    action: "start",
    state: "recovering",
    health: null,
    inputDir: "/tmp/inm-verified-session",
    project: null,
    port: 4176,
    portSelection: "managed",
    url: "http://127.0.0.1:4176",
    pid: 123,
    logPath: "/tmp/inm-verified-session/.inm/studio/4176/studio.log",
    supervisor: {
      phase: "adopting",
      attemptedSourceHash: expectedHash,
      childPid: 123,
      generation: 2,
      heartbeatAt: new Date().toISOString(),
      retry: "source-change",
      failure: null,
    },
    source: {
      state: "recovering",
      expectedHash,
      runningHash: "b".repeat(64),
      managerRunningHash: expectedHash,
      serverState: "stale",
      managerState: "current",
    },
    targetConvergence: null,
    ...overrides,
  };
}

test("project session waits only for one verified exact-source recovery", async () => {
  const recovering = recoveringLifecycle();
  const current = recoveringLifecycle({
    action: "status",
    state: "running",
    supervisor: {
      ...recovering.supervisor!,
      phase: "current",
      retry: "none",
    },
    source: {
      ...recovering.source,
      state: "current",
      runningHash: recovering.source.expectedHash,
      serverState: "current",
    },
  });
  let inspections = 0;
  const converged = await waitForVerifiedSessionRecovery(
    recovering,
    async () => {
      inspections += 1;
      return inspections === 1 ? recovering : current;
    },
    { timeoutMs: 50, pollMs: 1 },
  );
  expect(inspections).toBe(2);
  expect(converged).toEqual(expect.objectContaining({
    action: "start",
    state: "reused",
    source: expect.objectContaining({ state: "current" }),
    supervisor: expect.objectContaining({ phase: "current" }),
  }));

  const wrongSource = recoveringLifecycle({
    supervisor: {
      ...recovering.supervisor!,
      attemptedSourceHash: "c".repeat(64),
    },
  });
  await expect(waitForVerifiedSessionRecovery(wrongSource, async () => current, { timeoutMs: 20, pollMs: 1 }))
    .rejects.toMatchObject({ code: "session.studio-recovery-unverified" });
  await expect(waitForVerifiedSessionRecovery(recovering, async () => recovering, { timeoutMs: 5, pollMs: 1 }))
    .rejects.toMatchObject({ code: "session.studio-recovery-timeout", options: { retryable: true } });
});

test("Studio lifecycle is explicit in machine-readable CLI discovery", async () => {
  const help = await runCli(["help", "--json"]);
  expect(help.exitCode).toBe(0);
  const commands = (JSON.parse(help.stdout) as {
    data: {
      commands: Array<{
        id: string;
        usage: string;
        description: string;
        supportsJson: boolean;
        effect: string;
        arguments: Array<{ name: string; required: boolean; default?: unknown; description: string }>;
      }>;
    };
  }).data.commands;
  expect(commands.filter((command) => command.id.startsWith("studio."))).toEqual([
    expect.objectContaining({ id: "studio.start", supportsJson: true }),
    expect.objectContaining({ id: "studio.status", supportsJson: true, effect: "read-only" }),
    expect.objectContaining({ id: "studio.restart", supportsJson: true }),
    expect.objectContaining({ id: "studio.stop", supportsJson: true }),
    expect.objectContaining({ id: "studio.serve", supportsJson: false }),
  ]);
  const managedPort = commands.find((command) => command.id === "studio.start")!.arguments
    .find((argument) => argument.name === "port")!;
  const foregroundPort = commands.find((command) => command.id === "studio.serve")!.arguments
    .find((argument) => argument.name === "port")!;
  expect(managedPort.default).toBeUndefined();
  expect(managedPort.description).toContain("Omit to discover");
  expect(foregroundPort.default).toBe(4176);
  const session = commands.find((command) => command.id === "session")!;
  expect(session.usage).toContain("[--experiment ID [--run] | --investigation ID]");
  expect(session.description).toContain("shared project next action");
  expect(session.arguments.find((argument) => argument.name === "experiment")).toEqual(expect.objectContaining({
    required: false,
    description: expect.stringContaining("omit to enter the shared Workbench next action"),
  }));
  expect(session.arguments.find((argument) => argument.name === "run")?.description).toContain("With --experiment");
});

test("one command enters the authoritative shared project next action without route knowledge", async () => {
  const project = await temporaryProject("project-session");
  const port = 51_100 + process.pid % 300;
  try {
    const entered = await runCli([
      "session", project,
      "--port", String(port),
      "--no-open",
      "--json",
    ]);
    expect(entered).toEqual(expect.objectContaining({ exitCode: 0, stderr: "" }));
    const envelope = JSON.parse(entered.stdout) as {
      command: string;
      context: { project: { id: string; rootDir: string } };
      nextActions: Array<{
        id: string;
        title: string;
        reason: string;
        actionLabel: string;
        argv: string[];
        effect: string;
        requiresConfirmation: boolean;
        studioRoute: string;
        target?: Record<string, string>;
      }>;
      data: {
        lifecycle: { state: string; port: number; source: { state: string } };
        target: {
          kind: "project-next-action";
          nextAction: {
            id: string;
            title: string;
            reason: string;
            actionLabel: string;
            argv: string[];
            effect: string;
            requiresConfirmation: boolean;
            studioRoute: string;
            target?: Record<string, string>;
          };
        };
        route: string;
        url: string;
        operation: null;
      };
    };
    const overview = await fetch(`http://127.0.0.1:${port}/api/projects/ironworks/overview`)
      .then((response) => response.json()) as { nextAction: typeof envelope.data.target.nextAction };
    expect(envelope).toEqual(expect.objectContaining({
      command: "session",
      context: expect.objectContaining({ project: { id: "ironworks", name: "Ironworks Research Cell", rootDir: project } }),
      data: expect.objectContaining({
        lifecycle: expect.objectContaining({ state: "running", port, source: expect.objectContaining({ state: "current" }) }),
        target: {
          kind: "project-next-action",
          nextAction: overview.nextAction,
        },
        route: overview.nextAction.studioRoute,
        url: `http://127.0.0.1:${port}${overview.nextAction.studioRoute}`,
        operation: null,
      }),
    }));
    expect(envelope.nextActions).toEqual([expect.objectContaining({
      id: overview.nextAction.id,
      title: overview.nextAction.title,
      reason: overview.nextAction.reason,
      actionLabel: overview.nextAction.actionLabel,
      argv: overview.nextAction.argv,
      effect: overview.nextAction.effect,
      requiresConfirmation: overview.nextAction.requiresConfirmation,
      studioRoute: overview.nextAction.studioRoute,
      target: overview.nextAction.target,
    })]);

    const reentered = await runCli([
      "session", project,
      "--port", String(port),
      "--no-open",
      "--json",
    ]);
    expect(reentered.exitCode).toBe(0);
    expect(JSON.parse(reentered.stdout).data).toEqual(expect.objectContaining({
      lifecycle: expect.objectContaining({ state: "reused", port }),
      target: {
        kind: "project-next-action",
        nextAction: overview.nextAction,
      },
      route: overview.nextAction.studioRoute,
      operation: null,
    }));
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
  }
}, 30_000);

test("--run without an explicit Experiment fails before starting Studio", async () => {
  const project = await temporaryProject("session-run-boundary");
  const port = 51_400 + process.pid % 100;
  const rejected = await runCli([
    "session", project,
    "--run",
    "--port", String(port),
    "--no-open",
    "--json",
  ]);
  expect(rejected.exitCode).toBe(2);
  expect(JSON.parse(rejected.stderr)).toEqual(expect.objectContaining({
    ok: false,
    command: "session",
    error: expect.objectContaining({
      code: "cli.usage",
      message: "Usage: --run requires --experiment ID",
    }),
  }));
  const status = await runCli(["studio", "status", project, "--port", String(port), "--json"]);
  expect(status.exitCode).toBe(0);
  expect(data(status.stdout).data).toEqual(expect.objectContaining({
    state: "not-running",
    port,
    health: null,
  }));
});

test("one command enters the exact phase-aware Investigation Design Session", async () => {
  const project = await temporaryMemoryFab("investigation-session");
  const port = 51_450 + process.pid % 50;
  try {
    const entered = await runCli([
      "session", project,
      "--investigation", "source-lot-back-end-service",
      "--port", String(port),
      "--no-open",
      "--json",
    ]);
    expect(entered).toEqual(expect.objectContaining({ exitCode: 0, stderr: "" }));
    const envelope = JSON.parse(entered.stdout);
    expect(envelope).toEqual(expect.objectContaining({
      command: "session",
      data: expect.objectContaining({
        lifecycle: expect.objectContaining({
          state: "running",
          port,
          source: expect.objectContaining({ state: "current" }),
        }),
        target: {
          kind: "investigation",
          investigation: expect.objectContaining({
            id: "source-lot-back-end-service",
            state: "historical",
            entryCount: 4,
          }),
          handoff: expect.objectContaining({
            phase: "observe-current-factory",
            sourceEntry: expect.objectContaining({
              id: "parallel-burn-in-overflow-revise",
              sequence: 4,
              kind: "decision",
            }),
            evidenceIds: [
              "operating-run",
              "diagnostic",
              "source-lot-tail-run-105",
              "parallel-burn-in-overflow-comparison",
              "parallel-burn-in-overflow-review",
            ],
            authorship: expect.objectContaining({
              kind: "investigation-entry",
              entryKind: "observation",
            }),
          }),
        },
        route: "/memory-fab/investigations/source-lot-back-end-service#investigation-authoring",
        url: `http://127.0.0.1:${port}/memory-fab/investigations/source-lot-back-end-service#investigation-authoring`,
        operation: null,
      }),
      nextActions: [
        expect.objectContaining({
          actionLabel: "AUTHOR OBSERVATION",
          target: expect.objectContaining({
            kind: "investigation",
            investigationId: "source-lot-back-end-service",
            phase: "observe-current-factory",
            sourceEntryId: "parallel-burn-in-overflow-revise",
          }),
        }),
      ],
    }));
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
  }
}, 60_000);

test("session target modes fail before lifecycle mutation when combined", async () => {
  const project = await temporaryProject("session-target-conflict");
  const port = 51_490 + process.pid % 10;
  const rejected = await runCli([
    "session", project,
    "--experiment", "power-priority",
    "--investigation", "some-question",
    "--port", String(port),
    "--no-open",
    "--json",
  ]);
  expect(rejected.exitCode).toBe(2);
  expect(JSON.parse(rejected.stderr)).toEqual(expect.objectContaining({
    ok: false,
    command: "session",
    error: expect.objectContaining({
      code: "cli.usage",
      message: "Usage: --experiment and --investigation are mutually exclusive",
    }),
  }));
  const status = await runCli(["studio", "status", project, "--port", String(port), "--json"]);
  expect(status.exitCode).toBe(0);
  expect(data(status.stdout).data.state).toBe("not-running");
});

test("one command enters and starts a reconnectable Experiment session without port memory", async () => {
  const project = await temporaryProject("session");
  const port = 51_500 + process.pid % 400;
  try {
    const started = await runCli([
      "session", project,
      "--experiment", "power-priority",
      "--run",
      "--port", String(port),
      "--no-open",
      "--json",
    ]);
    expect(started).toEqual(expect.objectContaining({ exitCode: 0, stderr: "" }));
    const envelope = JSON.parse(started.stdout) as {
      command: string;
      context: { project: { id: string; rootDir: string } };
      data: {
        lifecycle: { state: string; port: number; source: { state: string } };
        target: {
          kind: "experiment";
          experiment: { id: string; name: string; cases: number; locked: boolean };
        };
        route: string;
        url: string;
        operation: {
          reused: boolean;
          snapshot: { id: string; status: string; subject: { kind: string; benchmarkId: string } };
          pollUrl: string;
        };
      };
    };
    expect(envelope).toEqual(expect.objectContaining({
      command: "session",
      context: expect.objectContaining({ project: { id: "ironworks", name: "Ironworks Research Cell", rootDir: project } }),
      data: expect.objectContaining({
        lifecycle: expect.objectContaining({ state: "running", port, source: expect.objectContaining({ state: "current" }) }),
        target: {
          kind: "experiment",
          experiment: expect.objectContaining({ id: "power-priority", cases: 1, locked: true }),
        },
        route: "/ironworks/experiments/power-priority",
        url: `http://127.0.0.1:${port}/ironworks/experiments/power-priority`,
        operation: expect.objectContaining({
          reused: false,
          snapshot: expect.objectContaining({
            id: expect.any(String),
            status: "running",
            subject: { kind: "benchmark", benchmarkId: "power-priority" },
          }),
          pollUrl: expect.stringContaining(`/api/projects/ironworks/operations/`),
        }),
      }),
    }));

    let completed: { operation: { id: string; status: string; result: unknown } } | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      completed = await fetch(envelope.data.operation.pollUrl).then((response) => response.json()) as {
        operation: { id: string; status: string; result: unknown };
      };
      if (completed?.operation.status !== "running") break;
      await Bun.sleep(25);
    }
    expect(completed?.operation).toEqual(expect.objectContaining({
      id: envelope.data.operation.snapshot.id,
      status: "completed",
      result: expect.objectContaining({ command: "benchmark", benchmark: "power-priority" }),
    }));

    const opened = await runCli([
      "session", project,
      "--experiment", "power-priority",
      "--port", String(port),
      "--no-open",
      "--json",
    ]);
    expect(opened.exitCode).toBe(0);
    expect(JSON.parse(opened.stdout).data).toEqual(expect.objectContaining({
      lifecycle: expect.objectContaining({ state: "reused", port }),
      target: {
        kind: "experiment",
        experiment: expect.objectContaining({ id: "power-priority", cases: 1, locked: true }),
      },
      operation: null,
      route: "/ironworks/experiments/power-priority",
    }));
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
  }
}, 30_000);

test("Studio lifecycle starts, reuses, reports, restarts, and stops one exact project", async () => {
  const project = await temporaryProject("managed");
  const port = 52_000 + process.pid % 1_000;
  const args = [project, "--port", String(port), "--no-open", "--json"];

  try {
    const started = await runCli(["studio", "start", ...args]);
    expect(started).toEqual(expect.objectContaining({ exitCode: 0, stderr: "" }));
    expect(data(started.stdout)).toEqual(expect.objectContaining({
      command: "studio.start",
      data: expect.objectContaining({
        state: "running",
        health: expect.objectContaining({ inputDir: project, service: "inm-studio" }),
        source: expect.objectContaining({ state: "current" }),
      }),
    }));
    const firstPid = data(started.stdout).data.health.pid;

    const status = await runCli(["studio", "status", project, "--port", String(port), "--json"]);
    expect(status.exitCode).toBe(0);
    expect(data(status.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      health: expect.objectContaining({ pid: firstPid, inputDir: project }),
      source: expect.objectContaining({ state: "current" }),
    }));

    const reused = await runCli(["studio", "start", ...args]);
    expect(reused.exitCode).toBe(0);
    expect(data(reused.stdout).data).toEqual(expect.objectContaining({
      state: "reused",
      health: expect.objectContaining({ pid: firstPid }),
      source: expect.objectContaining({ state: "current" }),
    }));

    const restarted = await runCli(["studio", "restart", ...args]);
    expect(restarted.exitCode).toBe(0);
    expect(data(restarted.stdout).command).toBe("studio.restart");
    expect(data(restarted.stdout).data.state).toBe("running");
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);
  } finally {
    const stopped = await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
    expect(stopped.exitCode).toBe(0);
  }

  const status = await runCli(["studio", "status", project, "--port", String(port), "--json"]);
  expect(status.exitCode).toBe(0);
  expect(data(status.stdout).data.state).toBe("not-running");
}, 60_000);

test("managed Studio adopts changed runtime source on the same port without a lifecycle command", async () => {
  const project = await temporaryProject("source-supervision");
  const port = 52_300 + process.pid % 150;
  const identityFile = join(project, "studio-source.sha256");
  const firstHash = "a".repeat(64);
  const secondHash = "b".repeat(64);
  const environment = { INM_STUDIO_SOURCE_HASH_FILE: identityFile };
  await writeFile(identityFile, `${firstHash}\n`);

  try {
    const started = await runCli([
      "studio", "start", project, "--port", String(port), "--no-open", "--json",
    ], environment);
    expect(started.exitCode).toBe(0);
    const first = data(started.stdout).data.health;
    expect(first).toEqual(expect.objectContaining({
      sourceHash: firstHash,
      managerSourceHash: firstHash,
      managerPid: expect.any(Number),
    }));

    await writeFile(identityFile, `${secondHash}\n`);
    let replacement: typeof first | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await Bun.sleep(50);
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json()) as typeof first;
        if (health.sourceHash === secondHash) {
          replacement = health;
          break;
        }
      } catch {
        // The verified supervisor is replacing its child on this same port.
      }
    }
    expect(replacement).toEqual(expect.objectContaining({
      sourceHash: secondHash,
      managerSourceHash: firstHash,
      managerPid: first.managerPid,
    }));
    expect(replacement!.pid).not.toBe(first.pid);
    const logPath = data(started.stdout).data.logPath as string;
    const lifecycleEvents = (await readFile(logPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { component: string; event: string; generation?: number; reason?: string })
      .filter((entry) => entry.component === "studio-supervisor");
    expect(lifecycleEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "supervisor-started", generation: 0 }),
      expect.objectContaining({ event: "server-started", generation: 1, reason: "initial-start" }),
      expect.objectContaining({ event: "source-adoption-started", generation: 1 }),
      expect.objectContaining({ event: "server-started", generation: 2, reason: "source-adoption" }),
    ]));

    const staleStatus = await runCli([
      "studio", "status", project, "--port", String(port), "--json",
    ], environment);
    expect(staleStatus.exitCode).toBe(0);
    expect(data(staleStatus.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      port,
      source: {
        state: "stale",
        expectedHash: secondHash,
        runningHash: secondHash,
        managerRunningHash: firstHash,
        serverState: "current",
        managerState: "stale",
      },
    }));

    const fullyAdopted = await runCli([
      "studio", "start", project, "--port", String(port), "--no-open", "--json",
    ], environment);
    expect(fullyAdopted.exitCode).toBe(0);
    expect(data(fullyAdopted.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      port,
      source: {
        state: "current",
        expectedHash: secondHash,
        runningHash: secondHash,
        managerRunningHash: secondHash,
        serverState: "current",
        managerState: "current",
      },
    }));
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"], environment);
  }
}, 30_000);

test("failed source adoption keeps the supervisor and last healthy server alive until a valid edit recovers", async () => {
  const project = await temporaryProject("source-adoption-recovery");
  const port = 52_450 + process.pid % 150;
  const identityFile = join(project, "studio-source.sha256");
  const firstHash = "1".repeat(64);
  const failedHash = "2".repeat(64);
  const recoveredHash = "3".repeat(64);
  const environment = {
    INM_STUDIO_SOURCE_HASH_FILE: identityFile,
    INM_STUDIO_TEST_PREFLIGHT_FAILURE_HASH: failedHash,
  };
  await writeFile(identityFile, `${firstHash}\n`);

  try {
    const started = await runCli([
      "studio", "start", project, "--port", String(port), "--no-open", "--json",
    ], environment);
    expect(started.exitCode).toBe(0);
    const first = data(started.stdout).data.health;
    expect(first).toEqual(expect.objectContaining({
      sourceHash: firstHash,
      managerSourceHash: firstHash,
      supervisor: expect.objectContaining({ phase: "current" }),
    }));

    await writeFile(identityFile, `${failedHash}\n`);
    let degraded: typeof first | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await Bun.sleep(50);
      const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json()) as typeof first;
      if (health.supervisor.phase === "degraded") {
        degraded = health;
        break;
      }
    }
    expect(degraded).toEqual(expect.objectContaining({
      pid: first.pid,
      managerPid: first.managerPid,
      sourceHash: firstHash,
      managerSourceHash: firstHash,
      supervisor: expect.objectContaining({
        phase: "degraded",
        attemptedSourceHash: failedHash,
        childPid: first.pid,
        retry: "source-change",
        failure: expect.objectContaining({
          phase: "preflight",
          message: expect.stringContaining("Injected Studio source preflight failure"),
        }),
      }),
    }));

    const degradedStatus = await runCli([
      "studio", "status", project, "--port", String(port), "--json",
    ], environment);
    expect(degradedStatus.exitCode).toBe(0);
    expect(data(degradedStatus.stdout).data).toEqual(expect.objectContaining({
      state: "degraded",
      health: expect.objectContaining({ pid: first.pid, managerPid: first.managerPid }),
      supervisor: expect.objectContaining({
        phase: "degraded",
        attemptedSourceHash: failedHash,
        retry: "source-change",
      }),
      source: {
        state: "degraded",
        expectedHash: failedHash,
        runningHash: firstHash,
        managerRunningHash: firstHash,
        serverState: "stale",
        managerState: "stale",
      },
    }));

    const logPath = data(started.stdout).data.logPath as string;
    await Bun.sleep(300);
    const failedBeforeExplicitRetry = (await readFile(logPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { component: string; event: string })
      .filter((entry) => entry.component === "studio-supervisor" && entry.event === "source-adoption-failed");
    expect(failedBeforeExplicitRetry).toHaveLength(1);

    const session = await runCli([
      "session", project,
      "--experiment", "main",
      "--port", String(port),
      "--no-open",
      "--json",
    ], environment);
    expect(session.exitCode).toBe(1);
    expect(JSON.parse(session.stderr)).toEqual(expect.objectContaining({
      ok: false,
      command: "session",
      error: expect.objectContaining({
        code: "session.studio-degraded",
        retryable: true,
        message: expect.stringContaining("preflight"),
      }),
    }));
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);

    await writeFile(identityFile, `${recoveredHash}\n`);
    let recovered: typeof first | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await Bun.sleep(50);
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json()) as typeof first;
        if (health.sourceHash === recoveredHash && health.supervisor.phase === "current") {
          recovered = health;
          break;
        }
      } catch {
        // The preflight passed and the supervisor is performing one bounded child handoff.
      }
    }
    expect(recovered).toEqual(expect.objectContaining({
      sourceHash: recoveredHash,
      managerSourceHash: firstHash,
      managerPid: first.managerPid,
      supervisor: expect.objectContaining({
        phase: "current",
        attemptedSourceHash: recoveredHash,
        retry: "none",
        failure: null,
      }),
    }));
    expect(recovered!.pid).not.toBe(first.pid);

    const lifecycleEvents = (await readFile(logPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { component: string; event: string; failurePhase?: string })
      .filter((entry) => entry.component === "studio-supervisor");
    expect(lifecycleEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "source-adoption-failed", failurePhase: "preflight" }),
      expect.objectContaining({ event: "source-retry-requested" }),
      expect.objectContaining({ event: "source-adoption-ready" }),
    ]));
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"], environment);
  }
}, 30_000);

test("rapid source edits serialize adoption and skip a superseded handoff", async () => {
  const project = await temporaryProject("serialized-source-adoption");
  const port = 52_610 + process.pid % 90;
  const identityFile = join(project, "studio-source.sha256");
  const firstHash = "4".repeat(64);
  const supersededHash = "5".repeat(64);
  const finalHash = "6".repeat(64);
  const environment = {
    INM_STUDIO_SOURCE_HASH_FILE: identityFile,
    INM_STUDIO_TEST_PREFLIGHT_DELAY_HASH: supersededHash,
    INM_STUDIO_TEST_PREFLIGHT_DELAY_MS: "300",
  };
  await writeFile(identityFile, `${firstHash}\n`);

  try {
    const started = await runCli([
      "studio", "start", project, "--port", String(port), "--no-open", "--json",
    ], environment);
    expect(started.exitCode).toBe(0);
    const first = data(started.stdout).data.health;

    await writeFile(identityFile, `${supersededHash}\n`);
    let adopting = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await Bun.sleep(25);
      const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json()) as typeof first;
      if (health.supervisor.phase === "adopting"
        && health.supervisor.attemptedSourceHash === supersededHash) {
        adopting = true;
        break;
      }
    }
    expect(adopting).toBe(true);
    await writeFile(identityFile, `${finalHash}\n`);

    let recovered: typeof first | null = null;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await Bun.sleep(25);
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json()) as typeof first;
        if (health.sourceHash === finalHash && health.supervisor.phase === "current") {
          recovered = health;
          break;
        }
      } catch {
        // One bounded handoff occurs only after the final hash passes preflight.
      }
    }
    expect(recovered).toEqual(expect.objectContaining({
      managerPid: first.managerPid,
      sourceHash: finalHash,
      supervisor: expect.objectContaining({
        phase: "current",
        generation: 2,
      }),
    }));
    expect(recovered!.pid).not.toBe(first.pid);

    const lifecycleEvents = (await readFile(data(started.stdout).data.logPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as {
        component: string;
        event: string;
        reason?: string;
        attemptedSourceHash?: string;
        preparedSourceHash?: string;
        latestSourceHash?: string;
      })
      .filter((entry) => entry.component === "studio-supervisor");
    expect(lifecycleEvents).toContainEqual(expect.objectContaining({
      event: "source-adoption-superseded",
      preparedSourceHash: supersededHash,
      latestSourceHash: finalHash,
    }));
    expect(lifecycleEvents.filter((entry) => entry.event === "server-started" && entry.reason === "source-adoption")).toEqual([
      expect.objectContaining({ attemptedSourceHash: finalHash }),
    ]);
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"], environment);
  }
}, 30_000);

test("an abandoned detached test Studio exits when its idle lease expires", async () => {
  const project = await temporaryProject("leased");
  const port = 52_500 + process.pid % 400;
  const environment = { INM_STUDIO_IDLE_EXIT_MS: "250" };
  try {
    const started = await runCli([
      "studio", "start", project, "--port", String(port), "--no-open", "--json",
    ], environment);
    expect(started.exitCode).toBe(0);
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);
    await Bun.sleep(600);
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then(
      () => "running",
      () => "stopped",
    )).toBe("stopped");
    const status = await runCli(["studio", "status", project, "--port", String(port), "--json"], environment);
    expect(status.exitCode).toBe(0);
    expect(data(status.stdout).data.state).toBe("not-running");
  } finally {
    await runCli(["studio", "stop", project, "--port", String(port), "--json"], environment);
  }
}, 30_000);

test("portless Studio lifecycle allocates once and rediscovers the exact managed service", async () => {
  const first = await temporaryProject("portless-first");
  const second = await temporaryProject("portless-second");
  const defaultPort = 57_000 + process.pid % 500;
  const fallbackPort = defaultPort + 1;
  const environment = { INM_STUDIO_DEFAULT_PORT: String(defaultPort) };

  try {
    const occupied = await runCli([
      "studio", "start", first, "--port", String(defaultPort), "--no-open", "--json",
    ], environment);
    expect(occupied.exitCode).toBe(0);

    const absent = await runCli(["studio", "status", second, "--json"], environment);
    expect(absent.exitCode).toBe(0);
    expect(data(absent.stdout).data).toEqual(expect.objectContaining({
      state: "not-running",
      port: defaultPort,
      portSelection: "default",
    }));

    const started = await runCli(["studio", "start", second, "--no-open", "--json"], environment);
    expect(started.exitCode).toBe(0);
    expect(data(started.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      port: fallbackPort,
      portSelection: "fallback",
      health: expect.objectContaining({ inputDir: second }),
    }));
    const firstPid = data(started.stdout).data.health.pid;

    const status = await runCli(["studio", "status", second, "--json"], environment);
    expect(status.exitCode).toBe(0);
    expect(data(status.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      port: fallbackPort,
      portSelection: "managed",
      health: expect.objectContaining({ pid: firstPid }),
    }));

    const strictConflict = await runCli([
      "studio", "start", second, "--port", String(defaultPort), "--no-open", "--json",
    ], environment);
    expect(strictConflict.exitCode).toBe(1);
    expect(JSON.parse(strictConflict.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "studio.port-owned-by-other-project" }),
    }));

    const restarted = await runCli(["studio", "restart", second, "--no-open", "--json"], environment);
    expect(restarted.exitCode).toBe(0);
    expect(data(restarted.stdout).data).toEqual(expect.objectContaining({
      port: fallbackPort,
      portSelection: "managed",
      source: expect.objectContaining({ state: "current" }),
    }));
    expect(data(restarted.stdout).data.health.pid).not.toBe(firstPid);

    const stopped = await runCli(["studio", "stop", second, "--json"], environment);
    expect(stopped.exitCode).toBe(0);
    expect(data(stopped.stdout).data).toEqual(expect.objectContaining({
      state: "stopped",
      port: fallbackPort,
      portSelection: "managed",
    }));
    expect(await fetch(`http://127.0.0.1:${defaultPort}/api/health`).then((response) => response.status)).toBe(200);
  } finally {
    await runCli(["studio", "stop", second, "--port", String(fallbackPort), "--json"], environment);
    await runCli(["studio", "stop", first, "--port", String(defaultPort), "--json"], environment);
  }
}, 60_000);

test("portless Studio start leaves a foreign default listener untouched and uses a fallback", async () => {
  const project = await temporaryProject("portless-foreign");
  const defaultPort = 57_600 + process.pid % 300;
  const environment = { INM_STUDIO_DEFAULT_PORT: String(defaultPort) };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: defaultPort,
    fetch: () => new Response("foreign"),
  });
  let selectedPort: number | undefined;
  try {
    const started = await runCli(["studio", "start", project, "--no-open", "--json"], environment);
    expect(started.exitCode).toBe(0);
    selectedPort = data(started.stdout).data.port;
    expect(data(started.stdout).data).toEqual(expect.objectContaining({
      port: defaultPort + 1,
      portSelection: "fallback",
    }));
    expect(await fetch(`http://127.0.0.1:${defaultPort}`).then((response) => response.text())).toBe("foreign");
    expect((await runCli(["studio", "stop", project, "--json"], environment)).exitCode).toBe(0);
  } finally {
    if (selectedPort !== undefined) await runCli([
      "studio", "stop", project, "--port", String(selectedPort), "--json",
    ], environment);
    server.stop(true);
  }
}, 30_000);

test("portless Studio lifecycle deterministically converges every fully verified target instance", async () => {
  const project = await temporaryProject("portless-convergence");
  const [firstPort, secondPort] = availableTestPorts(2) as [number, number];
  const environment = { INM_STUDIO_DEFAULT_PORT: String(firstPort) };
  try {
    expect((await runCli([
      "studio", "start", project, "--port", String(firstPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    expect((await runCli([
      "studio", "start", project, "--port", String(secondPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);

    const status = await runCli(["studio", "status", project, "--json"], environment);
    expect(status.exitCode).toBe(0);
    expect(data(status.stdout).data).toEqual(expect.objectContaining({
      port: secondPort,
      targetConvergence: {
        observedPorts: [firstPort, secondPort],
        selectedPort: secondPort,
        retiredPorts: [],
        pending: true,
      },
    }));

    const converged = await runCli(["studio", "start", project, "--no-open", "--json"], environment);
    expect(converged.exitCode).toBe(0);
    expect(data(converged.stdout).data).toEqual(expect.objectContaining({
      state: "reused",
      port: secondPort,
      source: expect.objectContaining({ state: "current" }),
      targetConvergence: {
        observedPorts: [firstPort, secondPort],
        selectedPort: secondPort,
        retiredPorts: [firstPort],
        pending: false,
      },
    }));
    expect((await readFile(data(converged.stdout).data.logPath, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { component?: string; event?: string; retiredPorts?: number[] }))
      .toContainEqual(expect.objectContaining({
        component: "studio-lifecycle",
        event: "target-convergence",
        retiredPorts: [firstPort],
      }));
    expect(await fetch(`http://127.0.0.1:${firstPort}/api/health`).then(
      () => "running",
      () => "stopped",
    )).toBe("stopped");

    expect((await runCli([
      "studio", "start", project, "--port", String(firstPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    const session = await runCli(["session", project, "--no-open", "--json"], environment);
    expect(session.exitCode).toBe(0);
    expect(JSON.parse(session.stdout).data.lifecycle).toEqual(expect.objectContaining({
      port: firstPort,
      source: expect.objectContaining({ state: "current" }),
      targetConvergence: {
        observedPorts: [firstPort, secondPort],
        selectedPort: firstPort,
        retiredPorts: [secondPort],
        pending: false,
      },
    }));

    expect((await runCli([
      "studio", "start", project, "--port", String(secondPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    const beforeRestartPid = (await fetch(`http://127.0.0.1:${secondPort}/api/health`).then(
      (response) => response.json(),
    ) as { pid: number }).pid;
    const restarted = await runCli(["studio", "restart", project, "--no-open", "--json"], environment);
    expect(restarted.exitCode).toBe(0);
    expect(data(restarted.stdout).data).toEqual(expect.objectContaining({
      port: secondPort,
      targetConvergence: {
        observedPorts: [firstPort, secondPort],
        selectedPort: secondPort,
        retiredPorts: [firstPort],
        pending: false,
      },
    }));
    expect(data(restarted.stdout).data.health.pid).not.toBe(beforeRestartPid);

    expect((await runCli([
      "studio", "start", project, "--port", String(firstPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    const stopped = await runCli(["studio", "stop", project, "--json"], environment);
    expect(stopped.exitCode).toBe(0);
    expect(data(stopped.stdout).data).toEqual(expect.objectContaining({
      state: "stopped",
      targetConvergence: {
        observedPorts: [firstPort, secondPort],
        selectedPort: null,
        retiredPorts: [firstPort, secondPort],
        pending: false,
      },
    }));
    for (const port of [firstPort, secondPort]) {
      expect(await fetch(`http://127.0.0.1:${port}/api/health`).then(
        () => "running",
        () => "stopped",
      )).toBe("stopped");
    }
  } finally {
    await runCli(["studio", "stop", project, "--port", String(firstPort), "--json"], environment);
    await runCli(["studio", "stop", project, "--port", String(secondPort), "--json"], environment);
  }
}, 60_000);

test("portless Studio convergence leaves every instance untouched when duplicate ownership is incomplete", async () => {
  const project = await temporaryProject("portless-unverified-duplicate");
  const [firstPort, secondPort] = availableTestPorts(2) as [number, number];
  const environment = { INM_STUDIO_DEFAULT_PORT: String(firstPort) };
  const firstStatePath = join(project, ".inm", "studio", String(firstPort), "state.json");
  let originalState: string | undefined;
  try {
    expect((await runCli([
      "studio", "start", project, "--port", String(firstPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    expect((await runCli([
      "studio", "start", project, "--port", String(secondPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    originalState = await readFile(firstStatePath, "utf8");
    const tampered = JSON.parse(originalState) as { sourceHash: string };
    tampered.sourceHash = "c".repeat(64);
    await writeFile(firstStatePath, `${JSON.stringify(tampered, null, 2)}\n`);

    const refused = await runCli(["studio", "start", project, "--no-open", "--json"], environment);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "studio.multiple-target-instances-unverified",
        message: expect.stringContaining(String(firstPort)),
      }),
    }));
    for (const port of [firstPort, secondPort]) {
      expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);
    }
  } finally {
    if (originalState !== undefined) await writeFile(firstStatePath, originalState);
    await runCli(["studio", "stop", project, "--port", String(firstPort), "--json"], environment);
    await runCli(["studio", "stop", project, "--port", String(secondPort), "--json"], environment);
  }
}, 30_000);

test("Studio stop refuses managed state whose ownership fields no longer verify live health", async () => {
  const project = await temporaryProject("ownership-mismatch");
  const port = 58_400 + process.pid % 300;
  const args = [project, "--port", String(port), "--no-open", "--json"];
  const stateFile = join(project, ".inm", "studio", String(port), "state.json");
  let originalState: string | undefined;
  try {
    const started = await runCli(["studio", "start", ...args]);
    expect(started.exitCode).toBe(0);
    originalState = await readFile(stateFile, "utf8");
    const changed = JSON.parse(originalState) as { sourceHash: string };
    changed.sourceHash = "c".repeat(64);
    await writeFile(stateFile, `${JSON.stringify(changed, null, 2)}\n`);

    const refused = await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "studio.unmanaged-instance" }),
    }));
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);

    const changedLabel = JSON.parse(originalState) as { label: string };
    changedLabel.label = "com.inm.studio.unrelated";
    await writeFile(stateFile, `${JSON.stringify(changedLabel, null, 2)}\n`);
    const unsafeLabel = await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
    expect(unsafeLabel.exitCode).toBe(1);
    expect(JSON.parse(unsafeLabel.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "studio.unmanaged-instance" }),
    }));
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);
  } finally {
    if (originalState !== undefined) await writeFile(stateFile, originalState);
    await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
  }
}, 30_000);

test("stale manager heartbeat cannot claim or terminate an unrelated reused PID", async () => {
  const project = await temporaryProject("stale-manager-heartbeat");
  const port = 58_720 + process.pid % 80;
  const runtimeDir = join(project, ".inm", "studio", String(port));
  const stateFile = join(runtimeDir, "state.json");
  const sourceHash = "d".repeat(64);
  const unrelated = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1_000)"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  const staleAt = new Date(Date.now() - 60_000).toISOString();

  try {
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(stateFile, `${JSON.stringify({
      version: 5,
      backend: "detached",
      inputDir: project,
      project: null,
      port,
      label: `com.inm.studio.${createHash("sha256").update(`${project}\0${port}`).digest("hex").slice(0, 16)}.${port}`,
      logPath: join(runtimeDir, "studio.log"),
      plistPath: null,
      pid: unrelated.pid,
      sourceHash,
      managerSourceHash: sourceHash,
      supervisor: {
        phase: "degraded",
        attemptedSourceHash: sourceHash,
        childPid: null,
        generation: 0,
        heartbeatAt: staleAt,
        retry: "source-change",
        failure: {
          at: staleAt,
          phase: "startup",
          message: "abandoned manager state",
        },
      },
      startedAt: staleAt,
    }, null, 2)}\n`);

    const status = await runCli(["studio", "status", project, "--json"]);
    expect(status.exitCode).toBe(0);
    expect(data(status.stdout).data).toEqual(expect.objectContaining({
      state: "not-running",
      port,
      portSelection: "managed",
      supervisor: null,
    }));

    const stopped = await runCli(["studio", "stop", project, "--port", String(port), "--json"]);
    expect(stopped.exitCode).toBe(0);
    expect(data(stopped.stdout).data.state).toBe("stopped");
    expect(() => process.kill(unrelated.pid, 0)).not.toThrow();
  } finally {
    unrelated.kill("SIGTERM");
    await unrelated.exited;
  }
}, 30_000);

test("portless Studio start reports bounded port exhaustion without stopping listeners", async () => {
  const project = await temporaryProject("portless-exhausted");
  const defaultPort = 58_800 + process.pid % 300;
  const environment = { INM_STUDIO_DEFAULT_PORT: String(defaultPort) };
  const servers = Array.from({ length: 24 }, (_, index) => Bun.serve({
    hostname: "127.0.0.1",
    port: defaultPort + index,
    fetch: () => new Response("occupied"),
  }));
  try {
    const started = await runCli(["studio", "start", project, "--no-open", "--json"], environment);
    expect(started.exitCode).toBe(1);
    expect(JSON.parse(started.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "studio.no-available-port",
        message: expect.stringContaining(`${defaultPort} through ${defaultPort + 23}`),
      }),
    }));
    expect(await fetch(`http://127.0.0.1:${defaultPort + 23}`).then((response) => response.text())).toBe("occupied");
  } finally {
    for (const server of servers) server.stop(true);
  }
}, 30_000);

test("Studio start safely replaces a verified same-project process built from stale source", async () => {
  const project = await temporaryProject("stale-source");
  const port = 53_000 + process.pid % 1_000;
  const args = [project, "--port", String(port), "--no-open", "--json"];
  const firstHash = "a".repeat(64);
  const secondHash = "b".repeat(64);

  try {
    const started = await runCli(["studio", "start", ...args], { INM_STUDIO_SOURCE_HASH_OVERRIDE: firstHash });
    expect(started.exitCode).toBe(0);
    const firstPid = data(started.stdout).data.health.pid;
    expect(data(started.stdout).data.source).toEqual({
      state: "current",
      expectedHash: firstHash,
      runningHash: firstHash,
      managerRunningHash: firstHash,
      serverState: "current",
      managerState: "current",
    });

    const stale = await runCli([
      "studio", "status", project, "--port", String(port), "--json",
    ], { INM_STUDIO_SOURCE_HASH_OVERRIDE: secondHash });
    expect(stale.exitCode).toBe(0);
    expect(data(stale.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      health: expect.objectContaining({ pid: firstPid, sourceHash: firstHash }),
      source: {
        state: "stale",
        expectedHash: secondHash,
        runningHash: firstHash,
        managerRunningHash: firstHash,
        serverState: "stale",
        managerState: "stale",
      },
    }));

    const replaced = await runCli(["studio", "start", ...args], { INM_STUDIO_SOURCE_HASH_OVERRIDE: secondHash });
    expect(replaced.exitCode).toBe(0);
    expect(data(replaced.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      health: expect.objectContaining({ sourceHash: secondHash }),
      source: {
        state: "current",
        expectedHash: secondHash,
        runningHash: secondHash,
        managerRunningHash: secondHash,
        serverState: "current",
        managerState: "current",
      },
    }));
    expect(data(replaced.stdout).data.health.pid).not.toBe(firstPid);
  } finally {
    await runCli([
      "studio", "stop", project, "--port", String(port), "--json",
    ], { INM_STUDIO_SOURCE_HASH_OVERRIDE: secondHash });
  }
}, 30_000);

test("Studio lifecycle refuses an unknown service without terminating it", async () => {
  const project = await temporaryProject("foreign");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 54_000 + process.pid % 1_000,
    fetch: () => new Response("foreign"),
  });
  try {
    const attempt = await runCli([
      "studio", "start", project, "--port", String(server.port), "--no-open", "--json",
    ]);
    expect(attempt.exitCode).toBe(1);
    expect(attempt.stdout).toBe("");
    expect(JSON.parse(attempt.stderr)).toEqual(expect.objectContaining({
      ok: false,
      command: "studio.start",
      error: expect.objectContaining({ code: "studio.port-owned-by-unknown-service" }),
    }));
    expect(await fetch(`http://127.0.0.1:${server.port}`).then((response) => response.text())).toBe("foreign");
  } finally {
    server.stop(true);
  }
});

test("Studio lifecycle reports another INM project instead of stopping it", async () => {
  const first = await temporaryProject("first");
  const second = await temporaryProject("second");
  const port = 56_000 + process.pid % 1_000;
  try {
    expect((await runCli(["studio", "start", first, "--port", String(port), "--no-open", "--json"])).exitCode).toBe(0);
    const conflicting = await runCli(["studio", "stop", second, "--port", String(port), "--json"]);
    expect(conflicting.exitCode).toBe(1);
    expect(JSON.parse(conflicting.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "studio.port-owned-by-other-project" }),
    }));
    expect(await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.status)).toBe(200);
  } finally {
    await runCli(["studio", "stop", first, "--port", String(port), "--json"]);
  }
}, 30_000);
