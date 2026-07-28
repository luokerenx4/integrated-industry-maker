import { expect, test } from "bun:test";
import { resolveBenchmarkCaseExecution } from "./benchmark-case-execution";

test("Benchmark case execution remains sequential for small work and bounds parallel workers", () => {
  expect(resolveBenchmarkCaseExecution(1)).toEqual({ mode: "sequential", concurrency: 1 });
  expect(resolveBenchmarkCaseExecution(2)).toEqual({ mode: "sequential", concurrency: 1 });
  expect(resolveBenchmarkCaseExecution(5, "sequential")).toEqual({ mode: "sequential", concurrency: 1 });
  const parallel = resolveBenchmarkCaseExecution(128, "parallel");
  expect(parallel.mode).toBe("parallel");
  expect(parallel.concurrency).toBeGreaterThan(1);
  expect(parallel.concurrency).toBeLessThanOrEqual(8);
});
