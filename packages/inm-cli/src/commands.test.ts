import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listRuns, listWorkspaceProjects, openFactoryProject, openProjectWorkbenchSnapshot, planProductionCapacity, resolveProjectDirectory } from "@inm/core";
import { compareCommand, projectCreateCommand, projectDefaultCommand, synthesizeCommand, workspaceInitCommand } from "./commands";

const repository = resolve(import.meta.dir, "../../..");

async function runCli(args: string[]) {
  const child = Bun.spawn([process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), ...args], {
    cwd: repository, stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("one workspace creates, selects, and isolates multiple self-contained projects", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-workspace-")); const workspace = join(parent, "engine");
  await workspaceInitCommand(workspace, { name: "Test Engine", json: false });
  await projectCreateCommand(workspace, "alpha-works", { name: "Alpha Works", json: false });
  await projectCreateCommand(workspace, "beta-works", { name: "Beta Works", json: false });

  const projects = await listWorkspaceProjects(workspace);
  expect(projects.map((project) => project.id)).toEqual(["alpha-works", "beta-works"]);
  expect(projects.find((project) => project.id === "alpha-works")!.isDefault).toBeTrue();
  expect(await resolveProjectDirectory(workspace)).toBe(join(workspace, "projects", "alpha-works"));
  expect(await resolveProjectDirectory(workspace, "beta-works")).toBe(join(workspace, "projects", "beta-works"));

  const alphaDir = await resolveProjectDirectory(workspace, "alpha-works"); const betaDir = await resolveProjectDirectory(workspace, "beta-works");
  const alpha = await openFactoryProject(alphaDir); const beta = await openFactoryProject(betaDir);
  expect(alpha.manifest.id).toBe("alpha-works"); expect(beta.manifest.id).toBe("beta-works");
  expect(alpha.hashes.deviceCatalogHash).toBe(beta.hashes.deviceCatalogHash);
  expect(await readFile(join(alphaDir, "AUTORESEARCH.md"), "utf8")).toContain("blueprints/autoresearch.blueprint.json");
  expect(JSON.parse(await readFile(join(alphaDir, "benchmarks/autoresearch.benchmark.json"), "utf8")).candidateBlueprint).toBe("autoresearch");

  const alphaVisual = join(alphaDir, "assets", "devices", "smelter", "visual.json");
  const betaVisual = join(betaDir, "assets", "devices", "smelter", "visual.json");
  const originalBetaVisual = await readFile(betaVisual, "utf8");
  await writeFile(alphaVisual, (await readFile(alphaVisual, "utf8")).replace("#e26437", "#112233"));
  expect(await readFile(betaVisual, "utf8")).toBe(originalBetaVisual);
  expect((await openFactoryProject(alphaDir)).hashes.deviceCatalogHash).not.toBe((await openFactoryProject(betaDir)).hashes.deviceCatalogHash);

  await projectDefaultCommand(workspace, "beta-works", { json: false });
  expect(await resolveProjectDirectory(workspace)).toBe(betaDir);
  expect(await resolveProjectDirectory(betaDir)).toBe(betaDir);
});

test("synthesize command writes a new compileable blueprint and refuses overwrite", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-synthesize-")); const projectDir = join(parent, "ironworks");
  await cp(resolve(import.meta.dir, "../../../examples/ironworks"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") });
  await synthesizeCommand(projectDir, { blueprint: "blank", scenario: "cold-start" }, { output: "generated-test", json: false });
  const project = await openFactoryProject(projectDir, { blueprint: "generated-test", scenario: "cold-start" });
  expect(planProductionCapacity(project).ready).toBeTrue();
  expect(synthesizeCommand(projectDir, { blueprint: "blank", scenario: "cold-start" }, { output: "generated-test", json: false })).rejects.toThrow("Blueprint already exists");
});

test("compare command evaluates two Blueprints without writing a run artifact", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-compare-")); const projectDir = join(parent, "ironworks");
  await cp(resolve(import.meta.dir, "../../../examples/ironworks"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") });
  const mainPath = join(projectDir, "blueprints", "main.blueprint.json"); const candidatePath = join(projectDir, "blueprints", "candidate.blueprint.json");
  const candidate = JSON.parse(await readFile(mainPath, "utf8"));
  candidate.devices.find((device: { id: string }) => device.id === "assembler-1").recipe.mode = "accelerated";
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  const mainBefore = await readFile(mainPath, "utf8"); const candidateBefore = await readFile(candidatePath, "utf8");

  await compareCommand(projectDir, {}, { fromBlueprint: "main", toBlueprint: "candidate", seed: 42, json: false });

  expect(await listRuns(projectDir)).toHaveLength(0);
  expect(await readFile(mainPath, "utf8")).toBe(mainBefore);
  expect(await readFile(candidatePath, "utf8")).toBe(candidateBefore);
});

test("candidate CLI previews, explicitly applies, and rejects replay as machine-readable JSON", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-candidate-cli-")); const projectDir = join(parent, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  const blueprintPath = join(projectDir, "blueprints/equipment-energy-sleep.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  const runCandidate = async (apply = false) => {
    const child = Bun.spawn([
      process.execPath, join(repository, "packages/inm-cli/src/bin.ts"), "candidate", projectDir,
      "--candidate", "stable-furnace-sleep", ...(apply ? ["--apply"] : []), "--json",
    ], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    return { stdout, stderr, exitCode };
  };
  const { stdout, stderr, exitCode } = await runCandidate();
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const result = JSON.parse(stdout);
  expect(result).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "candidate" }));
  expect(result.data).toEqual({
    section: "summary",
    result: expect.objectContaining({ action: "preview", candidate: "stable-furnace-sleep", verdict: "KEEP", scoreDelta: expect.any(Number) }),
  });
  expect(result.nextActions).toEqual([expect.objectContaining({ id: "candidate.apply", effect: "mutates-project" })]);
  expect(await readFile(blueprintPath, "utf8")).toBe(before);

  const applied = await runCandidate(true);
  expect({ exitCode: applied.exitCode, stderr: applied.stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(JSON.parse(applied.stdout)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: true, command: "candidate",
    data: { section: "summary", result: expect.objectContaining({ action: "apply", applied: true }) },
  }));
  expect(await readFile(blueprintPath, "utf8")).not.toBe(before);

  const replay = await runCandidate(true);
  expect({ exitCode: replay.exitCode, stdout: replay.stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(JSON.parse(replay.stderr)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: false, command: "candidate",
    error: expect.objectContaining({ code: "candidate.stale-base", retryable: false, hashes: expect.objectContaining({ expectedBaseHash: expect.any(String), currentCandidateHash: expect.any(String) }) }),
  }));
}, 30_000);

