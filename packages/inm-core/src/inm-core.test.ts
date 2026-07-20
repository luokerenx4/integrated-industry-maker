import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ExternalCommandResearchAgent, HeuristicResearchAgent, InmValidationError, applyResearchPatch, compileFactoryProject, createFactorySceneModel,
  listRuns, loadFactoryProject, openFactoryProject, replayFactoryEvents, researchFactory, runUntil,
  stableStringify, validateResearchPatch, verifyRunReplay, writeRunArtifact, SeededRandom,
  type BlueprintResearchAgent, type LoadedFactoryProject,
} from "./index";

const ironworks = resolve(import.meta.dir, "../../../examples/ironworks");
async function loaded(): Promise<LoadedFactoryProject> { return loadFactoryProject(ironworks); }
function clone<T>(value: T): T { return structuredClone(value); }
function issueCodes(fn: () => unknown): string[] {
  try { fn(); return []; } catch (error) {
    expect(error).toBeInstanceOf(InmValidationError);
    return (error as InmValidationError).issues.map((issue) => issue.code);
  }
}
async function projectCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "inm-test-"));
  await cp(ironworks, dir, { recursive: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  return dir;
}

describe("blueprint compiler", () => {
  test("compiles the complete Ironworks project", async () => {
    const project = compileFactoryProject(await loaded());
    expect(Object.keys(project.devices)).toHaveLength(5);
    expect(project.hashes.blueprintHash).toHaveLength(64);
  });

  test("rejects out-of-bounds devices", async () => {
    const source = await loaded(); source.blueprint.devices[0]!.position.x = 31;
    expect(issueCodes(() => compileFactoryProject(source))).toContain("geometry.out-of-bounds");
  });

  test("rejects footprint overlap", async () => {
    const source = await loaded(); source.blueprint.devices[1]!.position = { ...source.blueprint.devices[0]!.position };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("geometry.overlap");
  });

  test("rejects incompatible port direction", async () => {
    const source = await loaded(); source.blueprint.connections[0]!.from = { device: "smelter-1", port: "input" };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("port.direction");
  });

  test("rejects unknown material references", async () => {
    const source = await loaded();
    const ore = source.deviceAssets["ore-source"]!;
    if (ore.behavior.kind !== "source") throw new Error("fixture changed"); ore.behavior.material = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.material");
  });

  test("rejects unknown device assets", async () => {
    const source = await loaded(); source.blueprint.devices[0]!.asset = "missing-device";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.device");
  });

  test("rejects unknown and unsupported recipes", async () => {
    const unknown = await loaded(); unknown.blueprint.devices[1]!.config!.recipe = "missing-recipe";
    expect(issueCodes(() => compileFactoryProject(unknown))).toContain("reference.recipe");
    const unsupported = await loaded(); unsupported.blueprint.devices[2]!.config!.recipe = "iron-plate";
    expect(issueCodes(() => compileFactoryProject(unsupported))).toContain("behavior.unsupported-recipe");
  });
});

describe("deterministic discrete-event simulation", () => {
  test("seeded PRNG produces a stable sequence", () => {
    const first = new SeededRandom(42); const second = new SeededRandom(42); const third = new SeededRandom(43);
    const a = Array.from({ length: 8 }, () => first.nextUint32()); const b = Array.from({ length: 8 }, () => second.nextUint32()); const c = Array.from({ length: 8 }, () => third.nextUint32());
    expect(a).toEqual(b); expect(a).not.toEqual(c);
  });
  test("identical inputs and seed produce identical events, state, metrics, and hash", async () => {
    const project = await openFactoryProject(ironworks); const first = runUntil(project, undefined, { seed: 42 }); const second = runUntil(project, undefined, { seed: 42 });
    expect(first).toEqual(second); expect(first.metrics.consumed.gear).toBeGreaterThanOrEqual(10);
  });

  test("transport arrivals preserve configured delay", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const departure = result.events.find((event) => event.type === "material.depart");
    if (!departure || departure.type !== "material.depart") throw new Error("missing departure");
    const arrival = result.events.find((event) => event.type === "material.arrive" && event.transit.id === departure.transit.id);
    if (!arrival) throw new Error("missing arrival");
    expect(arrival.tick - departure.tick).toBe(project.connections[departure.connection]!.travelTicks);
  });

  test("power shortage produces an event and unpowered state", async () => {
    const source = await loaded(); source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1");
    const result = runUntil(compileFactoryProject(source), undefined, { seed: 42, untilTick: 10_000 });
    expect(result.events.some((event) => event.type === "power.shortage")).toBeTrue();
    expect(result.state.devices["ore-source-1"]!.status).toBe("unpowered");
  });

  test("full output buffers block upstream", async () => {
    const result = runUntil(await openFactoryProject(ironworks), undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "buffer.blocked" && event.device === "ore-source-1")).toBeTrue();
    expect(result.metrics.blockedOutputTime["ore-source-1"]).toBeGreaterThan(0);
  });

  test("a full storage Device causes its upstream source to enter blocked-output", async () => {
    const source = await loaded();
    const oreSource = source.blueprint.devices.find((device) => device.id === "ore-source-1")!;
    const generator = source.blueprint.devices.find((device) => device.id === "generator-1")!;
    source.blueprint.devices = [oreSource, generator, { id: "buffer-1", asset: "buffer", position: { x: 10, y: 10 }, rotation: 0 }];
    source.blueprint.connections = [{
      id: "ore-to-buffer", from: { device: "ore-source-1", port: "output" }, to: { device: "buffer-1", port: "input" }, transport: { deviceAsset: "conveyor" },
    }];
    const result = runUntil(compileFactoryProject(source), undefined, { seed: 42 });
    expect(Object.values(result.state.devices["buffer-1"]!.inventory).reduce((sum, count) => sum + count, 0)).toBe(20);
    expect(result.metrics.blockedOutputTime["ore-source-1"]).toBeGreaterThan(0);
    expect(result.events.some((event) => event.type === "buffer.blocked" && event.device === "ore-source-1")).toBeTrue();
  });

  test("visual metadata has no effect on logical execution", async () => {
    const source = await loaded(); const withVisual = compileFactoryProject(clone(source));
    for (const material of Object.values(source.materials)) delete material.visual;
    for (const device of Object.values(source.deviceAssets)) delete device.visual;
    const withoutVisual = compileFactoryProject(source);
    const first = runUntil(withVisual, undefined, { seed: 42 }); const second = runUntil(withoutVisual, undefined, { seed: 42 });
    expect(first.events).toEqual(second.events); expect(first.state).toEqual(second.state); expect(first.metrics).toEqual(second.metrics);
  });

  test("failure scenarios break and recover devices deterministically", async () => {
    const project = await openFactoryProject(ironworks, { scenario: "machine-failure" }); const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "device.breakdown")).toBeTrue();
    expect(result.events.some((event) => event.type === "device.recover")).toBeTrue();
  });
});

