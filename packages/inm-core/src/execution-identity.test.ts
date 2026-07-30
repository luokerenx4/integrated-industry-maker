import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildDesignProgramBrief,
  evaluateBlueprintBenchmark,
  loadBlueprintBenchmark,
  openFactoryProject,
} from "./index";

const ironworks = resolve(import.meta.dir, "../../../examples/ironworks");
const memoryFab = resolve(import.meta.dir, "../../../examples/memory-fab");

async function projectCopy(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "inm-execution-identity-"));
  await cp(ironworks, directory, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  return directory;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("selection-scoped execution identity", () => {
  test("unused project-local options change catalog inventory without changing selected execution", async () => {
    const directory = await projectCopy();
    const before = await openFactoryProject(directory);

    const processPath = join(directory, "processes", "smelt-iron-small-batch.process.json");
    const process = await readJson(join(directory, "processes", "smelt-iron.process.json"));
    await writeJson(processPath, {
      ...process,
      id: "smelt-iron-small-batch",
      name: "Smelt Iron Small Batch",
      durationTicks: 2500,
    });

    const smelterPath = join(directory, "assets", "devices", "smelter", "asset.json");
    const smelter = await readJson(smelterPath);
    const production = smelter.production as Record<string, unknown>;
    await writeJson(smelterPath, {
      ...smelter,
      production: {
        ...production,
        processes: [...production.processes as string[], "smelt-iron-small-batch"],
      },
    });

    const bufferSource = join(directory, "assets", "devices", "buffer");
    const bufferTarget = join(directory, "assets", "devices", "optional-buffer");
    await cp(bufferSource, bufferTarget, { recursive: true });
    const buffer = await readJson(join(bufferTarget, "asset.json"));
    await writeJson(join(bufferTarget, "asset.json"), {
      ...buffer,
      id: "optional-buffer",
      name: "Optional Buffer",
    });

    const after = await openFactoryProject(directory);
    expect(after.hashes.processCatalogHash).not.toBe(before.hashes.processCatalogHash);
    expect(after.hashes.deviceCatalogHash).not.toBe(before.hashes.deviceCatalogHash);
    expect(after.hashes.executionHash).toHaveLength(64);
    expect(after.hashes.executionHash).toBe(before.hashes.executionHash);

    const visualPath = join(directory, "assets", "devices", "smelter", "visual.json");
    const visual = await readJson(visualPath);
    const material = visual.material as Record<string, unknown>;
    await writeJson(visualPath, {
      ...visual,
      material: { ...material, baseColor: "#123456" },
    });
    const afterPresentation = await openFactoryProject(directory);
    expect(afterPresentation.hashes.deviceCatalogHash).not.toBe(after.hashes.deviceCatalogHash);
    expect(afterPresentation.hashes.executionHash).toBe(after.hashes.executionHash);
  });

  test("selecting an option and changing selected runtime or fixed inputs changes execution identity", async () => {
    const directory = await projectCopy();
    const before = await openFactoryProject(directory);

    const processPath = join(directory, "processes", "smelt-iron-small-batch.process.json");
    const process = await readJson(join(directory, "processes", "smelt-iron.process.json"));
    await writeJson(processPath, {
      ...process,
      id: "smelt-iron-small-batch",
      name: "Smelt Iron Small Batch",
      durationTicks: 2500,
    });
    const smelterPath = join(directory, "assets", "devices", "smelter", "asset.json");
    const smelter = await readJson(smelterPath);
    const production = smelter.production as Record<string, unknown>;
    await writeJson(smelterPath, {
      ...smelter,
      production: {
        ...production,
        processes: [...production.processes as string[], "smelt-iron-small-batch"],
      },
    });

    const blueprintPath = join(directory, "blueprints", "main.blueprint.json");
    const blueprint = await readJson(blueprintPath);
    const devices = blueprint.devices as Array<Record<string, unknown>>;
    const selected = devices.map((device) => device.id === "smelter-1"
      ? {
        ...device,
        recipe: {
          ...(device.recipe as Record<string, unknown>),
          process: "smelt-iron-small-batch",
        },
      }
      : device);
    await writeJson(blueprintPath, { ...blueprint, devices: selected });
    const selectedOption = await openFactoryProject(directory);
    expect(selectedOption.hashes.executionHash).not.toBe(before.hashes.executionHash);

    await writeFile(
      join(directory, "assets", "devices", "smelter", "runtime.ts"),
      `${await readFile(join(directory, "assets", "devices", "smelter", "runtime.ts"), "utf8")}\n// selected runtime revision\n`,
    );
    const changedRuntime = await openFactoryProject(directory);
    expect(changedRuntime.hashes.executionHash).not.toBe(selectedOption.hashes.executionHash);

    const alternateRuntimePath = join(directory, "assets", "devices", "smelter", "runtime-alternate.ts");
    await cp(join(directory, "assets", "devices", "smelter", "runtime.ts"), alternateRuntimePath);
    const withAlternateRuntimeFile = await openFactoryProject(directory);
    const selectedSmelter = await readJson(smelterPath);
    await writeJson(smelterPath, {
      ...selectedSmelter,
      runtime: {
        ...(selectedSmelter.runtime as Record<string, unknown>),
        entry: "runtime-alternate.ts",
      },
    });
    const changedRuntimeEntry = await openFactoryProject(directory);
    expect(changedRuntimeEntry.deviceAssets.smelter).toBeDefined();
    expect(withAlternateRuntimeFile.deviceAssets.smelter).toBeDefined();
    expect(changedRuntimeEntry.deviceAssets.smelter!.runtimeSourceHash)
      .toBe(withAlternateRuntimeFile.deviceAssets.smelter!.runtimeSourceHash);
    expect(changedRuntimeEntry.hashes.executionHash).not.toBe(withAlternateRuntimeFile.hashes.executionHash);

    const scenarioPath = join(directory, "scenarios", "baseline.scenario.json");
    const scenario = await readJson(scenarioPath);
    await writeJson(scenarioPath, { ...scenario, durationTicks: (scenario.durationTicks as number) + 1 });
    const changedScenario = await openFactoryProject(directory);
    expect(changedScenario.hashes.executionHash).not.toBe(changedRuntimeEntry.hashes.executionHash);
  });

  test("a locked baseline stays valid while its candidate selects a newly authored option", async () => {
    const directory = await projectCopy();
    const process = await readJson(join(directory, "processes", "smelt-iron.process.json"));
    await writeJson(join(directory, "processes", "smelt-iron-small-batch.process.json"), {
      ...process,
      id: "smelt-iron-small-batch",
      name: "Smelt Iron Small Batch",
      durationTicks: 2500,
    });
    const smelterPath = join(directory, "assets", "devices", "smelter", "asset.json");
    const smelter = await readJson(smelterPath);
    const production = smelter.production as Record<string, unknown>;
    await writeJson(smelterPath, {
      ...smelter,
      production: {
        ...production,
        processes: [...production.processes as string[], "smelt-iron-small-batch"],
      },
    });

    const candidatePath = join(directory, "blueprints", "autoresearch.blueprint.json");
    const candidate = await readJson(candidatePath);
    const devices = candidate.devices as Array<Record<string, unknown>>;
    await writeJson(candidatePath, {
      ...candidate,
      devices: devices.map((device) => device.id === "smelter-1"
        ? {
          ...device,
          recipe: {
            ...(device.recipe as Record<string, unknown>),
            process: "smelt-iron-small-batch",
          },
        }
        : device),
    });

    const benchmark = await loadBlueprintBenchmark(directory, "autoresearch");
    expect(benchmark.lock?.cases["normal-production"]).toEqual(expect.objectContaining({
      executionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(benchmark.lock?.cases["normal-production"]).not.toHaveProperty("processCatalogHash");
    const result = await evaluateBlueprintBenchmark(directory, "autoresearch", {
      caseExecution: "sequential",
    });
    expect(result.candidateBlueprint).toBe("autoresearch");
    expect(result.cases).toHaveLength(3);
  });

  test("the memory-fab small-batch portfolio does not own unrelated focused Design identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inm-memory-fab-execution-identity-"));
    await cp(memoryFab, directory, {
      recursive: true,
      filter: (source) =>
        !source.split("/").includes("runs")
        && !source.split("/").includes("design-runs")
        && !source.split("/").includes(".inm"),
    });
    const withPortfolio = await openFactoryProject(directory);
    const withPortfolioBrief = await buildDesignProgramBrief(directory, "inspection-supply-path");

    await rm(join(directory, "processes", "screen-commercial-dram-small-batch.process.json"));
    await rm(join(directory, "processes", "screen-performance-mix-small-batch.process.json"));
    const assetPath = join(directory, "assets", "devices", "dram-burn-in-rack", "asset.json");
    const asset = await readJson(assetPath);
    const production = asset.production as Record<string, unknown>;
    await writeJson(assetPath, {
      ...asset,
      production: {
        ...production,
        processes: (production.processes as string[]).filter((id) => !id.endsWith("-small-batch")),
      },
    });

    const withoutPortfolio = await openFactoryProject(directory);
    const withoutPortfolioBrief = await buildDesignProgramBrief(directory, "inspection-supply-path");
    expect(withoutPortfolio.hashes.processCatalogHash).not.toBe(withPortfolio.hashes.processCatalogHash);
    expect(withoutPortfolio.hashes.deviceCatalogHash).not.toBe(withPortfolio.hashes.deviceCatalogHash);
    expect(withoutPortfolio.hashes.executionHash).toBe(withPortfolio.hashes.executionHash);
    expect(withoutPortfolioBrief.driver.hashes).toEqual(withPortfolioBrief.driver.hashes);
  });
});
