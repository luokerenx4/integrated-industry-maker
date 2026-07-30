import { availableParallelism } from "node:os";
import type { FactoryBlueprintEvaluation } from "./blueprint-comparison";
import type { ProjectSelection } from "./loader";
import type { Blueprint, SimulationResult } from "./types";

export type BenchmarkCaseExecutionMode = "sequential" | "isolated" | "parallel";
export type BenchmarkCaseExecutionRequest = "auto" | "background" | BenchmarkCaseExecutionMode;

export interface BenchmarkCaseExecution {
  mode: BenchmarkCaseExecutionMode;
  concurrency: number;
}

export interface BenchmarkCaseWorkerJob {
  id: string;
  projectDir: string;
  selection: Required<Pick<ProjectSelection, "world" | "productionPlan" | "scenario" | "objective">>;
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
    workerStartupMs?: number;
    workerReused?: boolean;
    workerSlot?: number;
  };
}

interface BenchmarkCaseWorkerReady {
  type: "ready";
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

export type BenchmarkCaseWorkerResponse =
  | BenchmarkCaseWorkerReady
  | BenchmarkCaseWorkerSuccess
  | BenchmarkCaseWorkerFailure;

export interface BenchmarkCaseExecutorStats {
  workerStarts: number;
  completedJobs: number;
  completedWaves: number;
}

export interface BenchmarkCaseExecutor {
  readonly execution: BenchmarkCaseExecution;
  execute(
    jobs: BenchmarkCaseWorkerJob[],
    options?: {
      signal?: AbortSignal;
      onStarted?: (job: BenchmarkCaseWorkerJob, index: number) => void;
    },
  ): Promise<BenchmarkCaseWorkerResult[]>;
  stats(): BenchmarkCaseExecutorStats;
  dispose(): void;
}

export function resolveBenchmarkCaseExecution(
  caseCount: number,
  request: BenchmarkCaseExecutionRequest = "auto",
): BenchmarkCaseExecution {
  if (!Number.isSafeInteger(caseCount) || caseCount < 1) throw new Error("Benchmark case count must be a positive integer");
  if (request === "sequential" || (request === "auto" && caseCount < 3)) return { mode: "sequential", concurrency: 1 };
  if (request === "isolated" || (request === "background" && caseCount < 3)) return { mode: "isolated", concurrency: 1 };
  const concurrency = Math.min(caseCount, 8, Math.max(1, availableParallelism() - 1));
  if (concurrency > 1) return { mode: "parallel", concurrency };
  return request === "auto" ? { mode: "sequential", concurrency: 1 } : { mode: "isolated", concurrency: 1 };
}

function cancellationReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Benchmark case execution cancelled", "AbortError");
}

function workerError(value: { name: string; message: string; stack?: string }): Error {
  const error = new Error(value.message);
  error.name = value.name;
  if (value.stack) error.stack = value.stack;
  return error;
}

