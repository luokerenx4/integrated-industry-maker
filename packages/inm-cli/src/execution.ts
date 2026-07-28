import {
  createOperationExecutionState,
  isOperationExecutionCancellation,
  operationExecutionError,
  type OperationExecutionArtifact,
  type OperationExecutionProgress,
  type OperationExecutionState,
  type OperationExecutionSubject,
} from "@inm/core";

export class CliExecutionFailure extends Error {
  constructor(
    public readonly original: unknown,
    public readonly execution: OperationExecutionState,
  ) {
    super(original instanceof Error ? original.message : String(original), { cause: original });
    this.name = "CliExecutionFailure";
  }
}

export class CliOperationExecution {
  private readonly startedPerformanceMs = performance.now();
  private readonly stateValue: OperationExecutionState;

  constructor(
    projectId: string,
    subject: OperationExecutionSubject,
    signal?: AbortSignal,
  ) {
    this.stateValue = createOperationExecutionState(projectId, subject);
    const requestCancellation = () => {
      const now = new Date().toISOString();
      this.stateValue.cancelRequestedAt ??= now;
      this.stateValue.updatedAt = now;
    };
    if (signal?.aborted) requestCancellation();
    else signal?.addEventListener("abort", requestCancellation, { once: true });
  }

  snapshot(): OperationExecutionState {
    return structuredClone(this.stateValue);
  }

  report(progress: OperationExecutionProgress): void {
    this.stateValue.progress = structuredClone(progress);
    this.stateValue.progressEvents += 1;
    this.stateValue.updatedAt = new Date().toISOString();
  }

  complete(artifacts: OperationExecutionArtifact[]): OperationExecutionState {
    const now = new Date().toISOString();
    this.stateValue.status = "completed";
    this.stateValue.artifacts = structuredClone(artifacts);
    this.stateValue.error = null;
    this.stateValue.updatedAt = now;
    this.stateValue.completedAt = now;
    this.stateValue.durationMs = Math.max(0, performance.now() - this.startedPerformanceMs);
    return this.snapshot();
  }

  fail(error: unknown, signal?: AbortSignal): CliExecutionFailure {
    const now = new Date().toISOString();
    this.stateValue.status = isOperationExecutionCancellation(error, signal) ? "cancelled" : "failed";
    this.stateValue.error = operationExecutionError(error, signal);
    this.stateValue.updatedAt = now;
    this.stateValue.completedAt = now;
    this.stateValue.durationMs = Math.max(0, performance.now() - this.startedPerformanceMs);
    return new CliExecutionFailure(error, this.snapshot());
  }
}
