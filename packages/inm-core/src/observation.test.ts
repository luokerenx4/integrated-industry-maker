import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { buildFactoryObservationBrief, openFactoryObservationBrief } from "./observation";
import { openProjectWorkbenchSnapshot, type ProjectWorkbenchSnapshot } from "./workbench";

const repository = resolve(import.meta.dir, "../../..");

test("observation brief keeps the Objective WIP tradeoff visible after current losses are bounded", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const snapshot = structuredClone(await openProjectWorkbenchSnapshot(projectDir));
  snapshot.diagnostics = snapshot.diagnostics.filter((diagnostic) => diagnostic.severity === "info");
  snapshot.lossDispositions = [];
  const brief = buildFactoryObservationBrief(snapshot, "098-simulate");
  expect(brief.version).toBe(2);
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
    id: "098-simulate",
    resultHash: expect.any(String),
    decision: "BASELINE",
  }));
  expect(brief.leadingDiagnostic).toBeNull();
  expect(brief.leadingObjectiveTradeoff).toEqual({
    component: "wip",
    contribution: -73.93575,
    runId: "098-simulate",
    subjects: [
      { kind: "device", id: "burn-in-1" },
      { kind: "device", id: "packaging-1" },
    ],
    summary: "49.291 average dram-device-equivalent (27.989 raw WIP items) contributes -73.936 to the exact Objective score; leading equivalent exposure is 9.815 at burn-in-1.package-input and 8.118 at packaging-1.die-input.",
    interpretation: "objective-accounting-not-causal-loss",
  });
  expect(brief.id).toHaveLength(64);
  expect(brief.views[0]).toEqual(expect.objectContaining({
    id: "factory-overview",
    kind: "factory-overview",
    studioRoute: "/memory-fab/factory?run=098-simulate",
    required: true,
  }));
  expect(brief.views).toHaveLength(3);
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({
      kind: "factory-focus",
      studioRoute: "/memory-fab/factory/devices/burn-in-1?run=098-simulate",
    }),
    expect.objectContaining({
      kind: "factory-focus",
      studioRoute: "/memory-fab/factory/devices/packaging-1?run=098-simulate",
    }),
  ]));
  expect(brief.handoff.requiredStatements).toHaveLength(4);
  expect(brief.handoff.nextStep).toContain("Use the Objective tradeoff and Resource-qualified views");
  expect(buildFactoryObservationBrief(snapshot, "098-simulate")).toEqual(brief);
  expect(openFactoryObservationBrief(projectDir, {}, "missing-run")).rejects.toThrow("Unknown immutable run 'missing-run'");
});

async function observationBriefForDiagnostic(code: string) {
  const projectDir = join(repository, "examples/memory-fab");
  const snapshot = structuredClone(await openProjectWorkbenchSnapshot(projectDir));
  const diagnostic = snapshot.diagnostics.find((item) => item.code === code);
  if (!diagnostic) {
    throw new Error(`Missing observation fixture diagnostic '${code}'`);
  }
  snapshot.nextAction = {
    ...snapshot.nextAction,
    target: { kind: "diagnostic", diagnosticId: diagnostic.id },
  };
  snapshot.lossDispositions = snapshot.lossDispositions.filter((item) => item.diagnosticId !== diagnostic.id);
  return buildFactoryObservationBrief(snapshot as ProjectWorkbenchSnapshot, "098-simulate");
}

test("observation brief exposes the exact shipping grid for power interruption", async () => {
  const brief = await observationBriefForDiagnostic("fab-loss.power-interruption");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.power-interruption",
    subjects: [
      { kind: "device", id: "substrate-receiving-to-packaging-loader" },
      { kind: "connection", id: "substrate-receiving-to-packaging" },
      { kind: "device", id: "shipping-power" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/substrate-receiving-to-packaging-loader?run=098-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/connections/substrate-receiving-to-packaging?run=098-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/shipping-power?run=098-simulate" }),
  ]));
});

test("observation brief exposes the exact release boundary for release admission", async () => {
  const brief = await observationBriefForDiagnostic("fab-loss.release-admission");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.release-admission",
    subjects: [
      { kind: "device", id: "lot-release" },
      { kind: "route", id: "dram-front-end" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "factory-focus", studioRoute: "/memory-fab/factory/devices/lot-release?run=098-simulate" }),
    expect.objectContaining({ kind: "catalog-focus", studioRoute: "/memory-fab/catalog/routes/dram-front-end" }),
  ]));
});

test("observation brief exposes the exact equipment and service path for maintenance", async () => {
  const brief = await observationBriefForDiagnostic("fab-loss.maintenance-qualification");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.maintenance-qualification",
    subjects: [
      { kind: "device", id: "lithography-1" },
      { kind: "device", id: "maintenance-service-1" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/lithography-1?run=098-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/maintenance-service-1?run=098-simulate" }),
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
