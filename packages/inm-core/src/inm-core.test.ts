import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ExternalCommandResearchAgent, HeuristicResearchAgent, InmValidationError, applyResearchPatch, compileFactoryProject, createFactorySceneModel,
  listRuns, loadFactoryProject, openFactoryProject, replayFactoryEvents, researchFactory, runUntil,
  stableStringify, validateResearchPatch, verifyRunReplay, writeRunArtifact, SeededRandom,
  type BlueprintResearchAgent, type DeviceProgram, type LoadedFactoryProject,
} from "./index";

const ironworks = resolve(import.meta.dir, "../../../examples/ironworks");
async function loaded(): Promise<LoadedFactoryProject> { return loadFactoryProject(ironworks); }
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
    expect(Object.keys(project.resources)).toEqual(["gear", "iron-ore", "iron-plate"]);
    expect(project.hashes.blueprintHash).toHaveLength(64);
  });

  test("loads self-contained resource and TypeScript device asset packages", async () => {
    const source = await loaded();
    expect(source.resources.gear!.assetDir.endsWith("assets/resources/gear")).toBeTrue();
    expect(source.deviceAssets.smelter!.runtime.entry).toBe("runtime.ts");
    expect(source.deviceAssets.smelter!.runtimeSourceHash).toHaveLength(64);
    expect(typeof source.deviceAssets.smelter!.program.evaluate).toBe("function");
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

  test("rejects unknown resource references", async () => {
    const source = await loaded();
    source.deviceAssets["ore-source"]!.buffers[0]!.accepts[0] = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
  });

  test("rejects unknown device assets", async () => {
    const source = await loaded(); source.blueprint.devices[0]!.asset = "missing-device";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.device");
  });

  test("lets each device program validate its own configuration", async () => {
    const source = await loaded(); source.blueprint.devices[1]!.config = { operation: "missing-operation" };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("runtime.invalid-config");
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
    const departure = result.events.find((event) => event.type === "resource.depart");
    if (!departure || departure.type !== "resource.depart") throw new Error("missing departure");
    const arrival = result.events.find((event) => event.type === "resource.arrive" && event.transit.id === departure.transit.id);
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
    expect(Object.values(result.state.devices["buffer-1"]!.buffers.storage!).reduce((sum, count) => sum + count, 0)).toBe(20);
    expect(result.metrics.blockedOutputTime["ore-source-1"]).toBeGreaterThan(0);
    expect(result.events.some((event) => event.type === "buffer.blocked" && event.device === "ore-source-1")).toBeTrue();
  });

  test("visual metadata has no effect on logical execution", async () => {
    const withVisual = compileFactoryProject(await loaded()); const source = await loaded();
    for (const resource of Object.values(source.resources)) resource.visual.color = "#ffffff";
    for (const device of Object.values(source.deviceAssets)) device.visual.color = "#000000";
    const recolored = compileFactoryProject(source);
    const first = runUntil(withVisual, undefined, { seed: 42 }); const second = runUntil(recolored, undefined, { seed: 42 });
    expect(first.events).toEqual(second.events); expect(first.state).toEqual(second.state); expect(first.metrics).toEqual(second.metrics);
  });

  test("one TypeScript device program can consume and produce multiple resource streams", async () => {
    const source = await loaded(); const asset = source.deviceAssets.assembler!;
    asset.geometry.ports = [
      { id: "ore-input", direction: "input", kind: "resource", side: "west", offset: 0, buffer: "ore-input" },
      { id: "plate-input", direction: "input", kind: "resource", side: "west", offset: 1, buffer: "plate-input" },
      { id: "gear-output", direction: "output", kind: "resource", side: "east", offset: 0, buffer: "gear-output" },
      { id: "plate-output", direction: "output", kind: "resource", side: "east", offset: 1, buffer: "plate-output" },
    ];
    asset.buffers = [
      { id: "ore-input", role: "input", capacity: 4, accepts: ["iron-ore"] },
      { id: "plate-input", role: "input", capacity: 4, accepts: ["iron-plate"] },
      { id: "gear-output", role: "output", capacity: 4, accepts: ["gear"] },
      { id: "plate-output", role: "output", capacity: 4, accepts: ["iron-plate"] },
    ];
    asset.program = {
      apiVersion: 1,
      evaluate(context) {
        if (!(context.buffers["ore-input"]?.["iron-ore"] && context.buffers["plate-input"]?.["iron-plate"])) return { kind: "wait", reason: "input" };
        return {
          kind: "start", operation: "multi-stream", durationTicks: 500,
          consume: [
            { buffer: "ore-input", resource: "iron-ore", count: 1 },
            { buffer: "plate-input", resource: "iron-plate", count: 1 },
          ],
          produce: [
            { buffer: "gear-output", resource: "gear", count: 1 },
            { buffer: "plate-output", resource: "iron-plate", count: 1 },
          ],
        };
      },
    } satisfies DeviceProgram;
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id === "assembler-1" || device.id === "generator-1");
    source.blueprint.devices.find((device) => device.id === "assembler-1")!.config = {};
    source.blueprint.connections = [];
    source.scenario.durationTicks = 1000;
    source.scenario.initialBuffers = { "assembler-1": { "ore-input": { "iron-ore": 1 }, "plate-input": { "iron-plate": 1 } } };
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 1000 });
    expect(result.metrics.produced.gear).toBe(1);
    expect(result.metrics.produced["iron-plate"]).toBe(1);
  });

  test("failure scenarios break and recover devices deterministically", async () => {
    const project = await openFactoryProject(ironworks, { scenario: "machine-failure" }); const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "device.breakdown")).toBeTrue();
    expect(result.events.some((event) => event.type === "device.recover")).toBeTrue();
  });
});

describe("research boundary and experiment decisions", () => {
  test("patches cannot edit world assets, scenarios, objectives, or bounds", () => {
    for (const path of ["/assets/resources/iron-ore", "/assets/devices/smelter", "/scenarios/baseline", "/objectives/default", "/bounds/width"]) {
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
