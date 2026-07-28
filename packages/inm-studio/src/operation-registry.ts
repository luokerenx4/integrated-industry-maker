import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableStringify } from "@inm/core";
import {
  createOperationExecutionState,
  isTerminalOperationExecution,
  isOperationExecutionCancellation,
  operationExecutionError,
  summarizeOperationExecution,
  type OperationExecutionCompletion,
  type OperationExecutionProgress,
  type OperationExecutionSnapshot,
  type OperationExecutionStartResponse,
  type OperationExecutionSubject,
  type OperationExecutionSummary,
} from "@inm/core";

interface RuntimeOperation {
  projectDir: string;
  controller: AbortController;
  snapshot: OperationExecutionSnapshot;
  committedSummary: OperationExecutionSummary | null;
  persistence: Promise<void>;
  startedPerformanceMs: number;
}

interface StoredOperationProgress {
  formatVersion: 1;
  operationId: string;
  progressEvents: number;
  progressLog: OperationExecutionProgress[];
}

interface StoredOperationResult {
  formatVersion: 1;
  operationId: string;
  result: unknown;
}

export interface StudioOperationRunnerContext {
  signal: AbortSignal;
  report: (progress: OperationExecutionProgress) => void;
}

const OPERATION_ID = /^[0-9a-z-]{12,80}$/;
const OPERATION_KINDS = new Set(["benchmark", "candidate-preview", "candidate-apply", "design-run", "design-continue"]);
const OPERATION_STATUSES = new Set(["queued", "running", "completed", "failed", "cancelled", "interrupted"]);

function operationDirectory(projectDir: string): string {
  return join(projectDir, ".inm", "operations");
}

function checkedOperationId(operationId: string): string {
  if (!OPERATION_ID.test(operationId)) throw new Error(`Invalid Studio operation id '${operationId}'`);
  return operationId;
}

function operationPath(projectDir: string, operationId: string): string {
  return join(operationDirectory(projectDir), checkedOperationId(operationId));
}

function statePath(projectDir: string, operationId: string): string {
  return join(operationPath(projectDir, operationId), "state.json");
}

function progressPath(projectDir: string, operationId: string): string {
  return join(operationPath(projectDir, operationId), "progress.json");
}

function resultPath(projectDir: string, operationId: string): string {
  return join(operationPath(projectDir, operationId), "result.json");
}

function legacyOperationPath(projectDir: string, operationId: string): string {
  return join(operationDirectory(projectDir), `${checkedOperationId(operationId)}.json`);
}

function parseSummary(value: unknown): OperationExecutionSummary | null {
  if (!value || typeof value !== "object") return null;
  const summary = value as Partial<OperationExecutionSummary> & Record<string, unknown>;
  if (summary.version !== 1 || typeof summary.id !== "string" || !OPERATION_ID.test(summary.id)
    || typeof summary.projectId !== "string" || typeof summary.kind !== "string" || !OPERATION_KINDS.has(summary.kind)
    || typeof summary.status !== "string" || !OPERATION_STATUSES.has(summary.status)
    || !summary.subject || typeof summary.subject !== "object"
    || (summary.subject as { kind?: unknown }).kind !== summary.kind
    || typeof summary.createdOrder !== "number" || !Number.isSafeInteger(summary.createdOrder) || summary.createdOrder < 0
    || typeof summary.createdAt !== "string" || typeof summary.updatedAt !== "string"
    || typeof summary.progressEvents !== "number" || !Number.isSafeInteger(summary.progressEvents) || summary.progressEvents < 0
    || !Array.isArray(summary.artifacts)
    || typeof summary.resultAvailable !== "boolean"
    || summary.resultAvailable !== (summary.status === "completed")
    || (summary.durationMs !== null && typeof summary.durationMs !== "number")
    || "progressLog" in summary || "result" in summary) return null;
  return summary as unknown as OperationExecutionSummary;
}

