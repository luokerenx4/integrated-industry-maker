import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { evaluateBlueprintBenchmark } from "@inm/core";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");

test("opening a project without runs does not write a Studio baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-readonly-"));
  const projectDir = join(root, "ironworks");
  await cp(ironworks, projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const port = 48_000 + process.pid % 1_000;
  const child = Bun.spawn([
    process.execPath, join(repository, "packages/inm-studio/src/server.ts"), projectDir,
    "--port", String(port), "--no-open",
  ], { cwd: repository, stdout: "pipe", stderr: "pipe" });

  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (!output.includes("INM Studio:")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Studio stopped before startup: ${output}`);
      output += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();
    const response = await fetch(`http://localhost:${port}/api/projects/ironworks/data`);
    expect(response.status).toBe(200);
    const data = await response.json() as { selectedRun: string | null; runs: unknown[] };
    expect(data.selectedRun).toBeNull();
    expect(data.runs).toEqual([]);

    const catalogResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments`);
    expect(catalogResponse.status).toBe(200);
    const catalog = await catalogResponse.json() as { experiments: Array<{ id: string; locked: boolean; cases: unknown[] }> };
    expect(catalog.experiments.map((experiment) => experiment.id)).toEqual([
      "autoresearch", "high-speed-transport", "power-priority", "power-satisfaction", "station-energy",
    ]);
    expect(catalog.experiments.every((experiment) => experiment.locked && experiment.cases.length > 0)).toBeTrue();

    const deepLink = await fetch(`http://localhost:${port}/ironworks/experiments/power-priority`);
    expect(deepLink.status).toBe(200);
    expect(deepLink.headers.get("content-type")).toContain("text/html");

    const expected = await evaluateBlueprintBenchmark(projectDir, "power-priority");
    const runResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`, { method: "POST" });
    expect(runResponse.status).toBe(200);
    const result = await runResponse.json() as { command: string; benchmark: string; verdict: string; scoreDelta: number; patch: unknown[] };
    expect(result).toEqual(expect.objectContaining({
      command: "benchmark", benchmark: expected.benchmark, verdict: expected.verdict,
      scoreDelta: expected.scoreDelta, patch: expected.patch,
    }));

    const methodResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`);
    expect(methodResponse.status).toBe(405);
    expect(await methodResponse.json()).toEqual({ code: "studio.method-not-allowed", error: "Method not allowed" });
    expect(await Bun.file(join(projectDir, "runs")).exists()).toBeFalse();
  } finally {
    child.kill();
    await child.exited;
  }
}, 30_000);
