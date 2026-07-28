import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { StudioOperationRegistry } from "./operation-registry";
import { isTerminalOperationExecution } from "@inm/core";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "inm-studio-operation-"));
}

async function completed(registry: StudioOperationRegistry, root: string, id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = await registry.get(root, id);
    if (snapshot && isTerminalOperationExecution(snapshot.status)) return snapshot;
    await Bun.sleep(5);
  }
  throw new Error(`Operation '${id}' did not complete`);
}

test("Studio operation registry retains progress and result independently of the starting request", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  const started = await registry.start(root, "test-project", { kind: "benchmark", benchmarkId: "bounded" }, async ({ report }) => {
    report({
      version: 3, sequence: 1, phase: "baseline-case-started", benchmark: "bounded",
      case: { id: "base", name: "Base", index: 1, total: 1 },
      work: { completed: 0, total: 2 }, execution: { mode: "sequential", concurrency: 1 },
      evaluationId: "benchmark:bounded", timing: {},
    });
    return { result: { verdict: "KEEP" }, artifacts: [] };
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

  const directory = join(root, ".inm", "operations", started.operation.id);
  expect((await readdir(directory)).sort()).toEqual(["progress.json", "result.json", "state.json"]);
  const state = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  expect(state).toEqual(expect.objectContaining({
    id: started.operation.id,
    status: "completed",
    progressEvents: 1,
    resultAvailable: true,
  }));
  expect("progressLog" in state).toBeFalse();
  expect("result" in state).toBeFalse();
  expect(await registry.list(root)).toEqual([
    expect.objectContaining({ id: started.operation.id, resultAvailable: true }),
  ]);

  const reopened = await new StudioOperationRegistry().get(root, started.operation.id);
  expect(reopened).toEqual(result);
});

test("Studio operation listing reads only committed lightweight state", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  const started = await registry.start(root, "test-project", { kind: "benchmark", benchmarkId: "dense" }, async ({ report }) => {
    report({
      version: 3, sequence: 1, phase: "baseline-case-started", benchmark: "dense",
      case: { id: "base", name: "Base", index: 1, total: 1 },
      work: { completed: 0, total: 2 }, execution: { mode: "sequential", concurrency: 1 },
      evaluationId: "benchmark:dense", timing: {},
    });
    return { result: { dense: "x".repeat(1_000_000) }, artifacts: [] };
  });
  await completed(registry, root, started.operation.id);
  const directory = join(root, ".inm", "operations", started.operation.id);
  await writeFile(join(directory, "progress.json"), "{invalid progress");
  await writeFile(join(directory, "result.json"), "{invalid result");

  const reopened = new StudioOperationRegistry();
  expect(await reopened.list(root)).toEqual([
    expect.objectContaining({
      id: started.operation.id,
      status: "completed",
      resultAvailable: true,
    }),
  ]);
  expect(await reopened.get(root, started.operation.id)).toBeNull();
});

test("Studio operation completion publishes result availability only after the dense result is durable", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = await registry.start(root, "test-project", { kind: "benchmark", benchmarkId: "atomic" }, async () => {
    await gate;
    return { result: { dense: "x".repeat(2_000_000) }, artifacts: [] };
  });
  release();

  let published = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    const summary = (await registry.list(root)).find((item) => item.id === started.operation.id);
    if (!summary?.resultAvailable) {
      await Bun.sleep(1);
      continue;
    }
    const stored = JSON.parse(await readFile(
      join(root, ".inm", "operations", started.operation.id, "result.json"),
      "utf8",
    ));
    expect(stored).toEqual(expect.objectContaining({
      formatVersion: 1,
      operationId: started.operation.id,
      result: { dense: expect.any(String) },
    }));
    expect(stored.result.dense).toHaveLength(2_000_000);
    published = true;
    break;
  }
  expect(published).toBeTrue();
});

test("Studio operation registry deletes unsupported combined pre-release snapshots", async () => {
  const root = await project();
  const directory = join(root, ".inm", "operations");
  await mkdir(directory, { recursive: true });
  const id = "mslegacy1-00000000-0000-4000-8000-000000000000";
  const legacy = join(directory, `${id}.json`);
  await writeFile(legacy, JSON.stringify({
    version: 1,
    id,
    projectId: "test-project",
    kind: "benchmark",
    subject: { kind: "benchmark", benchmarkId: "legacy" },
    status: "completed",
    progressLog: [],
    result: { unsupported: true },
  }));

  expect(await new StudioOperationRegistry().list(root)).toEqual([]);
  await expect(access(legacy)).rejects.toThrow();
});