describe("research boundary and experiment decisions", () => {
  test("patches cannot edit world assets, scenarios, objectives, or bounds", () => {
    for (const path of ["/materials/iron-ore", "/devices-assets/smelter", "/scenarios/baseline", "/objectives/default", "/bounds/width"]) {
      expect(() => validateResearchPatch([{ op: "replace", path, value: 1 }])).toThrow();
    }
  });

  test("RFC 6902 add creates a candidate without mutating the original", async () => {
    const blueprint = (await loaded()).blueprint; const count = blueprint.devices.length;
    const candidate = applyResearchPatch(blueprint, [{ op: "add", path: "/devices/-", value: { ...blueprint.devices[0], id: "new-source", position: { x: 0, y: 0 } } }]);
    expect(candidate.devices).toHaveLength(count + 1); expect(blueprint.devices).toHaveLength(count);
  });

  test("external command adapter accepts vendor-neutral proposal JSON", async () => {
    const command = `cat >/dev/null; printf '%s' '{"hypothesis":"Use FIFO","patch":[{"op":"replace","path":"/policies","value":{"dispatch":"fifo"}}]}'`;
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const proposal = await new ExternalCommandResearchAgent(command).propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics });
    expect(proposal.hypothesis).toBe("Use FIFO"); expect(proposal.patch[0]!.path).toBe("/policies");
  });

  test("heuristic candidate improves the Ironworks score and is kept", async () => {
    const dir = await projectCopy(); const result = await researchFactory(dir, { iterations: 1, seed: 42, agent: new HeuristicResearchAgent() });
    expect(result.iterations[0]!.decision).toBe("KEEP"); expect(result.bestScore).toBeGreaterThan(result.baseline.score);
  });

  test("worse valid candidate is reverted", async () => {
    const agent: BlueprintResearchAgent = { async propose(input) {
      const index = input.blueprint.connections.findIndex((connection) => connection.id === "gear-to-output");
      return { hypothesis: "Remove finished-goods delivery", patch: [{ op: "remove", path: `/connections/${index}` }] };
    } };
    const dir = await projectCopy(); const result = await researchFactory(dir, { iterations: 1, seed: 42, agent });
    expect(result.iterations[0]!.decision).toBe("REVERT"); expect(result.bestScore).toBe(result.baseline.score);
  });
});

describe("artifacts and renderer-independent projection", () => {
  test("every checked-in demonstration run replays to its recorded result hash", async () => {
    const source = await loaded(); const runs = await listRuns(ironworks);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    for (const run of runs) {
      const blueprint = JSON.parse(await readFile(join(run.path, "blueprint.json"), "utf8"));
      const project = compileFactoryProject({ ...source, blueprint });
      expect(runUntil(project, undefined, { seed: run.manifest.seed }).resultHash).toBe(run.manifest.resultHash);
    }
  });

  test("completed run can be replayed exactly", async () => {
    const dir = await projectCopy(); const project = await openFactoryProject(dir); const result = runUntil(project, undefined, { seed: 42 });
    const run = await writeRunArtifact(project, result, { label: "replay", seed: 42 });
    expect(await verifyRunReplay(project, run, runUntil(project, undefined, { seed: 42 }))).toBeTrue();
    expect((await listRuns(dir))[0]!.manifest.status).toBe("completed");
    expect(JSON.parse(await readFile(join(run.path, "metrics.json"), "utf8")).scoreBreakdown).toBeDefined();
  });

  test("FactorySceneModel is pure serializable data and replays transit", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const base = createFactorySceneModel(project, result.metrics); const frame = replayFactoryEvents(project, result.events, 5000, result.metrics);
    expect(base.devices["smelter-1"]!.assetId).toBe("smelter"); expect(stableStringify(frame)).not.toContain("THREE.");
    expect(() => structuredClone(frame)).not.toThrow();
  });
});
