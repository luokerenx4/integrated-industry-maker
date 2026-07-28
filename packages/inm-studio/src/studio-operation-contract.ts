import type { BlueprintBenchmarkProgress, DesignRunProgress } from "@inm/core";

export type StudioOperationKind = "benchmark" | "candidate-preview" | "design-run" | "design-continue";
export type StudioOperationStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type StudioOperationProgress = BlueprintBenchmarkProgress | DesignRunProgress;

export type StudioOperationSubject =
  | { kind: "benchmark"; benchmarkId: string }
  | { kind: "candidate-preview"; benchmarkId: string; candidateId: string }
  | { kind: "design-run"; programId: string; maxCandidates: number }
  | { kind: "design-continue"; programId: string; sourceResultHash: string; maxCandidates: number };

export interface StudioOperationError {
  code: string;
  message: string;
}

export interface StudioOperationSnapshot<TResult = unknown> {
  version: 1;
  id: string;
  projectId: string;
  kind: StudioOperationKind;
  subject: StudioOperationSubject;
  status: StudioOperationStatus;
  createdOrder: number;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  progress: StudioOperationProgress | null;
  progressLog: StudioOperationProgress[];
  result: TResult | null;
  error: StudioOperationError | null;
}

export interface StudioOperationStartResponse<TResult = unknown> {
  operation: StudioOperationSnapshot<TResult>;
  reused: boolean;
}

export interface StudioOperationSummary {
  version: 1;
  id: string;
  projectId: string;
  kind: StudioOperationKind;
  subject: StudioOperationSubject;
  status: StudioOperationStatus;
  createdOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  progressEvents: number;
  resultAvailable: boolean;
  error: StudioOperationError | null;
}

export interface StudioOperationListResponse {
  operations: StudioOperationSummary[];
}

export function isTerminalStudioOperation(status: StudioOperationStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted";
}

export function summarizeStudioOperation(snapshot: StudioOperationSnapshot): StudioOperationSummary {
  return {
    version: snapshot.version,
    id: snapshot.id,
    projectId: snapshot.projectId,
    kind: snapshot.kind,
    subject: snapshot.subject,
    status: snapshot.status,
    createdOrder: snapshot.createdOrder,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    completedAt: snapshot.completedAt,
    cancelRequestedAt: snapshot.cancelRequestedAt,
    progressEvents: snapshot.progressLog.length,
    resultAvailable: snapshot.result !== null,
    error: snapshot.error,
  };
}
