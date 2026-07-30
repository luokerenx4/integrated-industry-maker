import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { completedProjectRefresh, projectRefreshProbePath } from "./evidence-watch";

const memoryFab = resolve("examples/memory-fab");

test("Studio refreshes only complete immutable evidence at exact project boundaries", async () => {
  expect(projectRefreshProbePath("runs/097-simulate/metrics.json"))
    .toBe("runs/097-simulate/manifest.json");
  expect(projectRefreshProbePath(
    "design-runs/back-end-wip-convergence/803e348a6c6d13ffa1d5e28b9e67a7470a0079d906bb3d124cba4302c25b768b/best.blueprint.json",
  )).toBe(
    "design-runs/back-end-wip-convergence/803e348a6c6d13ffa1d5e28b9e67a7470a0079d906bb3d124cba4302c25b768b/manifest.json",
  );
  expect(projectRefreshProbePath(".inm/operations/example/state.json")).toBeNull();
  expect(projectRefreshProbePath("candidate-reviews/back-end-wip-conwip-5-4"))
    .toBe("candidate-reviews/back-end-wip-conwip-5-4");
  expect(await completedProjectRefresh(
    memoryFab,
    "memory-fab",
    "runs/097-simulate/manifest.json",
  )).toEqual({
    version: 1,
    type: "project-refresh",
    projectId: "memory-fab",
    reason: "run",
    artifactId: "097-simulate",
  });
  expect(await completedProjectRefresh(
    memoryFab,
    "memory-fab",
    "design-runs/back-end-wip-convergence/803e348a6c6d13ffa1d5e28b9e67a7470a0079d906bb3d124cba4302c25b768b/manifest.json",
  )).toEqual({
    version: 1,
    type: "project-refresh",
    projectId: "memory-fab",
    reason: "design-run",
    artifactId: "803e348a6c6d13ffa1d5e28b9e67a7470a0079d906bb3d124cba4302c25b768b",
  });
  expect(await completedProjectRefresh(
    memoryFab,
    "memory-fab",
    "candidate-reviews/back-end-wip-conwip-5-4/cacad0436501eebec66c3c498a0b4edb06b9d399161935a3135207ea0155f91e.review.json",
  )).toEqual({
    version: 1,
    type: "project-refresh",
    projectId: "memory-fab",
    reason: "candidate-review",
    artifactId: "cacad0436501eebec66c3c498a0b4edb06b9d399161935a3135207ea0155f91e",
  });
  expect(await completedProjectRefresh(
    memoryFab,
    "memory-fab",
    "candidate-reviews/back-end-wip-conwip-5-4",
  )).toEqual({
    version: 1,
    type: "project-refresh",
    projectId: "memory-fab",
    reason: "candidate-review",
    artifactId: "cacad0436501eebec66c3c498a0b4edb06b9d399161935a3135207ea0155f91e",
  });
  expect(await completedProjectRefresh(memoryFab, "memory-fab", "blueprints/generated-dram-fab.blueprint.json"))
    .toEqual({ version: 1, type: "project-refresh", projectId: "memory-fab", reason: "project-source", artifactId: null });
  for (const ignored of [
    ".inm/operations/example/state.json",
    "runs/097-simulate/metrics.json",
    "design-runs/back-end-wip-convergence/example/best.blueprint.json",
    "candidate-reviews/back-end-wip-conwip-5-4/.partial.tmp",
  ]) expect(await completedProjectRefresh(memoryFab, "memory-fab", ignored)).toBeNull();

  const partial = await mkdtemp(join(tmpdir(), "inm-studio-partial-evidence-"));
  await mkdir(join(partial, "runs", "001-partial"), { recursive: true });
  await writeFile(join(partial, "runs", "001-partial", "manifest.json"), "{}\n");
  expect(await completedProjectRefresh(partial, "memory-fab", "runs/001-partial/manifest.json")).toBeNull();
  expect(await completedProjectRefresh(
    partial,
    "memory-fab",
    `design-runs/back-end-wip-convergence/${"d".repeat(64)}/manifest.json`,
  )).toBeNull();
  expect(await completedProjectRefresh(
    partial,
    "memory-fab",
    `candidate-reviews/back-end-wip-conwip-5-4/${"e".repeat(64)}.review.json`,
  )).toBeNull();
});
