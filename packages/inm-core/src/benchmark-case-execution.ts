import { availableParallelism } from "node:os";
import type { FactoryBlueprintEvaluation } from "./blueprint-comparison";
import type { ProjectSelection } from "./loader";
import type { Blueprint, SimulationResult } from "./types";

export type BenchmarkCaseExecutionMode = "sequential" | "parallel";
export type BenchmarkCaseExecutionRequest = "auto" | BenchmarkCaseExecutionMode;

export interface BenchmarkCaseExecution {
  mode: BenchmarkCaseExecutionMode;
  concurrency: number;
}

export interface BenchmarkCaseWorkerJob {
  id: string;
  projectDir: string;
  selection: Required<Pick<ProjectSelection, "world" | "scenario" | "objective">>;
  blueprintName: string;
  blueprint: Blueprint;
  seed: number;
  includeTrace: boolean;
}

export interface BenchmarkCaseWorkerResult {
  id: string;
  evaluation: FactoryBlueprintEvaluation;
  simulation?: SimulationResult;
  timing: {
    durationMs: number;
    compileMs: number;
    evaluationMs: number;
  };
}

interface BenchmarkCaseWorkerSuccess {
  type: "completed";
  result: BenchmarkCaseWorkerResult;
}

interface BenchmarkCaseWorkerFailure {
  type: "failed";
  id: string;
  error: { name: string; message: string; stack?: string };
}

export type BenchmarkCaseWorkerResponse = BenchmarkCaseWorkerSuccess | BenchmarkCaseWorkerFailure;

export function resolveBenchmarkCaseExecution(
  caseCount: number,
  request: BenchmarkCaseExecutionRequest = "auto",
): BenchmarkCaseExecution {
  if (!Number.isSafeInteger(caseCount) || caseCount < 1) throw new Error("Benchmark case count must be a positive integer");
  if (request === "sequential" || (request === "auto" && caseCount < 3)) return { mode: "sequential", concurrency: 1 };
  const concurrency = Math.min(caseCount, 8, Math.max(1, availableParallelism() - 1));
  return concurrency > 1 ? { mode: "parallel", concurrency } : { mode: "sequential", concurrency: 1 };
}

function cancellationReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Benchmark case execution cancelled", "AbortError");
}

function runWorkerJob(
  job: BenchmarkCaseWorkerJob,
  signal: AbortSignal | undefined,
  workers: Set<Worker>,
): Promise<BenchmarkCaseWorkerResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancellationReason(signal));
      return;
    }
    const worker = new Worker(new URL("./benchmark-case-worker.ts", import.meta.url));
    workers.add(worker);
    let settled = false;
    const cleanup = () => {
      workers.delete(worker);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const complete = (operation: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const abort = () => complete(() => reject(cancellationReason(signal!)));
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<BenchmarkCaseWorkerResponse>) => {
      const message = event.data;
      if (message.type === "completed") complete(() => resolve(message.result));
      else {
        const error = new Error(message.error.message);
        error.name = message.error.name;
        if (message.error.stack) error.stack = message.error.stack;
        complete(() => reject(error));
      }
    };
    worker.onerror = (event) => complete(() => reject(event.error ?? new Error(event.message)));
    worker.postMessage(job);
  });
}

export async function executeBenchmarkCaseWorkers(
  jobs: BenchmarkCaseWorkerJob[],
  execution: BenchmarkCaseExecution,
  options: {
    signal?: AbortSignal;
    onStarted?: (job: BenchmarkCaseWorkerJob, index: number) => void;
  } = {},
): Promise<BenchmarkCaseWorkerResult[]> {
  if (execution.mode !== "parallel" || execution.concurrency < 2) {
    throw new Error("Worker execution requires parallel Benchmark case execution");
  }
  const results = new Array<BenchmarkCaseWorkerResult>(jobs.length);
  const workers = new Set<Worker>();
  let nextIndex = 0;
  try {
    const slots = Array.from({ length: Math.min(execution.concurrency, jobs.length) }, async () => {
      while (true) {
        options.signal?.throwIfAborted();
        const index = nextIndex++;
        if (index >= jobs.length) return;
        const job = jobs[index]!;
        options.onStarted?.(job, index);
        results[index] = await runWorkerJob(job, options.signal, workers);
      }
    });
    await Promise.all(slots);
    return results;
  } finally {
    for (const worker of workers) worker.terminate();
  }
}