test("public inspect JSON is the shared Core workbench snapshot", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const [{ stdout, stderr, exitCode }, expected] = await Promise.all([
    runCli(["inspect", projectDir, "--section", "all", "--json"]),
    openProjectWorkbenchSnapshot(projectDir),
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(stdout);
  expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "inspect" }));
  expect(envelope.context).toEqual(expect.objectContaining({ scope: "project", selection: expected.selection && {
    world: expected.selection.world.id, blueprint: expected.selection.blueprint.id,
    scenario: expected.selection.scenario.id, objective: expected.selection.objective.id,
  }, hashes: expected.hashes }));
  expect(envelope.data).toEqual({ section: "all", result: expected });
});

test("public inspect rejects an invalid explicit selection", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const { stdout, stderr, exitCode } = await runCli(["inspect", projectDir, "--blueprint", "missing-blueprint", "--json"]);
  expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(JSON.parse(stderr)).toEqual(expect.objectContaining({
    schemaVersion: 1, ok: false, command: "inspect",
    error: expect.objectContaining({ code: "runtime.failed", message: expect.stringContaining("missing-blueprint.blueprint.json"), retryable: false, issues: [] }),
  }));
});

test("public machine help discovers commands, effects, arguments, defaults, and output sections", async () => {
  const { stdout, stderr, exitCode } = await runCli(["help", "--json"]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const envelope = JSON.parse(stdout);
  expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "help", context: { scope: "global" } }));
  const commands = envelope.data.commands as Array<{ id: string; effect: string; exitCodes: { success: number; failure: number[]; usage: number }; arguments: Array<{ name: string; default?: unknown }>; outputSections: string[] }>;
  expect(commands.map((command) => command.id)).toContain("candidate");
  expect(commands.find((command) => command.id === "inspect")!.outputSections).toEqual(["summary", "diagnostics", "catalog", "runs", "experiments", "candidates", "operations", "all"]);
  expect(commands.find((command) => command.id === "simulate")!.effect).toBe("creates-artifact");
  expect(commands.find((command) => command.id === "compare")!.arguments.find((argument) => argument.name === "seed")!.default).toBe(42);
  expect(commands.find((command) => command.id === "inspect")!.exitCodes).toEqual({ success: 0, failure: [1], usage: 2 });
});

