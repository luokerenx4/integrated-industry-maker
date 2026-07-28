import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");

async function runCli(args: string[], environment: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), ...args], {
    cwd: repository,
    env: { ...process.env, INM_STUDIO_BACKEND: "detached", ...environment },
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

function data(stdout: string) {
  return JSON.parse(stdout) as {
    ok: true;
    command: string;
    data: {
      state: string;
      health: { pid: number; inputDir: string; url: string; service: string; sourceHash: string };
      logPath: string;
      port: number;
      portSelection: "explicit" | "managed" | "default" | "fallback";
      source: { state: string; expectedHash: string; runningHash: string | null };
    };
  };
}

test("Studio lifecycle is explicit in machine-readable CLI discovery", async () => {
  const help = await runCli(["help", "--json"]);
  expect(help.exitCode).toBe(0);
  const commands = (JSON.parse(help.stdout) as {
    data: {
      commands: Array<{
        id: string;
        supportsJson: boolean;
        effect: string;
        arguments: Array<{ name: string; default?: unknown; description: string }>;
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
});

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

test("portless Studio lifecycle rejects multiple verified instances for one target", async () => {
  const project = await temporaryProject("portless-ambiguous");
  const firstPort = 58_000 + process.pid % 300;
  const secondPort = firstPort + 1;
  const environment = { INM_STUDIO_DEFAULT_PORT: String(firstPort) };
  try {
    expect((await runCli([
      "studio", "start", project, "--port", String(firstPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);
    expect((await runCli([
      "studio", "start", project, "--port", String(secondPort), "--no-open", "--json",
    ], environment)).exitCode).toBe(0);

    const status = await runCli(["studio", "status", project, "--json"], environment);
    expect(status.exitCode).toBe(1);
    expect(JSON.parse(status.stderr)).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "studio.multiple-target-instances",
        message: expect.stringContaining(`${firstPort}, ${secondPort}`),
      }),
    }));
  } finally {
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
    });

    const stale = await runCli([
      "studio", "status", project, "--port", String(port), "--json",
    ], { INM_STUDIO_SOURCE_HASH_OVERRIDE: secondHash });
    expect(stale.exitCode).toBe(0);
    expect(data(stale.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      health: expect.objectContaining({ pid: firstPid, sourceHash: firstHash }),
      source: { state: "stale", expectedHash: secondHash, runningHash: firstHash },
    }));

    const replaced = await runCli(["studio", "start", ...args], { INM_STUDIO_SOURCE_HASH_OVERRIDE: secondHash });
    expect(replaced.exitCode).toBe(0);
    expect(data(replaced.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      health: expect.objectContaining({ sourceHash: secondHash }),
      source: { state: "current", expectedHash: secondHash, runningHash: secondHash },
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
