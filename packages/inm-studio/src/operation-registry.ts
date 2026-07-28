import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableStringify } from "@inm/core";
import {
  createOperationExecutionState,
  isTerminalOperationExecution,
  isOperationExecutionCancellation,
  operationExecutionError,
  type OperationExecutionCompletion,
  type OperationExecutionProgress,
  type OperationExecutionSnapshot,
  type OperationExecutionStartResponse,
  type OperationExecutionSubject,
} from "@inm/core";

interface RuntimeOperation {
  projectDir: string;
  controller: AbortController;
  snapshot: OperationExecutionSnapshot;
  persistence: Promise<void>;
  startedPerformanceMs: number;
}

export interface StudioOperationRunnerContext {
  signal: AbortSignal;
  report: (progress: OperationExecutionProgress) => void;
}

const OPERATION_ID = /^[0-9a-z-]{12,80}$/;

function operationDirectory(projectDir: string): string {
  return join(projectDir, ".inm", "operations");
}

function operationPath(projectDir: string, operationId: string): string {
  if (!OPERATION_ID.test(operationId)) throw new Error(`Invalid Studio operation id '${operationId}'`);
  return join(operationDirectory(projectDir), `${operationId}.json`);
}

function parseSnapshot(value: unknown): OperationExecutionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<OperationExecutionSnapshot>;
  if (snapshot.version !== 1 || typeof snapshot.id !== "string" || !OPERATION_ID.test(snapshot.id)
    || typeof snapshot.projectId !== "string" || typeof snapshot.kind !== "string"
    || typeof snapshot.status !== "string" || !snapshot.subject || typeof snapshot.subject !== "object"
    || typeof snapshot.createdOrder !== "number" || !Number.isSafeInteger(snapshot.createdOrder)
    || typeof snapshot.createdAt !== "string" || typeof snapshot.updatedAt !== "string"
    || typeof snapshot.progressEvents !== "number" || !Number.isSafeInteger(snapshot.progressEvents)
    || !Array.isArray(snapshot.progressLog) || !Array.isArray(snapshot.artifacts)
    || (snapshot.durationMs !== null && typeof snapshot.durationMs !== "number")) return null;
  return snapshot as OperationExecutionSnapshot;
}

function operationKey(projectDir: string, subject: OperationExecutionSubject): string {
  return `${projectDir}\0${stableStringify(subject)}`;
}

export class StudioOperationRegistry {
  private readonly runtime = new Map<string, RuntimeOperation>();
  private lastCreatedOrder = 0;

  constructor(private readonly retention = 16) {
    if (!Number.isInteger(retention) || retention < 1) throw new Error("Studio operation retention must be a positive integer");
  }

  async start<TResult>(
    projectDir: string,
    projectId: string,
    subject: OperationExecutionSubject,
    runner: (context: StudioOperationRunnerContext) => Promise<OperationExecutionCompletion<TResult>>,
  ): Promise<OperationExecutionStartResponse<TResult>> {
    const key = operationKey(projectDir, subject);
    const active = [...this.runtime.values()].find((entry) =>
      operationKey(entry.projectDir, entry.snapshot.subject) === key
      && !isTerminalOperationExecution(entry.snapshot.status));
    if (active) return { operation: structuredClone(active.snapshot) as OperationExecutionSnapshot<TResult>, reused: true };

    const now = new Date();
    const createdOrder = Math.max(Date.now() * 1_000, this.lastCreatedOrder + 1);
    this.lastCreatedOrder = createdOrder;
    const snapshot: OperationExecutionSnapshot<TResult> = {
      ...createOperationExecutionState(projectId, subject, now),
      createdOrder,
      progressLog: [],
      result: null,
    };
    const entry: RuntimeOperation = {
      projectDir,
      controller: new AbortController(),
      snapshot,
      persistence: Promise.resolve(),
      startedPerformanceMs: performance.now(),
    };
    this.runtime.set(snapshot.id, entry);
    await this.persist(entry);
    void this.execute(entry, runner);
    return { operation: structuredClone(snapshot), reused: false };
  }

  async list(projectDir: string): Promise<OperationExecutionSnapshot[]> {
    const snapshots = await this.loadAll(projectDir);
    const retained: OperationExecutionSnapshot[] = [];
    let terminalCount = 0;
    for (const snapshot of snapshots) {
      if (isTerminalOperationExecution(snapshot.status) && ++terminalCount > this.retention) continue;
      retained.push(snapshot);
    }
    return retained;
  }

