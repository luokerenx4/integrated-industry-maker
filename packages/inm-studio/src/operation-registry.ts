import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableStringify } from "@inm/core";
import {
  isTerminalStudioOperation,
  type StudioOperationError,
  type StudioOperationProgress,
  type StudioOperationSnapshot,
  type StudioOperationStartResponse,
  type StudioOperationSubject,
} from "./studio-operation-contract";

interface RuntimeOperation {
  projectDir: string;
  controller: AbortController;
  snapshot: StudioOperationSnapshot;
  persistence: Promise<void>;
}

export interface StudioOperationRunnerContext {
  signal: AbortSignal;
  report: (progress: StudioOperationProgress) => void;
}

const OPERATION_ID = /^[0-9a-z-]{12,80}$/;

function operationDirectory(projectDir: string): string {
  return join(projectDir, ".inm", "operations");
}

function operationPath(projectDir: string, operationId: string): string {
  if (!OPERATION_ID.test(operationId)) throw new Error(`Invalid Studio operation id '${operationId}'`);
  return join(operationDirectory(projectDir), `${operationId}.json`);
}

function snapshotError(error: unknown): StudioOperationError {
  const value = error as { code?: unknown; message?: unknown };
  return {
    code: typeof value?.code === "string" ? value.code : "studio.operation-failed",
    message: typeof value?.message === "string" ? value.message : String(error),
  };
}

function aborted(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError");
}

function parseSnapshot(value: unknown): StudioOperationSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<StudioOperationSnapshot>;
  if (snapshot.version !== 1 || typeof snapshot.id !== "string" || !OPERATION_ID.test(snapshot.id)
    || typeof snapshot.projectId !== "string" || typeof snapshot.kind !== "string"
    || typeof snapshot.status !== "string" || !snapshot.subject || typeof snapshot.subject !== "object"
    || typeof snapshot.createdOrder !== "number" || !Number.isSafeInteger(snapshot.createdOrder)
    || typeof snapshot.createdAt !== "string" || typeof snapshot.updatedAt !== "string"
    || !Array.isArray(snapshot.progressLog)) return null;
  return snapshot as StudioOperationSnapshot;
}

function operationKey(projectDir: string, subject: StudioOperationSubject): string {
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
    subject: StudioOperationSubject,
    runner: (context: StudioOperationRunnerContext) => Promise<TResult>,
  ): Promise<StudioOperationStartResponse<TResult>> {
    const key = operationKey(projectDir, subject);
    const active = [...this.runtime.values()].find((entry) =>
      operationKey(entry.projectDir, entry.snapshot.subject) === key
      && !isTerminalStudioOperation(entry.snapshot.status));
    if (active) return { operation: structuredClone(active.snapshot) as StudioOperationSnapshot<TResult>, reused: true };

    const now = new Date().toISOString();
    const createdOrder = Math.max(Date.now() * 1_000, this.lastCreatedOrder + 1);
    this.lastCreatedOrder = createdOrder;
    const snapshot: StudioOperationSnapshot<TResult> = {
      version: 1,
      id: `${Date.now().toString(36)}-${randomUUID()}`,
      projectId,
      kind: subject.kind,
      subject,
      status: "running",
      createdOrder,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      cancelRequestedAt: null,
      progress: null,
      progressLog: [],
      result: null,
      error: null,
    };
    const entry: RuntimeOperation = {
      projectDir,
      controller: new AbortController(),
      snapshot,
      persistence: Promise.resolve(),
    };
    this.runtime.set(snapshot.id, entry);
    await this.persist(entry);
    void this.execute(entry, runner);
    return { operation: structuredClone(snapshot), reused: false };
  }

  async list(projectDir: string): Promise<StudioOperationSnapshot[]> {
    const snapshots = await this.loadAll(projectDir);
    const retained: StudioOperationSnapshot[] = [];
    let terminalCount = 0;
    for (const snapshot of snapshots) {
      if (isTerminalStudioOperation(snapshot.status) && ++terminalCount > this.retention) continue;
      retained.push(snapshot);
    }
    return retained;
  }

  private async loadAll(projectDir: string): Promise<StudioOperationSnapshot[]> {
    await mkdir(operationDirectory(projectDir), { recursive: true });
    const disk = new Map<string, StudioOperationSnapshot>();
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

  async get(projectDir: string, operationId: string): Promise<StudioOperationSnapshot | null> {
    const active = this.runtime.get(operationId);
    if (active?.projectDir === projectDir) {
      if (isTerminalStudioOperation(active.snapshot.status)) await active.persistence;
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
        code: "studio.operation-interrupted",
        message: "Studio restarted before this operation reached an immutable result.",
      };
      await this.write(projectDir, snapshot);
    }
    return snapshot;
  }

  async cancel(projectDir: string, operationId: string): Promise<StudioOperationSnapshot | null> {
    const entry = this.runtime.get(operationId);
    if (!entry || entry.projectDir !== projectDir) return this.get(projectDir, operationId);
    if (isTerminalStudioOperation(entry.snapshot.status)) return structuredClone(entry.snapshot);
    const now = new Date().toISOString();
    entry.snapshot.cancelRequestedAt = now;
    entry.snapshot.updatedAt = now;
    entry.controller.abort(new DOMException("Studio operation cancelled", "AbortError"));
    await this.persist(entry);
    return structuredClone(entry.snapshot);
  }

  private async execute<TResult>(
    entry: RuntimeOperation,
    runner: (context: StudioOperationRunnerContext) => Promise<TResult>,
  ): Promise<void> {
    try {
      const result = await runner({
        signal: entry.controller.signal,
        report: (progress) => {
          entry.snapshot.progress = structuredClone(progress);
          entry.snapshot.progressLog.push(structuredClone(progress));
          if (entry.snapshot.progressLog.length > 256) entry.snapshot.progressLog.splice(0, entry.snapshot.progressLog.length - 256);
          entry.snapshot.updatedAt = new Date().toISOString();
          void this.persist(entry);
        },
      });
      entry.controller.signal.throwIfAborted();
      const now = new Date().toISOString();
      entry.snapshot.status = "completed";
      entry.snapshot.result = result;
      entry.snapshot.error = null;
      entry.snapshot.updatedAt = now;
      entry.snapshot.completedAt = now;
    } catch (error) {
      const now = new Date().toISOString();
      entry.snapshot.status = aborted(error, entry.controller.signal) ? "cancelled" : "failed";
      entry.snapshot.error = entry.snapshot.status === "cancelled"
        ? { code: "studio.operation-cancelled", message: "Operation cancelled by the operator." }
        : snapshotError(error);
      entry.snapshot.updatedAt = now;
      entry.snapshot.completedAt = now;
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

  private async write(projectDir: string, snapshot: StudioOperationSnapshot): Promise<void> {
    const directory = operationDirectory(projectDir);
    await mkdir(directory, { recursive: true });
    const target = operationPath(projectDir, snapshot.id);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${stableStringify(snapshot, 2)}\n`);
    await rename(temporary, target);
  }

  private async read(projectDir: string, operationId: string): Promise<StudioOperationSnapshot | null> {
    try {
      return parseSnapshot(JSON.parse(await readFile(operationPath(projectDir, operationId), "utf8")));
    } catch {
      return null;
    }
  }

  private async prune(projectDir: string): Promise<void> {
    const snapshots = await this.loadAll(projectDir);
    const removable = snapshots.filter((snapshot) =>
      isTerminalStudioOperation(snapshot.status) && !this.runtime.has(snapshot.id));
    for (const snapshot of removable.slice(this.retention)) {
      await rm(operationPath(projectDir, snapshot.id), { force: true });
    }
  }
}
