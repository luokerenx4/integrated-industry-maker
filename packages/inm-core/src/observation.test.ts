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
    id: "091-simulate",
    resultHash: expect.any(String),
    decision: "BASELINE",
  }));
  expect(brief.leadingDiagnostic).toBeNull();
  expect(brief.id).toHaveLength(64);
  expect(brief.views[0]).toEqual(expect.objectContaining({
    id: "factory-overview",
    kind: "factory-overview",
    studioRoute: "/memory-fab/factory?run=091-simulate",
    required: true,
  }));
  expect(brief.views).toHaveLength(1);
  expect(brief.views.some((view) => view.kind !== "factory-overview")).toBeFalse();
  expect(brief.handoff.requiredStatements).toHaveLength(4);
  expect(brief.handoff.nextStep).toContain("bounded loss frontier");
  expect(await openFactoryObservationBrief(projectDir, {}, "091-simulate")).toEqual(brief);
  expect(openFactoryObservationBrief(projectDir, {}, "missing-run")).rejects.toThrow("Unknown immutable run 'missing-run'");
});

test("observation brief exposes the exact shipping grid before power interruption is dispositioned", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-observation-power-"));
  const projectDir = join(root, "memory-fab");
  const powerRuns = join("design-runs", "shipping-power-convergence");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.includes(powerRuns) && !source.split("/").includes(".inm"),
  });
  const brief = await openFactoryObservationBrief(projectDir, {}, "091-simulate");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.power-interruption",
    subjects: [
      { kind: "device", id: "substrate-receiving-to-packaging-loader" },
      { kind: "connection", id: "substrate-receiving-to-packaging" },
      { kind: "device", id: "shipping-power" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/substrate-receiving-to-packaging-loader?run=091-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/connections/substrate-receiving-to-packaging?run=091-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/shipping-power?run=091-simulate" }),
  ]));
});

test("observation brief exposes the exact release boundary before release admission is dispositioned", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-observation-release-"));
  const projectDir = join(root, "memory-fab");
  const releaseRuns = join("design-runs", "release-admission-convergence");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.includes(releaseRuns) && !source.split("/").includes(".inm"),
  });
  const brief = await openFactoryObservationBrief(projectDir, {}, "091-simulate");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.release-admission",
    subjects: [
      { kind: "device", id: "lot-release" },
      { kind: "route", id: "dram-front-end" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "factory-focus", studioRoute: "/memory-fab/factory/devices/lot-release?run=091-simulate" }),
    expect.objectContaining({ kind: "catalog-focus", studioRoute: "/memory-fab/catalog/routes/dram-front-end" }),
  ]));
});

test("observation brief exposes the exact equipment and service path before maintenance is dispositioned", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-observation-maintenance-"));
  const projectDir = join(root, "memory-fab");
  const maintenanceRuns = join("design-runs", "lithography-maintenance-convergence");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.includes(maintenanceRuns) && !source.split("/").includes(".inm"),
  });
  const brief = await openFactoryObservationBrief(projectDir, {}, "091-simulate");
  expect(brief.leadingDiagnostic).toEqual(expect.objectContaining({
    code: "fab-loss.maintenance-qualification",
    subjects: [
      { kind: "device", id: "lithography-1" },
      { kind: "device", id: "maintenance-service-1" },
    ],
  }));
  expect(brief.views).toEqual(expect.arrayContaining([
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/lithography-1?run=091-simulate" }),
    expect.objectContaining({ studioRoute: "/memory-fab/factory/devices/maintenance-service-1?run=091-simulate" }),
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