test("public schema discovery lists and emits every project artifact JSON Schema", async () => {
  const listed = await runCli(["schema", "--json"]);
  expect({ exitCode: listed.exitCode, stderr: listed.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const kinds = JSON.parse(listed.stdout).data.kinds as string[];
  for (const kind of ["manifest", "world", "blueprint", "scenario", "objective", "resource-asset", "device-asset", "process", "benchmark", "candidate"]) expect(kinds).toContain(kind);
  for (const kind of kinds) {
    const emitted = await runCli(["schema", kind, "--json"]);
    expect({ kind, exitCode: emitted.exitCode, stderr: emitted.stderr }).toEqual({ kind, exitCode: 0, stderr: "" });
    const envelope = JSON.parse(emitted.stdout);
    expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: true, command: "schema" }));
    expect(envelope.data.kind).toBe(kind);
    expect(envelope.data.schema).toEqual(expect.objectContaining({ $schema: "http://json-schema.org/draft-07/schema#" }));
    expect(Object.keys(envelope.data.schema).length).toBeGreaterThan(2);
  }
});

test("dense public JSON defaults to compact summary and selects one explicit section", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const [summaryResult, catalogResult, allResult] = await Promise.all([
    runCli(["inspect", projectDir, "--json"]),
    runCli(["inspect", projectDir, "--section", "catalog", "--json"]),
    runCli(["inspect", projectDir, "--section", "all", "--json"]),
  ]);
  for (const result of [summaryResult, catalogResult, allResult]) expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const summary = JSON.parse(summaryResult.stdout); const catalog = JSON.parse(catalogResult.stdout); const all = JSON.parse(allResult.stdout);
  expect(summary.data.section).toBe("summary");
  expect(summary.data.result.catalog).toBeUndefined();
  expect(catalog.data).toEqual(expect.objectContaining({ section: "catalog", result: expect.objectContaining({ resources: expect.any(Array), devices: expect.any(Array) }) }));
  expect(catalog.data.result.runs).toBeUndefined();
  expect(all.data.section).toBe("all");
  expect(all.data.result).toEqual(expect.objectContaining({ catalog: expect.any(Object), runs: expect.any(Array), operations: expect.any(Array) }));
  expect(summaryResult.stdout.length).toBeLessThan(allResult.stdout.length);
});

test("public CLI emits stable JSON errors for invalid section, section mode, schema kind, and usage", async () => {
  const projectDir = join(repository, "examples/ironworks");
  const cases = [
    { args: ["inspect", projectDir, "--section", "nope", "--json"], exitCode: 1, command: "inspect", code: "cli.invalid-section" },
    { args: ["schema", "nope", "--json"], exitCode: 1, command: "schema", code: "schema.unknown-kind" },
    { args: ["validate", "--json"], exitCode: 2, command: "validate", code: "cli.usage" },
    { args: ["unknown", "--json"], exitCode: 2, command: "unknown", code: "cli.usage" },
    { args: ["inspect", projectDir, "--unknown", "--json"], exitCode: 2, command: "inspect", code: "cli.usage" },
  ];
  for (const item of cases) {
    const result = await runCli(item.args);
    expect({ stdout: result.stdout, exitCode: result.exitCode }).toEqual({ stdout: "", exitCode: item.exitCode });
    const envelope = JSON.parse(result.stderr);
    expect(envelope).toEqual(expect.objectContaining({ schemaVersion: 1, ok: false, command: item.command, error: expect.objectContaining({ code: item.code, retryable: false, issues: expect.any(Array), hashes: expect.any(Object) }) }));
  }
  const humanOnly = await runCli(["inspect", projectDir, "--section", "catalog"]);
  expect({ stdout: humanOnly.stdout, exitCode: humanOnly.exitCode }).toEqual({ stdout: "", exitCode: 1 });
  expect(humanOnly.stderr).toContain("[cli.section-requires-json]");
});
