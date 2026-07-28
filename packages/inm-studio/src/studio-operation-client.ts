import {
  isTerminalOperationExecution,
  type OperationExecutionListResponse,
  type OperationExecutionSnapshot,
  type OperationExecutionStartResponse,
  type OperationExecutionSummary,
} from "@inm/core/operation-execution";

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new Error(`${value.code ? `[${value.code}] ` : ""}${value.error ?? `Request failed (${response.status})`}`);
  return value;
}

function operationRoot(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/operations`;
}

export async function startStudioOperation<TResult>(
  url: string,
  body?: unknown,
): Promise<OperationExecutionStartResponse<TResult>> {
  return responseJson<OperationExecutionStartResponse<TResult>>(await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }));
}

export async function listStudioOperations(projectId: string): Promise<OperationExecutionSummary[]> {
  return (await responseJson<OperationExecutionListResponse>(await fetch(operationRoot(projectId)))).operations;
}

export async function readStudioOperation<TResult>(
  projectId: string,
  operationId: string,
): Promise<OperationExecutionSnapshot<TResult>> {
  return (await responseJson<{ operation: OperationExecutionSnapshot<TResult> }>(await fetch(
    `${operationRoot(projectId)}/${encodeURIComponent(operationId)}`,
  ))).operation;
}

export async function cancelStudioOperation(
  projectId: string,
  operationId: string,
): Promise<OperationExecutionSnapshot> {
  return (await responseJson<{ operation: OperationExecutionSnapshot }>(await fetch(
    `${operationRoot(projectId)}/${encodeURIComponent(operationId)}`,
    { method: "DELETE" },
  ))).operation;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

export async function followStudioOperation<TResult>(
  projectId: string,
  initial: OperationExecutionSnapshot<TResult>,
  onSnapshot: (snapshot: OperationExecutionSnapshot<TResult>) => void,
  signal: AbortSignal,
): Promise<OperationExecutionSnapshot<TResult>> {
  let snapshot = initial;
  onSnapshot(snapshot);
  while (!isTerminalOperationExecution(snapshot.status)) {
    await delay(250, signal);
    signal.throwIfAborted();
    snapshot = await readStudioOperation<TResult>(projectId, snapshot.id);
    onSnapshot(snapshot);
  }
  return snapshot;
}
