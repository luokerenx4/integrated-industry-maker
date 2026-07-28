import {
  isTerminalStudioOperation,
  type StudioOperationListResponse,
  type StudioOperationSnapshot,
  type StudioOperationStartResponse,
  type StudioOperationSummary,
} from "./studio-operation-contract";

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
): Promise<StudioOperationStartResponse<TResult>> {
  return responseJson<StudioOperationStartResponse<TResult>>(await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }));
}

export async function listStudioOperations(projectId: string): Promise<StudioOperationSummary[]> {
  return (await responseJson<StudioOperationListResponse>(await fetch(operationRoot(projectId)))).operations;
}

export async function readStudioOperation<TResult>(
  projectId: string,
  operationId: string,
): Promise<StudioOperationSnapshot<TResult>> {
  return (await responseJson<{ operation: StudioOperationSnapshot<TResult> }>(await fetch(
    `${operationRoot(projectId)}/${encodeURIComponent(operationId)}`,
  ))).operation;
}

export async function cancelStudioOperation(
  projectId: string,
  operationId: string,
): Promise<StudioOperationSnapshot> {
  return (await responseJson<{ operation: StudioOperationSnapshot }>(await fetch(
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
  initial: StudioOperationSnapshot<TResult>,
  onSnapshot: (snapshot: StudioOperationSnapshot<TResult>) => void,
  signal: AbortSignal,
): Promise<StudioOperationSnapshot<TResult>> {
  let snapshot = initial;
  onSnapshot(snapshot);
  while (!isTerminalStudioOperation(snapshot.status)) {
    await delay(250, signal);
    signal.throwIfAborted();
    snapshot = await readStudioOperation<TResult>(projectId, snapshot.id);
    onSnapshot(snapshot);
  }
  return snapshot;
}
