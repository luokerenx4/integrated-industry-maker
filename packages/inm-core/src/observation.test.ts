import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { openFactoryObservationBrief } from "./observation";

const repository = resolve(import.meta.dir, "../../..");

test("observation brief advances past every current bounded memory-fab loss", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const brief = await openFactoryObservationBrief(projectDir);
  expect(brief.version).toBe(1);
  expect(brief.status).toBe("ready");
  expect(brief.authority).toBe("human-or-agent");
  expect(brief.project).toEqual(expect.objectContaining({ id: "memory-fab", rootDir: projectDir }));
  expect(brief.selection).toEqual({
    world: "cleanroom",
    blueprint: "generated-dram-fab",
    scenario: "production-window",
    objective: "dram-output",
  });
  expect(brief.evidence.state).toBe("compatible");
  expect(brief.evidence.run).toEqual(expect.objectContaining({
    id: "090-simulate",
    resultHash: expect.any(String),
    decision: "BASELINE",
  }));
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.release-admission",
    subjects: [{ kind: "project", id: "memory-fab" }],
  }));
  expect(brief.id).toHaveLength(64);
  expect(brief.views[0]).toEqual(expect.objectContaining({
    id: "factory-overview",
    kind: "factory-overview",
    studioRoute: "/memory-fab/factory?run=090-simulate",
    required: true,
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "analysis-evidence", studioRoute: expect.stringContaining("/memory-fab/analysis/diagnostics/") }),
  ]));
  expect(brief.views.some((view) => view.kind === "factory-focus")).toBeFalse();
  expect(brief.handoff.requiredStatements).toHaveLength(4);
  expect(await openFactoryObservationBrief(projectDir, {}, "090-simulate")).toEqual(brief);
  expect(openFactoryObservationBrief(projectDir, {}, "missing-run")).rejects.toThrow("Unknown immutable run 'missing-run'");
});

test("observation brief exposes the exact equipment and service path before maintenance is dispositioned", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-observation-maintenance-"));
  const projectDir = join(root, "memory-fab");
  const maintenanceRuns = join("design-runs", "lithography-maintenance-convergence");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.includes(maintenanceRuns) && !source.split("/").includes(".inm"),
  });
  const brief = await openFactoryObservationBrief(projectDir, {}, "090-simulate");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.maintenance-qualification",
    subjects: [
      { kind: "device", id: "lithography-1" },
      { kind: "device", id: "maintenance-service-1" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/lithography-1?run=090-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/maintenance-service-1?run=090-simulate" }),
  ]));
});

test("observation brief requests simulation instead of fabricating runtime evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-observation-no-run-"));
  const projectDir = join(root, "ironworks");
  await cp(join(repository, "examples/ironworks"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const brief = await openFactoryObservationBrief(projectDir);
  expect(brief.status).toBe("needs-run");
  expect(brief.evidence).toEqual({ state: "missing", run: null });
  expect(brief.views[0]!.studioRoute).toBe("/ironworks/factory");
  expect(brief.handoff.nextStep).toContain("Create compatible immutable simulation evidence");
});
