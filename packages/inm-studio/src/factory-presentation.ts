import type { StudioSelection } from "./selection";

export type FactoryPresentationRequest = "auto" | "overview" | "work-cell" | "selection";
export type FactoryPresentationMode = Exclude<FactoryPresentationRequest, "auto">;
export type FactoryLabelDensity = "priority" | "all";

export interface FactoryPresentationScene {
  bounds: { width: number; height: number };
  devices: Array<{
    id: string;
    position: { x: number; y: number };
    footprint: { width: number; height: number };
    visual: { height: number };
    transportEndpoint?: unknown;
  }>;
  connections: Array<{
    id: string;
    points: Array<{ x: number; y: number }>;
  }>;
}

export interface FactoryPresentation {
  mode: FactoryPresentationMode;
  target: { x: number; y: number; z: number };
  span: { width: number; height: number };
  minimumDistance: number;
  labelDensity: FactoryLabelDensity;
}

export const FACTORY_WORK_CELL_BREAKPOINT = 700;

interface ObjectFocus {
  target: FactoryPresentation["target"];
  span: FactoryPresentation["span"];
}

function selectedObjectFocus(scene: FactoryPresentationScene, selection: StudioSelection | null): ObjectFocus | null {
  if (!selection) return null;
  if (selection.kind === "device") {
    const device = scene.devices.find((candidate) => candidate.id === selection.id);
    if (!device) return null;
    return {
      target: {
        x: device.position.x + device.footprint.width / 2,
        y: Math.max(.35, device.visual.height * .35),
        z: device.position.y + device.footprint.height / 2,
      },
      span: {
        width: Math.max(8, device.footprint.width * 4),
        height: Math.max(7, device.footprint.height * 3.5),
      },
    };
  }

  const connection = scene.connections.find((candidate) => candidate.id === selection.id);
  if (!connection?.points.length) return null;
  const xs = connection.points.map((point) => point.x);
  const ys = connection.points.map((point) => point.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  return {
    target: { x: (minimumX + maximumX) / 2, y: .35, z: (minimumY + maximumY) / 2 },
    span: {
      width: Math.max(9, maximumX - minimumX + 5),
      height: Math.max(8, maximumY - minimumY + 5),
    },
  };
}

export function resolveFactoryPresentationMode(
  request: FactoryPresentationRequest,
  viewportWidth: number,
  hasSelectedObject: boolean,
): FactoryPresentationMode {
  if (request === "overview" || request === "work-cell") return request;
  if ((request === "auto" || request === "selection") && hasSelectedObject) return "selection";
  return viewportWidth < FACTORY_WORK_CELL_BREAKPOINT ? "work-cell" : "overview";
}

export function factoryPresentation(
  scene: FactoryPresentationScene,
  request: FactoryPresentationRequest,
  selection: StudioSelection | null,
  viewport: { width: number; height: number },
): FactoryPresentation {
  const focus = selectedObjectFocus(scene, selection);
  const mode = resolveFactoryPresentationMode(request, viewport.width, focus !== null);
  const sceneTarget = { x: scene.bounds.width / 2, y: .35, z: scene.bounds.height / 2 };

  if (mode === "selection" && focus) {
    return {
      mode,
      target: focus.target,
      span: focus.span,
      minimumDistance: 10,
      labelDensity: "all",
    };
  }
  if (mode === "work-cell") {
    const equipment = scene.devices.filter((device) => !device.transportEndpoint);
    const workCellTarget = equipment.length ? {
      x: equipment.reduce((sum, device) => sum + device.position.x + device.footprint.width / 2, 0) / equipment.length,
      y: .35,
      z: equipment.reduce((sum, device) => sum + device.position.y + device.footprint.height / 2, 0) / equipment.length,
    } : sceneTarget;
    const viewportAspect = Math.max(.55, viewport.width / Math.max(1, viewport.height));
    return {
      mode,
      target: workCellTarget,
      span: {
        width: Math.min(scene.bounds.width, 24, 18 * viewportAspect * 1.05),
        height: Math.min(scene.bounds.height, 18),
      },
      minimumDistance: 14,
      labelDensity: "all",
    };
  }
  return {
    mode: "overview",
    target: sceneTarget,
    span: { ...scene.bounds },
    minimumDistance: 26,
    labelDensity: "priority",
  };
}
