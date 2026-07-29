export type StudioProjectRefreshReason =
  | "project-source"
  | "run"
  | "design-run"
  | "candidate-review";

export type StudioWatchEvent =
  | {
    version: 1;
    type: "ready";
    sourceHash: string;
  }
  | {
    version: 1;
    type: "index-refresh";
  }
  | {
    version: 1;
    type: "project-refresh";
    projectId: string;
    reason: StudioProjectRefreshReason;
    artifactId: string | null;
  };

export type StudioProjectRefreshEvent = Extract<StudioWatchEvent, { type: "project-refresh" }>;

export function studioWatchMessage(event: StudioWatchEvent): string {
  return JSON.stringify(event);
}

export function parseStudioWatchMessage(value: unknown): StudioWatchEvent | null {
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const event = parsed as Partial<StudioWatchEvent>;
  if (event.version !== 1) return null;
  if (event.type === "ready") {
    return typeof event.sourceHash === "string" && /^[0-9a-f]{64}$/.test(event.sourceHash)
      ? { version: 1, type: "ready", sourceHash: event.sourceHash }
      : null;
  }
  if (event.type === "index-refresh") return { version: 1, type: "index-refresh" };
  if (event.type !== "project-refresh"
    || typeof event.projectId !== "string"
    || !/^[a-z0-9][a-z0-9-]*$/.test(event.projectId)
    || (event.reason !== "project-source"
      && event.reason !== "run"
      && event.reason !== "design-run"
      && event.reason !== "candidate-review")
    || (event.reason === "project-source"
      ? event.artifactId !== null
      : typeof event.artifactId !== "string" || event.artifactId.length === 0)
    || ((event.reason === "design-run" || event.reason === "candidate-review")
      && !/^[0-9a-f]{64}$/.test(event.artifactId as string))) return null;
  return {
    version: 1,
    type: "project-refresh",
    projectId: event.projectId,
    reason: event.reason,
    artifactId: event.artifactId as string | null,
  };
}
