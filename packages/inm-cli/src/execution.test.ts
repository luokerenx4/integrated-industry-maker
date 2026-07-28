import { expect, test } from "bun:test";
import { CliExecutionFailure, CliOperationExecution } from "./execution";

const progress = {
  version: 2 as const,
  sequence: 1,
  phase: "baseline-case-started" as const,
  benchmark: "bounded",
  case: { id: "base", name: "Base", index: 1, total: 1 },
  work: { completed: 0, total: 2 },
  evaluationId: "benchmark:bounded",
  timing: {},
};

test("CLI execution retains one shared identity from progress through completion", () => {
  const execution = new CliOperationExecution("memory-fab", { kind: "benchmark", benchmarkId: "bounded" });
  const id = execution.snapshot().id;
  execution.report(progress);
  const completed = execution.complete([
    { kind: "candidate-review", id: "review", path: "/tmp/review.json", immutable: true },
  ]);
  expect(completed).toEqual(expect.objectContaining({
    id,
    projectId: "memory-fab",
    status: "completed",
    progress,
    progressEvents: 1,
    completedAt: expect.any(String),
    durationMs: expect.any(Number),
    artifacts: [{ kind: "candidate-review", id: "review", path: "/tmp/review.json", immutable: true }],
    error: null,
  }));
});

test("CLI execution records cooperative cancellation without completion artifacts", () => {
  const controller = new AbortController();
  const execution = new CliOperationExecution("memory-fab", {
    kind: "design-run", programId: "focused", maxCandidates: 1,
  }, controller.signal);
  controller.abort(new DOMException("requested", "AbortError"));
  const failure = execution.fail(controller.signal.reason, controller.signal);
  expect(failure).toBeInstanceOf(CliExecutionFailure);
  expect(failure.execution).toEqual(expect.objectContaining({
    status: "cancelled",
    cancelRequestedAt: expect.any(String),
    completedAt: expect.any(String),
    artifacts: [],
    error: { code: "operation.cancelled", message: "Operation cancelled by the operator." },
  }));
});

test("CLI execution preserves a domain failure code in the shared terminal state", () => {
  const execution = new CliOperationExecution("memory-fab", {
    kind: "candidate-preview", benchmarkId: "bounded", candidateId: "proposal",
  });
  const error = Object.assign(new Error("proposal base moved"), { code: "candidate.stale-base" });
  expect(execution.fail(error).execution).toEqual(expect.objectContaining({
    status: "failed",
    error: { code: "candidate.stale-base", message: "proposal base moved" },
  }));
});
