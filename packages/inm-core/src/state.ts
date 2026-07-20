import type { ActiveDeviceJob, DeviceStatus, FactoryState, ResourceTransit, Tick } from "./types";

export type FactoryStateMutation =
  | { kind: "tick"; tick: Tick }
  | { kind: "status"; device: string; status: DeviceStatus }
  | { kind: "buffer"; device: string; buffer: string; resource: string; delta: number }
  | { kind: "transport.add"; connection: string; transit: ResourceTransit }
  | { kind: "transport.remove"; connection: string; transitId: string }
  | { kind: "produced"; resource: string; count: number }
  | { kind: "consumed"; resource: string; count: number }
  | { kind: "energy"; consumedMilliJoules: number }
  | { kind: "orders"; count: number }
  | { kind: "job.start"; device: string; job: ActiveDeviceJob }
  | { kind: "job.finish"; device: string }
  | { kind: "progress"; device: string; progressTicks: Tick };

/** The sole write path for runtime factory state. Asset scripts can return actions but cannot mutate this store. */
export function mutateFactoryState(state: FactoryState, mutation: FactoryStateMutation): void {
  switch (mutation.kind) {
    case "tick": state.tick = mutation.tick; return;
    case "status": state.devices[mutation.device]!.status = mutation.status; return;
    case "buffer": {
      const inventory = state.devices[mutation.device]!.buffers[mutation.buffer];
      if (!inventory) throw new Error(`Unknown buffer for ${mutation.device}/${mutation.buffer}`);
      inventory[mutation.resource] = (inventory[mutation.resource] ?? 0) + mutation.delta;
      if (inventory[mutation.resource] === 0) delete inventory[mutation.resource];
      if ((inventory[mutation.resource] ?? 0) < 0) throw new Error(`Negative buffer quantity for ${mutation.device}/${mutation.buffer}/${mutation.resource}`);
      return;
    }
    case "transport.add": state.transports[mutation.connection]!.push(mutation.transit); return;
    case "transport.remove": {
      const transits = state.transports[mutation.connection]!; const index = transits.findIndex((item) => item.id === mutation.transitId);
      if (index < 0) throw new Error(`Unknown transit '${mutation.transitId}' on '${mutation.connection}'`);
      transits.splice(index, 1); return;
    }
    case "produced": state.produced[mutation.resource] = (state.produced[mutation.resource] ?? 0) + mutation.count; return;
    case "consumed": state.consumed[mutation.resource] = (state.consumed[mutation.resource] ?? 0) + mutation.count; return;
    case "energy": state.energy.consumedMilliJoules += mutation.consumedMilliJoules; return;
    case "orders": state.completedOrders += mutation.count; return;
    case "job.start": state.devices[mutation.device]!.activeJob = structuredClone(mutation.job); state.devices[mutation.device]!.progressTicks = 0; return;
    case "job.finish": delete state.devices[mutation.device]!.activeJob; delete state.devices[mutation.device]!.progressTicks; return;
    case "progress": state.devices[mutation.device]!.progressTicks = mutation.progressTicks; return;
  }
}
