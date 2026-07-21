import type { CompiledConnection, ResourceId } from "./types";

export function connectionStackSize(connection: CompiledConnection, resource: ResourceId): number {
  return connection.stackSizeByResource[resource] ?? 0;
}

export function connectionCapacityPerMinute(connection: CompiledConnection, resource: ResourceId): number {
  return connectionStackSize(connection, resource) * 60_000 / connection.dispatchIntervalTicks;
}

export function maximumConnectionCapacityPerMinute(connection: CompiledConnection): number {
  return connection.maxStackSize * 60_000 / connection.dispatchIntervalTicks;
}
