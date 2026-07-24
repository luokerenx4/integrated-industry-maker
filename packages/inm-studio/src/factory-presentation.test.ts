import { describe, expect, test } from "bun:test";
import { factoryPresentation, resolveFactoryPresentationMode, type FactoryPresentationScene } from "./factory-presentation";

const scene: FactoryPresentationScene = {
  bounds: { width: 48, height: 32 },
  devices: [
    {
      id: "etch-1",
      position: { x: 8, y: 10 },
      footprint: { width: 3, height: 2 },
      visual: { height: 2.4 },
    },
  ],
  connections: [
    {
      id: "wafer-transfer",
      points: [{ x: 4, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 14 }],
    },
  ],
};

describe("factory presentation policy", () => {
  test("auto uses overview for a wide viewport and work-cell scale for a narrow viewport", () => {
    expect(factoryPresentation(scene, "auto", null, { width: 1024, height: 700 })).toEqual({
      mode: "overview",
      target: { x: 24, y: .9, z: 16 },
      span: { width: 48, height: 32 },
      minimumDistance: 26,
      labelDensity: "priority",
    });
    expect(factoryPresentation(scene, "auto", null, { width: 390, height: 682 })).toMatchObject({
      mode: "work-cell",
      target: { x: 9.5, y: .9, z: 11 },
      span: { height: 18 },
      labelDensity: "all",
    });
    expect(factoryPresentation(scene, "auto", null, { width: 390, height: 682 }).span.width).toBeCloseTo(10.81, 2);
  });

  test("route-backed device selection focuses the object without changing scene geometry", () => {
    const snapshot = structuredClone(scene);
    expect(factoryPresentation(scene, "auto", { kind: "device", id: "etch-1" }, { width: 390, height: 682 })).toEqual({
      mode: "selection",
      target: { x: 9.5, y: .84, z: 11 },
      span: { width: 12, height: 7 },
      minimumDistance: 10,
      labelDensity: "all",
    });
    expect(scene).toEqual(snapshot);
  });

  test("connection focus includes its route extent", () => {
    expect(factoryPresentation(scene, "selection", { kind: "connection", id: "wafer-transfer" }, { width: 1024, height: 700 })).toMatchObject({
      mode: "selection",
      target: { x: 8, y: .35, z: 11 },
      span: { width: 13, height: 11 },
    });
  });

  test("explicit overview preserves selection while overriding automatic focus", () => {
    expect(factoryPresentation(scene, "overview", { kind: "device", id: "etch-1" }, { width: 390, height: 682 }).mode).toBe("overview");
  });

  test("missing route objects fall back to the viewport policy", () => {
    expect(resolveFactoryPresentationMode("selection", 390, false)).toBe("work-cell");
    expect(factoryPresentation(scene, "auto", { kind: "device", id: "missing" }, { width: 1024, height: 700 }).mode).toBe("overview");
  });
});