test("Studio operation registry deduplicates active exact subjects and cancels through a retained identity", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  const subject = { kind: "design-run" as const, programId: "focused", maxCandidates: 1 };
  const started = await registry.start(root, "test-project", subject, async ({ signal }) => {
    await new Promise<void>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    return { result: { completed: true }, artifacts: [] };
  });
  const reused = await registry.start(root, "test-project", subject, async () => ({
    result: { unreachable: true },
    artifacts: [],
  }));
  expect(reused.reused).toBeTrue();
  expect(reused.operation.id).toBe(started.operation.id);

  const requested = await registry.cancel(root, started.operation.id);
  expect(requested?.cancelRequestedAt).not.toBeNull();
  const cancelled = await completed(registry, root, started.operation.id);
  expect(cancelled).toEqual(expect.objectContaining({
    status: "cancelled",
    error: { code: "operation.cancelled", message: "Operation cancelled by the operator." },
  }));
});

test("Studio operation completion wins when cancellation arrives after the runner's commit boundary", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry();
  let release!: () => void;
  const committed = new Promise<void>((resolve) => { release = resolve; });
  const started = await registry.start(root, "test-project", {
    kind: "candidate-apply", benchmarkId: "bounded", candidateId: "accepted",
  }, async () => {
    await committed;
    return {
      result: { applied: true },
      artifacts: [{ kind: "blueprint", id: "candidate", path: "/tmp/candidate.json", immutable: false }],
    };
  });
  await registry.cancel(root, started.operation.id);
  release();
  const finished = await completed(registry, root, started.operation.id);
  expect(finished).toEqual(expect.objectContaining({
    status: "completed",
    cancelRequestedAt: expect.any(String),
    result: { applied: true },
    artifacts: [{ kind: "blueprint", id: "candidate", path: "/tmp/candidate.json", immutable: false }],
    error: null,
  }));
});

test("Studio operation registry reports an orphaned running snapshot as interrupted after restart", async () => {
  const root = await project();
  const first = new StudioOperationRegistry();
  const started = await first.start(root, "test-project", { kind: "benchmark", benchmarkId: "orphaned" }, async () =>
    new Promise<never>(() => undefined));

  const second = new StudioOperationRegistry();
  expect(await second.list(root)).toEqual([
    expect.objectContaining({
      id: started.operation.id,
      status: "interrupted",
      resultAvailable: false,
      error: expect.objectContaining({ code: "operation.interrupted" }),
    }),
  ]);
  const reopened = await second.get(root, started.operation.id);
  expect(reopened).toEqual(expect.objectContaining({
    status: "interrupted",
    error: expect.objectContaining({ code: "operation.interrupted" }),
  }));
});

test("Studio operation registry bounds retained terminal snapshots per project", async () => {
  const root = await project();
  const registry = new StudioOperationRegistry(2);
  const ids: string[] = [];
  for (const benchmarkId of ["one", "two", "three"]) {
    const started = await registry.start(root, "test-project", { kind: "benchmark", benchmarkId }, async () => ({
      result: { benchmarkId },
      artifacts: [],
    }));
    ids.push(started.operation.id);
    await completed(registry, root, started.operation.id);
  }
  const snapshots = await registry.list(root);
  expect(snapshots).toHaveLength(2);
  expect(snapshots.map((snapshot) => (snapshot.subject as { benchmarkId: string }).benchmarkId)).toEqual(["three", "two"]);
  for (let attempt = 0; attempt < 100; attempt++) {
    const entries = await readdir(join(root, ".inm", "operations"), { withFileTypes: true });
    if (entries.filter((entry) => entry.isDirectory()).length === 2) break;
    await Bun.sleep(5);
  }
  expect((await readdir(join(root, ".inm", "operations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()).toEqual(ids.slice(1).sort());
  expect(await registry.get(root, ids[0]!)).toBeNull();
});
