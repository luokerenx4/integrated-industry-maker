import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { StudioOperationRegistry } from "./operation-registry";
import { isTerminalStudioOperation } from "./studio-operation-contract";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "inm-studio-operation-"));
}

async function completed(registry: StudioOperationRegistry, root: string, id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = await registry.get(root, id);
    if (snapshot && isTerminalStudioOperation(snapshot.status)) return snapshot;
    await Bun.sleep(5);
  }
  throw new Error(`Operation '${id}' did not complete`);
}

test("Studio operation registry retains progress and result independently of the starting request", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  const started = await registry.start(root, "test-project", { kind: "benchmark", benchmarkId: "bounded" }, async ({ report }) => {
    report({
      version: 2, sequence: 1, phase: "baseline-case-started", benchmark: "bounded",
      case: { id: "base", name: "Base", index: 1, total: 1 },
      work: { completed: 0, total: 2 }, evaluationId: "benchmark:bounded", timing: {},
    });
    return { verdict: "KEEP" };
  });
  expect(started.reused).toBeFalse();

  const result = await completed(registry, root, started.operation.id);
  expect(result).toEqual(expect.objectContaining({
    id: started.operation.id,
    projectId: "test-project",
    status: "completed",
    progress: expect.objectContaining({ phase: "baseline-case-started" }),
    progressLog: [expect.objectContaining({ phase: "baseline-case-started" })],
    result: { verdict: "KEEP" },
    error: null,
  }));

  const reopened = await new StudioOperationRegistry().get(root, started.operation.id);
  expect(reopened).toEqual(result);
});

test("Studio operation registry deduplicates active exact subjects and cancels through a retained identity", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  const subject = { kind: "design-run" as const, programId: "focused", maxCandidates: 1 };
  const started = await registry.start(root, "test-project", subject, async ({ signal }) => {
    await new Promise<void>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    return { completed: true };
  });
  const reused = await registry.start(root, "test-project", subject, async () => ({ unreachable: true }));
  expect(reused.reused).toBeTrue();
  expect(reused.operation.id).toBe(started.operation.id);

  const requested = await registry.cancel(root, started.operation.id);
  expect(requested?.cancelRequestedAt).not.toBeNull();
  const cancelled = await completed(registry, root, started.operation.id);
  expect(cancelled).toEqual(expect.objectContaining({
    status: "cancelled",
    error: { code: "studio.operation-cancelled", message: "Operation cancelled by the operator." },
  }));
});

test("Studio operation registry reports an orphaned running snapshot as interrupted after restart", async () => {
  const root = await project();
  const first = new StudioOperationRegistry();
  const started = await first.start(root, "test-project", { kind: "benchmark", benchmarkId: "orphaned" }, async () =>
    new Promise<never>(() => undefined));

  const reopened = await new StudioOperationRegistry().get(root, started.operation.id);
  expect(reopened).toEqual(expect.objectContaining({
    status: "interrupted",
    error: expect.objectContaining({ code: "studio.operation-interrupted" }),
  }));
});

test("Studio operation registry bounds retained terminal snapshots per project", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry(2);
  for (const benchmarkId of ["one", "two", "three"]) {
    const started = await registry.start(root, "test-project", { kind: "benchmark", benchmarkId }, async () => ({ benchmarkId }));
    await completed(registry, root, started.operation.id);
  }
  const snapshots = await registry.list(root);
  expect(snapshots).toHaveLength(2);
  expect(snapshots.map((snapshot) => (snapshot.subject as { benchmarkId: string }).benchmarkId)).toEqual(["three", "two"]);
});
