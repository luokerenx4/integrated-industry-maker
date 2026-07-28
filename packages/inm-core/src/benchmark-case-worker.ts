/// <reference lib="webworker" />

import { evaluateFactoryBlueprintWithTrace } from "./blueprint-comparison";
import type {
  BenchmarkCaseWorkerJob,
  BenchmarkCaseWorkerResponse,
} from "./benchmark-case-execution";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject } from "./loader";

self.postMessage({ type: "ready" } satisfies BenchmarkCaseWorkerResponse);

self.onmessage = async (event: MessageEvent<BenchmarkCaseWorkerJob>) => {
  const job = event.data;
  try {
    const startedAt = performance.now();
    const compileStartedAt = performance.now();
    const loaded = await loadFactoryProject(job.projectDir, {
      ...job.selection,
      blueprint: job.blueprintName,
    });
    const project = compileFactoryProject({ ...loaded, blueprint: job.blueprint });
    const compileMs = performance.now() - compileStartedAt;
    const evaluationStartedAt = performance.now();
    const trace = evaluateFactoryBlueprintWithTrace(project, job.blueprintName, job.seed);
    const evaluationMs = performance.now() - evaluationStartedAt;
    self.postMessage({
      type: "completed",
      result: {
        id: job.id,
        evaluation: trace.evaluation,
        ...(job.includeTrace ? { simulation: trace.simulation } : {}),
        timing: { durationMs: performance.now() - startedAt, compileMs, evaluationMs },
      },
    } satisfies BenchmarkCaseWorkerResponse);
  } catch (error) {
    const value = error instanceof Error ? error : new Error(String(error));
    self.postMessage({
      type: "failed",
      id: job.id,
      error: {
        name: value.name,
        message: value.message,
        ...(value.stack ? { stack: value.stack } : {}),
      },
    } satisfies BenchmarkCaseWorkerResponse);
  }
};
