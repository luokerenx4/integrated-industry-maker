import type { DeviceStatus, FactoryState, MaterialTransit, Tick } from "./types";

export type FactoryStateMutation =
  | { kind: "tick"; tick: Tick }
  | { kind: "status"; device: string; status: DeviceStatus }
  | { kind: "inventory"; device: string; material: string; delta: number }
  | { kind: "transport.add"; connection: string; transit: MaterialTransit }
  | { kind: "transport.remove"; connection: string; transitId: string }
  | { kind: "produced"; material: string; count: number }
  | { kind: "consumed"; material: string; count: number }
  | { kind: "energy"; consumedMilliJoules: number }
  | { kind: "orders"; count: number }
  | { kind: "job.start"; device: string; tick: Tick; recipe?: string }
  | { kind: "job.finish"; device: string }
  | { kind: "progress"; device: string; progressTicks: Tick };

/** The sole write path for runtime factory state. Systems emit mutations; this reducer owns storage. */
export function mutateFactoryState(state: FactoryState, mutation: FactoryStateMutation): void {
  switch (mutation.kind) {
    case "tick": state.tick = mutation.tick; return;
    case "status": state.devices[mutation.device]!.status = mutation.status; return;
    case "inventory": {
      const inventory = state.devices[mutation.device]!.inventory;
      inventory[mutation.material] = (inventory[mutation.material] ?? 0) + mutation.delta;
      if (inventory[mutation.material] === 0) delete inventory[mutation.material];
      if ((inventory[mutation.material] ?? 0) < 0) throw new Error(`Negative inventory for ${mutation.device}/${mutation.material}`);
      return;
    }
    case "transport.add": state.transports[mutation.connection]!.push(mutation.transit); return;
    case "transport.remove": {
      const transits = state.transports[mutation.connection]!; const index = transits.findIndex((item) => item.id === mutation.transitId);
      if (index < 0) throw new Error(`Unknown transit '${mutation.transitId}' on '${mutation.connection}'`);
      transits.splice(index, 1); return;
    }
    case "produced": state.produced[mutation.material] = (state.produced[mutation.material] ?? 0) + mutation.count; return;
    case "consumed": state.consumed[mutation.material] = (state.consumed[mutation.material] ?? 0) + mutation.count; return;
    case "energy": state.energy.consumedMilliJoules += mutation.consumedMilliJoules; return;
    case "orders": state.completedOrders += mutation.count; return;
    case "job.start": {
      const runtime = state.devices[mutation.device]!; runtime.startedAt = mutation.tick; runtime.progressTicks = 0;
      if (mutation.recipe) runtime.activeRecipe = mutation.recipe; else delete runtime.activeRecipe;
      return;
    }
    case "job.finish": {
      const runtime = state.devices[mutation.device]!; delete runtime.startedAt; delete runtime.progressTicks; delete runtime.activeRecipe; return;
    }
    case "progress": state.devices[mutation.device]!.progressTicks = mutation.progressTicks; return;
  }
}
