import { describe, expect, test } from "bun:test";
import { connectedSceneObjects, normalizeStudioSelection, selectStudioObject, type SelectableStudioScene } from "./selection";

const scene: SelectableStudioScene = {
  devices: [{ id: "source" }, { id: "assembler" }, { id: "sink" }],
  connections: [
    { id: "finished", fromDevice: "assembler", toDevice: "sink" },
    { id: "input", fromDevice: "source", toDevice: "assembler" },
  ],
};

describe("Studio scene selection", () => {
  test("keeps selection scoped to an object in the current project scene", () => {
    expect(normalizeStudioSelection(scene, { kind: "device", id: "assembler" })).toEqual({ kind: "device", id: "assembler" });
    expect(normalizeStudioSelection(scene, { kind: "connection", id: "missing" })).toBeNull();
  });

  test("a second click toggles the same object and connected links stay deterministic", () => {
    expect(selectStudioObject({ kind: "device", id: "assembler" }, { kind: "device", id: "assembler" })).toBeNull();
    expect(selectStudioObject(null, { kind: "connection", id: "input" })).toEqual({ kind: "connection", id: "input" });
    expect(connectedSceneObjects(scene, "assembler")).toEqual([
      { kind: "connection", id: "finished" },
      { kind: "connection", id: "input" },
    ]);
  });
});
