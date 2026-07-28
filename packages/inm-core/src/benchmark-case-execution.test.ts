import { resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  createBenchmarkCaseExecutor,
  resolveBenchmarkCaseExecution,
  type BenchmarkCaseWorkerJob,
} from "./benchmark-case-execution";
import { loadFactoryProject } from "./loader";

test("Benchmark case execution remains sequential for small work and bounds parallel workers", () => {
  expect(resolveBenchmarkCaseExecution(1)).toEqual({ mode: "sequential", concurrency: 1 });
  expect(resolveBenchmarkCaseExecution(2)).toEqual({ mode: "sequential", concurrency: 1 });
  expect(resolveBenchmarkCaseExecution(5, "sequential")).toEqual({ mode: "sequential", concurrency: 1 });
  const parallel = resolveBenchmarkCaseExecution(128, "parallel");
  expect(parallel.mode).toBe("parallel");
  expect(parallel.concurrency).toBeGreaterThan(1);
  expect(parallel.concurrency).toBeLessThanOrEqual(8);
});

test("a failed worker wave is replaced cleanly and explicit disposal is terminal", async () => {
  const projectDir = resolve(import.meta.dir, "../../../examples/ironworks");
  const loaded = await loadFactoryProject(projectDir);
  const job = (id: string, root = projectDir): BenchmarkCaseWorkerJob => ({
    id,
    projectDir: root,
    selection: { world: "main", scenario: "baseline", objective: "default" },
    blueprintName: "main",
    blueprint: structuredClone(loaded.blueprint),
    seed: 42,
    includeTrace: false,
  });
  const executor = createBenchmarkCaseExecutor({ mode: "parallel", concurrency: 2 });

  await expect(executor.execute([job("broken", resolve(projectDir, "missing"))])).rejects.toThrow();
  const results = await executor.execute([job("first"), job("second")]);
  expect(results.map((result) => result.id)).toEqual(["first", "second"]);
  expect(executor.stats()).toEqual({ workerStarts: 3, completedJobs: 2, completedWaves: 1 });

  executor.dispose();
  await expect(executor.execute([job("after-dispose")])).rejects.toThrow("disposed");
}, 15_000);