function parseProgress(value: unknown, operationId: string): StoredOperationProgress | null {
  if (!value || typeof value !== "object") return null;
  const progress = value as Partial<StoredOperationProgress>;
  if (progress.formatVersion !== 1 || progress.operationId !== operationId
    || typeof progress.progressEvents !== "number" || !Number.isSafeInteger(progress.progressEvents)
    || progress.progressEvents < 0 || !Array.isArray(progress.progressLog)
    || progress.progressLog.length > 256 || progress.progressLog.length > progress.progressEvents) return null;
  return progress as StoredOperationProgress;
}

function parseResult(value: unknown, operationId: string): StoredOperationResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<StoredOperationResult>;
  return result.formatVersion === 1 && result.operationId === operationId && "result" in result
    ? result as StoredOperationResult
    : null;
}

function committedProgressLog(
  summary: OperationExecutionSummary,
  stored: StoredOperationProgress,
): OperationExecutionProgress[] | null {
  if (stored.progressEvents < summary.progressEvents) return null;
  const uncommitted = stored.progressEvents - summary.progressEvents;
  if (uncommitted >= stored.progressLog.length) return [];
  return stored.progressLog.slice(0, stored.progressLog.length - uncommitted);
}

function operationKey(projectDir: string, subject: OperationExecutionSubject): string {
  return `${projectDir}\0${stableStringify(subject)}`;
}