class BenchmarkWorkerSlot {
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: unknown) => void;
  private readySettled = false;
  private active: {
    id: string;
    resolve: (result: BenchmarkCaseWorkerResult) => void;
    reject: (error: unknown) => void;
  } | undefined;
  private fatalError: unknown;
  private terminated = false;
  private completedJobs = 0;
  private readonly startedAt = performance.now();
  private startupMs = 0;

  constructor(private readonly index: number) {
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    void this.ready.catch(() => {});
    this.worker = new Worker(new URL("./benchmark-case-worker.ts", import.meta.url));
    this.worker.onmessage = (event: MessageEvent<BenchmarkCaseWorkerResponse>) => this.receive(event.data);
    this.worker.onerror = (event) => this.fail(event.error ?? new Error(event.message));
  }

  private receive(message: BenchmarkCaseWorkerResponse): void {
    if (message.type === "ready") {
      if (this.readySettled) return;
      this.readySettled = true;
      this.startupMs = performance.now() - this.startedAt;
      this.readyResolve();
      return;
    }
    const active = this.active;
    if (!active) {
      this.fail(new Error(`Benchmark worker slot ${this.index} returned '${message.type}' without an active job`));
      return;
    }
    if (message.type === "completed") {
      if (message.result.id !== active.id) {
        this.fail(new Error(
          `Benchmark worker slot ${this.index} returned job '${message.result.id}' while running '${active.id}'`,
        ));
        return;
      }
      this.active = undefined;
      active.resolve(message.result);
      return;
    }
    if (message.id !== active.id) {
      this.fail(new Error(`Benchmark worker slot ${this.index} failed job '${message.id}' while running '${active.id}'`));
      return;
    }
    this.active = undefined;
    active.reject(workerError(message.error));
  }

  private fail(error: unknown): void {
    this.fatalError = error;
    if (!this.readySettled) {
      this.readySettled = true;
      this.readyReject(error);
    }
    const active = this.active;
    this.active = undefined;
    active?.reject(error);
  }

  private async waitUntilReady(signal: AbortSignal | undefined): Promise<void> {
    if (!signal) {
      await this.ready;
      return;
    }
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(cancellationReason(signal));
      signal.addEventListener("abort", abort, { once: true });
      this.ready.then(
        () => {
          signal.removeEventListener("abort", abort);
          resolve();
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
  }

  async run(job: BenchmarkCaseWorkerJob, signal: AbortSignal | undefined): Promise<BenchmarkCaseWorkerResult> {
    if (this.terminated) throw new Error(`Benchmark worker slot ${this.index} is disposed`);
    if (this.fatalError) throw this.fatalError;
    if (this.active) throw new Error(`Benchmark worker slot ${this.index} is already running '${this.active.id}'`);
    const startedAt = performance.now();
    await this.waitUntilReady(signal);
    signal?.throwIfAborted();
    const reused = this.completedJobs > 0;
    const result = await new Promise<BenchmarkCaseWorkerResult>((resolve, reject) => {
      const abort = () => {
        this.active = undefined;
        reject(cancellationReason(signal!));
      };
      const finish = (operation: () => void) => {
        signal?.removeEventListener("abort", abort);
        operation();
      };
      this.active = {
        id: job.id,
        resolve: (value) => finish(() => resolve(value)),
        reject: (error) => finish(() => reject(error)),
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.worker.postMessage(job);
    });
    this.completedJobs++;
    return {
      ...result,
      timing: {
        ...result.timing,
        durationMs: performance.now() - startedAt,
        workerStartupMs: reused ? 0 : this.startupMs,
        workerReused: reused,
        workerSlot: this.index,
      },
    };
  }

  terminate(error: unknown): void {
    if (this.terminated) return;
    this.terminated = true;
    this.fail(error);
    this.worker.terminate();
  }
}

class ReusableBenchmarkCaseExecutor implements BenchmarkCaseExecutor {
  private slots: BenchmarkWorkerSlot[] = [];
  private busy = false;
  private disposed = false;
  private workerStarts = 0;
  private completedJobs = 0;
  private completedWaves = 0;

  constructor(readonly execution: BenchmarkCaseExecution) {
    const valid = execution.mode === "isolated"
      ? execution.concurrency === 1
      : execution.mode === "parallel" && execution.concurrency >= 2;
    if (!valid) {
      throw new Error("Benchmark case executor requires isolated ×1 or parallel ×2+ execution");
    }
  }

  private ensureSlots(count: number): BenchmarkWorkerSlot[] {
    while (this.slots.length < count) {
      this.slots.push(new BenchmarkWorkerSlot(this.slots.length));
      this.workerStarts++;
    }
    return this.slots.slice(0, count);
  }

  private reset(error: unknown): void {
    const slots = this.slots;
    this.slots = [];
    for (const slot of slots) slot.terminate(error);
  }

  async execute(
    jobs: BenchmarkCaseWorkerJob[],
    options: {
      signal?: AbortSignal;
      onStarted?: (job: BenchmarkCaseWorkerJob, index: number) => void;
    } = {},
  ): Promise<BenchmarkCaseWorkerResult[]> {
    if (this.disposed) throw new Error("Benchmark case executor is disposed");
    if (this.busy) throw new Error("Benchmark case executor already has an active wave");
    if (jobs.length === 0) return [];
    options.signal?.throwIfAborted();
    this.busy = true;
    const results = new Array<BenchmarkCaseWorkerResult>(jobs.length);
    let nextIndex = 0;
    try {
      const slots = this.ensureSlots(Math.min(this.execution.concurrency, jobs.length));
      await Promise.all(slots.map(async (slot) => {
        while (true) {
          options.signal?.throwIfAborted();
          const index = nextIndex++;
          if (index >= jobs.length) return;
          const job = jobs[index]!;
          options.onStarted?.(job, index);
          results[index] = await slot.run(job, options.signal);
        }
      }));
      this.completedJobs += jobs.length;
      this.completedWaves++;
      return results;
    } catch (error) {
      this.reset(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  stats(): BenchmarkCaseExecutorStats {
    return {
      workerStarts: this.workerStarts,
      completedJobs: this.completedJobs,
      completedWaves: this.completedWaves,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset(new Error("Benchmark case executor disposed"));
  }
}

export function createBenchmarkCaseExecutor(execution: BenchmarkCaseExecution): BenchmarkCaseExecutor {
  return new ReusableBenchmarkCaseExecutor(execution);
}
