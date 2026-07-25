import { describe, expect, test } from "bun:test";
import { designRunSelectionIssue } from "./design-workbench";

describe("Design workbench run selection", () => {
  test("isolates strict historical evidence rejection from effectful operation failures", () => {
    const runId = "a".repeat(64);
    const message = `Design run '${runId}' manifest structure is invalid`;

    expect(designRunSelectionIssue("design.invalid-run", message, runId)).toEqual({
      runId,
      code: "design.invalid-run",
      message,
    });
    expect(designRunSelectionIssue("design.frontier-exhausted", "No searchable frontier remains", runId)).toBeNull();
    expect(designRunSelectionIssue("studio.request-failed", "Connection failed", runId)).toBeNull();
  });
});
