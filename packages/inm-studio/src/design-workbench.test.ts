import { describe, expect, test } from "bun:test";
import { designRunSelectionIssue, latestCompletedDesignCase } from "./design-workbench";

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

  test("recovers the latest completed case from a fast retained parallel operation", () => {
    const baseline = { program: "dram", phase: "case-completed", evaluation: { kind: "baseline" }, case: { id: "baseline" } };
    const candidate = {
      program: "dram",
      phase: "case-completed",
      evaluation: { kind: "candidate" },
      case: { id: "facility-interruption" },
      execution: { mode: "parallel", concurrency: 5 },
    };
    expect(latestCompletedDesignCase([
      baseline,
      candidate,
      { program: "dram", phase: "run-completed" },
    ] as any)).toBe(candidate as any);
  });
});
