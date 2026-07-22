import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { evaluateBlueprintBenchmark, hashValue, openProjectWorkbenchSnapshot, stableStringify, type Blueprint } from "@inm/core";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");

test("opening a project without runs does not write a Studio baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-readonly-"));
  const projectDir = join(root, "ironworks");
  await cp(ironworks, projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const candidateBlueprintPath = join(projectDir, "blueprints/power-priority-candidate.blueprint.json");
  const candidateBlueprint = JSON.parse(await readFile(candidateBlueprintPath, "utf8")) as Blueprint;
  const protectedIds = new Set(["z-critical-assembler", "z-critical-link-loader", "z-critical-link-unloader"]);
  const candidatePatch = candidateBlueprint.devices.flatMap((device, index) => !protectedIds.has(device.id) ? [] : [device.policy ? {
    op: "add" as const, path: `/devices/${index}/policy/powerPriority`, value: 10,
  } : {
    op: "add" as const, path: `/devices/${index}/policy`, value: { powerPriority: 10 },
  }]);
  await mkdir(join(projectDir, "candidates"));
  await writeFile(join(projectDir, "candidates/protect-critical-line.candidate.json"), `${stableStringify({
    version: 1, id: "protect-critical-line", name: "Protect critical sorter line", benchmark: "power-priority",
    hypothesis: "Critical production and transport should preempt discretionary loads.",
    baseCandidateHash: hashValue(candidateBlueprint), patch: candidatePatch,
  }, 2)}\n`);
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

    const overviewResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/overview?world=main&blueprint=main&scenario=baseline&objective=default`);
    expect(overviewResponse.status).toBe(200);
    expect(await overviewResponse.json()).toEqual(await openProjectWorkbenchSnapshot(projectDir, {
      world: "main", blueprint: "main", scenario: "baseline", objective: "default",
    }));
    const invalidOverview = await fetch(`http://localhost:${port}/api/projects/ironworks/overview?blueprint=missing-blueprint`);
    expect(invalidOverview.status).toBe(400);
    expect(await invalidOverview.json()).toEqual(expect.objectContaining({
      code: "studio.request-failed", error: expect.stringContaining("missing-blueprint.blueprint.json"),
    }));
    const overviewMethod = await fetch(`http://localhost:${port}/api/projects/ironworks/overview`, { method: "POST" });
    expect(overviewMethod.status).toBe(405);

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
    const candidateDeepLink = await fetch(`http://localhost:${port}/ironworks/experiments/power-priority/candidates/protect-critical-line`);
    expect(candidateDeepLink.status).toBe(200);

    const candidatesResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates`);
    expect(candidatesResponse.status).toBe(200);
    expect((await candidatesResponse.json() as { candidates: Array<{ id: string }> }).candidates.map((item) => item.id)).toEqual(["protect-critical-line"]);

    const expected = await evaluateBlueprintBenchmark(projectDir, "power-priority");
    const runResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`, { method: "POST" });
    expect(runResponse.status).toBe(200);
    const result = await runResponse.json() as { command: string; benchmark: string; verdict: string; scoreDelta: number; patch: unknown[] };
    expect(result).toEqual(expect.objectContaining({
      command: "benchmark", benchmark: expected.benchmark, verdict: expected.verdict,
      scoreDelta: expected.scoreDelta, patch: expected.patch,
    }));

    const beforePreview = await readFile(candidateBlueprintPath, "utf8");
    const previewResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`, { method: "POST" });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json() as { currentCandidateHash: string; proposedCandidateHash: string; result: { verdict: string } };
    expect(preview.result.verdict).toBe("KEEP");
    expect(await readFile(candidateBlueprintPath, "utf8")).toBe(beforePreview);

    const applyResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/apply`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preview),
    });
    expect(applyResponse.status).toBe(200);
    expect(await readFile(candidateBlueprintPath, "utf8")).not.toBe(beforePreview);
    const staleResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`, { method: "POST" });
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toEqual(expect.objectContaining({ code: "candidate.stale-base" }));

    const methodResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`);
    expect(methodResponse.status).toBe(405);
    expect(await methodResponse.json()).toEqual({ code: "studio.method-not-allowed", error: "Method not allowed" });
    expect(await Bun.file(join(projectDir, "runs")).exists()).toBeFalse();
  } finally {
    child.kill();
    await child.exited;
  }
}, 30_000);
