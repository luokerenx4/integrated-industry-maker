import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");

async function runCli(args: string[]) {
  const child = Bun.spawn([process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), ...args], {
    cwd: repository,
    env: { ...process.env, INM_STUDIO_BACKEND: "detached" },
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
      health: { pid: number; inputDir: string; url: string; service: string };
      logPath: string;
    };
  };
}

test("Studio lifecycle is explicit in machine-readable CLI discovery", async () => {
  const help = await runCli(["help", "--json"]);
  expect(help.exitCode).toBe(0);
  const commands = (JSON.parse(help.stdout) as {
    data: { commands: Array<{ id: string; supportsJson: boolean; effect: string }> };
  }).data.commands;
  expect(commands.filter((command) => command.id.startsWith("studio."))).toEqual([
    expect.objectContaining({ id: "studio.start", supportsJson: true }),
    expect.objectContaining({ id: "studio.status", supportsJson: true, effect: "read-only" }),
    expect.objectContaining({ id: "studio.restart", supportsJson: true }),
    expect.objectContaining({ id: "studio.stop", supportsJson: true }),
    expect.objectContaining({ id: "studio.serve", supportsJson: false }),
  ]);
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
      }),
    }));
    const firstPid = data(started.stdout).data.health.pid;

    const status = await runCli(["studio", "status", project, "--port", String(port), "--json"]);
    expect(status.exitCode).toBe(0);
    expect(data(status.stdout).data).toEqual(expect.objectContaining({
      state: "running",
      health: expect.objectContaining({ pid: firstPid, inputDir: project }),
    }));

    const reused = await runCli(["studio", "start", ...args]);
    expect(reused.exitCode).toBe(0);
    expect(data(reused.stdout).data).toEqual(expect.objectContaining({
      state: "reused",
      health: expect.objectContaining({ pid: firstPid }),
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