export class StudioOperationRegistry {
  private readonly runtime = new Map<string, RuntimeOperation>();
  private readonly prepared = new Map<string, Promise<void>>();
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
      committedSummary: null,
      persistence: Promise.resolve(),
      startedPerformanceMs: performance.now(),
    };
    this.runtime.set(snapshot.id, entry);
    await this.persist(entry);
    void this.execute(entry, runner);
    return { operation: structuredClone(snapshot), reused: false };
  }

  async list(projectDir: string): Promise<OperationExecutionSummary[]> {
    const summaries = await this.loadAllSummaries(projectDir);
    const retained: OperationExecutionSummary[] = [];
    let terminalCount = 0;
    for (const summary of summaries) {
      if (isTerminalOperationExecution(summary.status) && ++terminalCount > this.retention) continue;
      retained.push(summary);
    }
    return retained;
  }

  private async loadAllSummaries(projectDir: string): Promise<OperationExecutionSummary[]> {
    await this.prepare(projectDir);
    const disk = new Map<string, OperationExecutionSummary>();
    for (const entry of await readdir(operationDirectory(projectDir), { withFileTypes: true })) {
      if (!entry.isDirectory() || !OPERATION_ID.test(entry.name)) continue;
      let summary = await this.readSummary(projectDir, entry.name);
      if (!summary) continue;
      if (!this.runtime.has(summary.id) && !isTerminalOperationExecution(summary.status)) {
        summary = this.interruptSummary(summary);
        await this.writeSummary(projectDir, summary);
      }
      disk.set(summary.id, summary);
    }
    for (const entry of this.runtime.values()) if (entry.projectDir === projectDir) {
      if (entry.committedSummary) disk.set(entry.snapshot.id, structuredClone(entry.committedSummary));
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
    const snapshot = await this.readSnapshot(projectDir, operationId);
    if (!snapshot) return null;
    if (snapshot.status === "queued" || snapshot.status === "running") {
      const { resultAvailable: _, ...interrupted } = this.interruptSummary(summarizeOperationExecution(snapshot));
      Object.assign(snapshot, interrupted);
      await this.writeSnapshot(projectDir, snapshot);
    }
    return snapshot;
  }

  async cancel(projectDir: string, operationId: string): Promise<OperationExecutionSnapshot | null> {
    const entry = this.runtime.get(operationId);
    if (!entry || entry.projectDir !== projectDir) return this.get(projectDir, operationId);
    if (isTerminalOperationExecution(entry.snapshot.status)) {
      await entry.persistence;
      return structuredClone(entry.snapshot);
    }
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
    entry.persistence = entry.persistence.then(async () => {
      await this.writeSnapshot(entry.projectDir, snapshot);
      entry.committedSummary = summarizeOperationExecution(snapshot);
    });
    return entry.persistence;
  }

  private prepare(projectDir: string): Promise<void> {
    const existing = this.prepared.get(projectDir);
    if (existing) return existing;
    const preparation = (async () => {
      const directory = operationDirectory(projectDir);
      await mkdir(directory, { recursive: true });
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const operationId = entry.name.slice(0, -5);
        if (!OPERATION_ID.test(operationId)) continue;
        await rm(legacyOperationPath(projectDir, operationId), { force: true });
      }
    })();
    this.prepared.set(projectDir, preparation);
    return preparation;
  }

  private async writeJson(target: string, value: unknown): Promise<void> {
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${stableStringify(value, 2)}\n`);
    await rename(temporary, target);
  }

  private async writeSummary(projectDir: string, summary: OperationExecutionSummary): Promise<void> {
    await this.prepare(projectDir);
    await mkdir(operationPath(projectDir, summary.id), { recursive: true });
    await this.writeJson(statePath(projectDir, summary.id), summary);
  }

  private async writeSnapshot(projectDir: string, snapshot: OperationExecutionSnapshot): Promise<void> {
    await this.prepare(projectDir);
    await mkdir(operationPath(projectDir, snapshot.id), { recursive: true });
    await this.writeJson(progressPath(projectDir, snapshot.id), {
      formatVersion: 1,
      operationId: snapshot.id,
      progressEvents: snapshot.progressEvents,
      progressLog: snapshot.progressLog,
    } satisfies StoredOperationProgress);
    const summary = summarizeOperationExecution(snapshot);
    if (summary.resultAvailable) {
      await this.writeJson(resultPath(projectDir, snapshot.id), {
        formatVersion: 1,
        operationId: snapshot.id,
        result: snapshot.result,
      } satisfies StoredOperationResult);
    } else {
      await rm(resultPath(projectDir, snapshot.id), { force: true });
    }
    await this.writeSummary(projectDir, summary);
  }

  private async readJson(target: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(target, "utf8"));
    } catch {
      return null;
    }
  }

  private async readSummary(projectDir: string, operationId: string): Promise<OperationExecutionSummary | null> {
    await this.prepare(projectDir);
    return parseSummary(await this.readJson(statePath(projectDir, operationId)));
  }

  private async readSnapshot(projectDir: string, operationId: string): Promise<OperationExecutionSnapshot | null> {
    const summary = await this.readSummary(projectDir, operationId);
    if (!summary) return null;
    const storedProgress = parseProgress(await this.readJson(progressPath(projectDir, operationId)), operationId);
    if (!storedProgress) return null;
    const progressLog = committedProgressLog(summary, storedProgress);
    if (!progressLog) return null;
    const storedResult = summary.resultAvailable
      ? parseResult(await this.readJson(resultPath(projectDir, operationId)), operationId)
      : null;
    if (summary.resultAvailable && !storedResult) return null;
    const { resultAvailable: _, ...state } = summary;
    return {
      ...state,
      progressLog,
      result: storedResult?.result ?? null,
    };
  }

  private interruptSummary(summary: OperationExecutionSummary): OperationExecutionSummary {
    const now = new Date().toISOString();
    return {
      ...summary,
      status: "interrupted",
      updatedAt: now,
      completedAt: now,
      error: {
        code: "operation.interrupted",
        message: "Studio restarted before this operation reached an immutable result.",
      },
      durationMs: summary.startedAt === null
        ? null
        : Math.max(0, Date.parse(now) - Date.parse(summary.startedAt)),
      resultAvailable: false,
    };
  }

  private async prune(projectDir: string): Promise<void> {
    const summaries = await this.loadAllSummaries(projectDir);
    const removable = summaries.filter((summary) =>
      isTerminalOperationExecution(summary.status) && !this.runtime.has(summary.id));
    for (const summary of removable.slice(this.retention)) {
      await rm(operationPath(projectDir, summary.id), { force: true, recursive: true });
    }
  }
}
