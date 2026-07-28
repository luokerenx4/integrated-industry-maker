import type { BlueprintBenchmarkProgress } from "./benchmark";
import type { DesignRunProgress } from "./design-run";

export type OperationExecutionKind = "benchmark" | "candidate-preview" | "candidate-apply" | "design-run" | "design-continue";
export type OperationExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type OperationExecutionProgress = BlueprintBenchmarkProgress | DesignRunProgress;

export type OperationExecutionSubject =
  | { kind: "benchmark"; benchmarkId: string }
  | { kind: "candidate-preview"; benchmarkId: string; candidateId: string }
  | { kind: "candidate-apply"; benchmarkId: string; candidateId: string }
  | { kind: "design-run"; programId: string; maxCandidates: number }
  | { kind: "design-continue"; programId: string; sourceResultHash: string; maxCandidates: number };

export interface OperationExecutionArtifact {
  kind: "run" | "blueprint" | "candidate-review" | "design-run";
  id: string;
  path: string;
  immutable: boolean;
}

export interface OperationExecutionError {
  code: string;
  message: string;
}

export interface OperationExecutionState {
  version: 1;
  id: string;
  projectId: string;
  kind: OperationExecutionKind;
  subject: OperationExecutionSubject;
  status: OperationExecutionStatus;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  durationMs: number | null;
  progress: OperationExecutionProgress | null;
  progressEvents: number;
  artifacts: OperationExecutionArtifact[];
  error: OperationExecutionError | null;
}

export interface OperationExecutionSnapshot<TResult = unknown> extends OperationExecutionState {
  createdOrder: number;
  progressLog: OperationExecutionProgress[];
  result: TResult | null;
}

export interface OperationExecutionCompletion<TResult> {
  result: TResult;
  artifacts: OperationExecutionArtifact[];
}

export interface OperationExecutionStartResponse<TResult = unknown> {
  operation: OperationExecutionSnapshot<TResult>;
  reused: boolean;
}

export interface OperationExecutionSummary extends OperationExecutionState {
  createdOrder: number;
  resultAvailable: boolean;
}

export interface OperationExecutionListResponse {
  operations: OperationExecutionSummary[];
}

export function createOperationExecutionState(
  projectId: string,
  subject: OperationExecutionSubject,
  now = new Date(),
): OperationExecutionState {
  const timestamp = now.toISOString();
  return {
    version: 1,
    id: `${now.getTime().toString(36)}-${crypto.randomUUID()}`,
    projectId,
    kind: subject.kind,
    subject,
    status: "running",
    createdAt: timestamp,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    cancelRequestedAt: null,
    durationMs: null,
    progress: null,
    progressEvents: 0,
    artifacts: [],
    error: null,
  };
}

export function isTerminalOperationExecution(status: OperationExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted";
}

export function isOperationExecutionCancellation(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError");
}

export function operationExecutionError(error: unknown, signal?: AbortSignal): OperationExecutionError {
  if (isOperationExecutionCancellation(error, signal)) {
    return { code: "operation.cancelled", message: "Operation cancelled by the operator." };
  }
  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value?.code === "string" ? value.code : "runtime.failed",
    message: typeof value?.message === "string" ? value.message : String(error),
  };
}

export function summarizeOperationExecution(snapshot: OperationExecutionSnapshot): OperationExecutionSummary {
  const { progressLog: _, result, ...state } = snapshot;
  return { ...state, resultAvailable: snapshot.status === "completed" };
}
