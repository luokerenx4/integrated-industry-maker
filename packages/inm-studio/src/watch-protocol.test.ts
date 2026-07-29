import { expect, test } from "bun:test";
import { parseStudioWatchMessage, studioWatchMessage, type StudioWatchEvent } from "./watch-protocol";

test("Studio watch protocol carries strict source identity and project-qualified refreshes", () => {
  const events: StudioWatchEvent[] = [
    { version: 1, type: "ready", sourceHash: "a".repeat(64) },
    { version: 1, type: "index-refresh" },
    { version: 1, type: "project-refresh", projectId: "memory-fab", reason: "run", artifactId: "094-simulate" },
    { version: 1, type: "project-refresh", projectId: "memory-fab", reason: "design-run", artifactId: "b".repeat(64) },
    { version: 1, type: "project-refresh", projectId: "memory-fab", reason: "candidate-review", artifactId: "c".repeat(64) },
    { version: 1, type: "project-refresh", projectId: "ironworks", reason: "project-source", artifactId: null },
  ];
  for (const event of events) expect(parseStudioWatchMessage(studioWatchMessage(event))).toEqual(event);
  for (const invalid of [
    "refresh",
    "{}",
    JSON.stringify({ version: 2, type: "ready", sourceHash: "a".repeat(64) }),
    JSON.stringify({ version: 1, type: "ready", sourceHash: "short" }),
    JSON.stringify({ version: 1, type: "project-refresh", projectId: "../memory-fab", reason: "run", artifactId: null }),
    JSON.stringify({ version: 1, type: "project-refresh", projectId: "memory-fab", reason: "partial", artifactId: null }),
    JSON.stringify({ version: 1, type: "project-refresh", projectId: "memory-fab", reason: "project-source", artifactId: "unexpected" }),
    JSON.stringify({ version: 1, type: "project-refresh", projectId: "memory-fab", reason: "design-run", artifactId: "short" }),
  ]) expect(parseStudioWatchMessage(invalid)).toBeNull();
});
