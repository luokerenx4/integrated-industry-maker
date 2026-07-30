import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  loadCandidateReviewReceipt,
  loadDesignRun,
} from "@inm/core";
import type { StudioProjectRefreshEvent } from "./watch-protocol";

function normalized(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function projectRefreshProbePath(changedPath: string): string | null {
  const path = normalized(changedPath);
  if (!path || path.startsWith(".inm/") || path.includes("/.inm/")) return null;

  const run = path.match(/^runs\/([^/]+)(?:\/.*)?$/);
  if (run) return `runs/${run[1]!}/manifest.json`;
  if (path === "runs") return null;

  const designRun = path.match(/^design-runs\/([a-z0-9][a-z0-9-]*)\/([0-9a-f]{64})(?:\/.*)?$/);
  if (designRun) return `design-runs/${designRun[1]!}/${designRun[2]!}/manifest.json`;
  if (path === "design-runs" || path.startsWith("design-runs/")) return null;

  if (path === "candidate-reviews" || path.startsWith("candidate-reviews/")) {
    if (/^candidate-reviews\/[a-z0-9][a-z0-9-]*\/[0-9a-f]{64}\.review\.json$/.test(path)) return path;
    return /^candidate-reviews\/[a-z0-9][a-z0-9-]*\/?$/.test(path) ? path.replace(/\/$/, "") : null;
  }
  return path;
}

async function completedRunIsReadable(projectDir: string, id: string): Promise<boolean> {
  try {
    const runDir = join(projectDir, "runs", id);
    const [manifestSource, blueprintSource, metricsSource, finalStateSource, eventsSource] = await Promise.all([
      readFile(join(runDir, "manifest.json"), "utf8"),
      readFile(join(runDir, "blueprint.json"), "utf8"),
      readFile(join(runDir, "metrics.json"), "utf8"),
      readFile(join(runDir, "final-state.json"), "utf8"),
      readFile(join(runDir, "events.ndjson"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestSource) as Record<string, unknown>;
    const selection = manifest.selection as Record<string, unknown> | undefined;
    const metrics = JSON.parse(metricsSource) as Record<string, unknown>;
    JSON.parse(blueprintSource);
    JSON.parse(finalStateSource);
    for (const line of eventsSource.trim().split("\n").filter(Boolean)) JSON.parse(line);
    return manifest.version === 1
      && manifest.status === "completed"
      && typeof manifest.createdAt === "string"
      && typeof manifest.runKey === "string"
      && typeof manifest.resultHash === "string"
      && typeof manifest.engineVersion === "string"
      && typeof manifest.hashes === "object" && manifest.hashes !== null
      && typeof selection?.world === "string"
      && typeof selection.blueprint === "string"
      && typeof selection.productionPlan === "string"
      && typeof selection.scenario === "string"
      && typeof selection.objective === "string"
      && typeof manifest.seed === "number"
      && (manifest.decision === "BASELINE" || manifest.decision === "KEEP" || manifest.decision === "REVERT")
      && typeof metrics.finalScore === "number";
  } catch {
    return false;
  }
}

export async function completedProjectRefresh(
  projectDir: string,
  projectId: string,
  changedPath: string,
): Promise<StudioProjectRefreshEvent | null> {
  const path = normalized(changedPath);
  if (!path || path.startsWith(".inm/") || path.includes("/.inm/")) return null;

  const run = path.match(/^runs\/([^/]+)\/manifest\.json$/);
  if (run) {
    const id = run[1]!;
    return await completedRunIsReadable(projectDir, id)
      ? { version: 1, type: "project-refresh", projectId, reason: "run", artifactId: id }
      : null;
  }
  if (path === "runs" || path.startsWith("runs/")) return null;

  const designRun = path.match(/^design-runs\/([a-z0-9][a-z0-9-]*)\/([0-9a-f]{64})\/manifest\.json$/);
  if (designRun) {
    try {
      await loadDesignRun(projectDir, designRun[1]!, designRun[2]!);
      return {
        version: 1,
        type: "project-refresh",
        projectId,
        reason: "design-run",
        artifactId: designRun[2]!,
      };
    } catch {
      return null;
    }
  }
  if (path === "design-runs" || path.startsWith("design-runs/")) return null;

  const review = path.match(/^candidate-reviews\/([a-z0-9][a-z0-9-]*)\/([0-9a-f]{64})\.review\.json$/);
  if (review) {
    try {
      const receipt = await loadCandidateReviewReceipt(projectDir, review[1]!, review[2]!);
      return receipt
        ? {
          version: 1,
          type: "project-refresh",
          projectId,
          reason: "candidate-review",
          artifactId: review[2]!,
        }
        : null;
    } catch {
      return null;
    }
  }
  const reviewDirectory = path.match(/^candidate-reviews\/([a-z0-9][a-z0-9-]*)$/);
  if (reviewDirectory) {
    try {
      const candidateId = reviewDirectory[1]!;
      const names = (await readdir(join(projectDir, "candidate-reviews", candidateId)))
        .filter((name) => /^[0-9a-f]{64}\.review\.json$/.test(name))
        .sort()
        .reverse();
      for (const name of names) {
        const proposalHash = name.slice(0, 64);
        if (await loadCandidateReviewReceipt(projectDir, candidateId, proposalHash)) {
          return {
            version: 1,
            type: "project-refresh",
            projectId,
            reason: "candidate-review",
            artifactId: proposalHash,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  if (path === "candidate-reviews" || path.startsWith("candidate-reviews/")) return null;

  return {
    version: 1,
    type: "project-refresh",
    projectId,
    reason: "project-source",
    artifactId: null,
  };
}
