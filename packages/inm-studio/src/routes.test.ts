import { expect, test } from "bun:test";
import { analysisPath, catalogPath, experimentPath, factoryObjectPath, projectPath, studioRoute, viewPath } from "./routes";

test("Studio builds and parses every stable project-qualified route", () => {
  const cases = [
    { path: projectPath("memory fab"), expected: { projectId: "memory fab", view: "overview" } },
    { path: factoryObjectPath("memory-fab"), expected: { projectId: "memory-fab", view: "factory", selection: null } },
    { path: factoryObjectPath("memory-fab", { kind: "device", id: "furnace/1" }), expected: { view: "factory", selection: { kind: "device", id: "furnace/1" } } },
    { path: factoryObjectPath("memory-fab", { kind: "connection", id: "line:1" }), expected: { view: "factory", selection: { kind: "connection", id: "line:1" } } },
    { path: viewPath("memory-fab", "runs"), expected: { view: "runs" } },
    { path: catalogPath("memory-fab", "resources", "blank/wafer"), expected: { view: "catalog", assetKind: "resources", assetId: "blank/wafer" } },
    { path: analysisPath("memory-fab", "capacity.power:region:fab"), expected: { view: "analysis", diagnosticId: "capacity.power:region:fab" } },
    { path: experimentPath("memory-fab", "energy/research"), expected: { view: "experiments", experimentId: "energy/research" } },
    { path: experimentPath("memory-fab", "energy/research", "sleep/candidate"), expected: { view: "experiments", experimentId: "energy/research", candidateId: "sleep/candidate" } },
  ];
  for (const item of cases) expect(studioRoute(item.path)).toEqual(expect.objectContaining(item.expected));
});

test("malformed or unknown Studio routes fall back to the launcher", () => {
  for (const path of ["/memory-fab/unknown", "/memory-fab/factory/assets/x", "/%E0%A4%A"]) {
    expect(studioRoute(path)).toEqual(expect.objectContaining({ projectId: null, view: "overview" }));
  }
});

test("reload, back, and forward reconstruct route state without browser-only authority", () => {
  const history = [
    projectPath("memory-fab"),
    catalogPath("memory-fab", "devices", "thermal-batch-furnace"),
    analysisPath("memory-fab", "analysis.material-deficit:resource:wafer"),
    factoryObjectPath("memory-fab", { kind: "device", id: "burn-in-1" }),
    viewPath("memory-fab", "runs"),
    experimentPath("memory-fab", "equipment-energy-research", "stable-furnace-sleep"),
  ];
  const reloaded = history.map((path) => studioRoute(path));
  expect(reloaded.map((route) => route.view)).toEqual(["overview", "catalog", "analysis", "factory", "runs", "experiments"]);
  expect(reloaded.at(-1)).toEqual(expect.objectContaining({ experimentId: "equipment-energy-research", candidateId: "stable-furnace-sleep" }));
  expect(studioRoute(history[3]!)).toEqual(expect.objectContaining({ view: "factory", selection: { kind: "device", id: "burn-in-1" } }));
  expect(studioRoute(history[4]!)).toEqual(expect.objectContaining({ view: "runs" }));
});