  private async loadAll(projectDir: string): Promise<OperationExecutionSnapshot[]> {
    await mkdir(operationDirectory(projectDir), { recursive: true });
    const disk = new Map<string, OperationExecutionSnapshot>();
    for (const entry of await readdir(operationDirectory(projectDir), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const snapshot = await this.get(projectDir, entry.name.slice(0, -5));
      if (snapshot) disk.set(snapshot.id, snapshot);
    }
    for (const entry of this.runtime.values()) if (entry.projectDir === projectDir) {
      disk.set(entry.snapshot.id, structuredClone(entry.snapshot));
    }
    return [...disk.values()].sort((left, right) =>
      right.createdOrder - left.createdOrder || right.id.localeCompare(left.id));
  }

  async get(projectDir: string, operationId: string): Promise<OperationExecutionSnapshot | null> {
    const active = this.runtime.get(operationId);
    if (active?.projectDir === projectDir) {
      if (isTerminalOperationExecution(active.snapshot.status)) await active.persistence;
      return structuredClone(active.snapshot);
    }
    const snapshot = await this.read(projectDir, operationId);
    if (!snapshot) return null;
    if (snapshot.status === "queued" || snapshot.status === "running") {
      const now = new Date().toISOString();
      snapshot.status = "interrupted";
      snapshot.updatedAt = now;
      snapshot.completedAt = now;
      snapshot.error = {
        code: "operation.interrupted",
        message: "Studio restarted before this operation reached an immutable result.",
      };
      snapshot.durationMs = snapshot.startedAt === null
        ? null
        : Math.max(0, Date.parse(now) - Date.parse(snapshot.startedAt));
      await this.write(projectDir, snapshot);
    }
    return snapshot;
  }

  async cancel(projectDir: string, operationId: string): Promise<OperationExecutionSnapshot | null> {
    const entry = this.runtime.get(operationId);
    if (!entry || entry.projectDir !== projectDir) return this.get(projectDir, operationId);
    if (isTerminalOperationExecution(entry.snapshot.status)) return structuredClone(entry.snapshot);
    const now = new Date().toISOString();
    entry.snapshot.cancelRequestedAt = now;
    entry.snapshot.updatedAt = now;
    entry.controller.abort(new DOMException("Operation cancelled by the operator", "AbortError"));
    await this.persist(entry);
    return structuredClone(entry.snapshot);
  }

  private async execute<TResult>(
    entry: RuntimeOperation,
    runner: (context: StudioOperationRunnerContext) => Promise<OperationExecutionCompletion<TResult>>,
  ): Promise<void> {
    try {
      const completion = await runner({
        signal: entry.controller.signal,
        report: (progress) => {
          entry.snapshot.progress = structuredClone(progress);
          entry.snapshot.progressLog.push(structuredClone(progress));
          entry.snapshot.progressEvents += 1;
          if (entry.snapshot.progressLog.length > 256) entry.snapshot.progressLog.splice(0, entry.snapshot.progressLog.length - 256);
          entry.snapshot.updatedAt = new Date().toISOString();
          void this.persist(entry);
        },
      });
      const now = new Date().toISOString();
      entry.snapshot.status = "completed";
      entry.snapshot.result = completion.result;
      entry.snapshot.artifacts = structuredClone(completion.artifacts);
      entry.snapshot.error = null;
      entry.snapshot.updatedAt = now;
      entry.snapshot.completedAt = now;
      entry.snapshot.durationMs = Math.max(0, performance.now() - entry.startedPerformanceMs);
    } catch (error) {
      const now = new Date().toISOString();
      entry.snapshot.status = isOperationExecutionCancellation(error, entry.controller.signal) ? "cancelled" : "failed";
      entry.snapshot.error = operationExecutionError(error, entry.controller.signal);
      entry.snapshot.updatedAt = now;
      entry.snapshot.completedAt = now;
      entry.snapshot.durationMs = Math.max(0, performance.now() - entry.startedPerformanceMs);
    }
    await this.persist(entry);
    this.runtime.delete(entry.snapshot.id);
    await this.prune(entry.projectDir);
  }

  private persist(entry: RuntimeOperation): Promise<void> {
    const snapshot = structuredClone(entry.snapshot);
    entry.persistence = entry.persistence.then(() => this.write(entry.projectDir, snapshot));
    return entry.persistence;
  }

  private async write(projectDir: string, snapshot: OperationExecutionSnapshot): Promise<void> {
    const directory = operationDirectory(projectDir);
    await mkdir(directory, { recursive: true });
    const target = operationPath(projectDir, snapshot.id);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${stableStringify(snapshot, 2)}\n`);
    await rename(temporary, target);
  }

  private async read(projectDir: string, operationId: string): Promise<OperationExecutionSnapshot | null> {
    try {
      return parseSnapshot(JSON.parse(await readFile(operationPath(projectDir, operationId), "utf8")));
    } catch {
      return null;
    }
  }

  private async prune(projectDir: string): Promise<void> {
    const snapshots = await this.loadAll(projectDir);
    const removable = snapshots.filter((snapshot) =>
      isTerminalOperationExecution(snapshot.status) && !this.runtime.has(snapshot.id));
    for (const snapshot of removable.slice(this.retention)) {
      await rm(operationPath(projectDir, snapshot.id), { force: true });
    }
  }
}
